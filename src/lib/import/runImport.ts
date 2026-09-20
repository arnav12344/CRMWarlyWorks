/**
 * Import service: ties the whole pipeline together.
 *
 *   parse file
 *     -> extract nested JSON & flatten parent/subtask scraper rows
 *     -> REDACT secrets (never persisted)
 *     -> apply column mapping
 *     -> dedupe organizations
 *     -> create Organizations + Contacts (deriving emailDomain / isRoleInbox)
 *     -> record ImportBatch + ImportRow provenance (redacted raw only)
 *     -> log Activity entries
 *     -> return a summary
 *
 * The pure planning stage (`buildImportPlan`) is separated from persistence
 * (`runImport`) so it can be unit-tested end to end without a database, and so
 * we can prove no secret survives into the plan.
 */

import { prisma } from "@/lib/db";
import { parseFile } from "./parseFile";
import {
  flattenScraperRows,
  DEFAULT_JSON_COLUMNS,
  type BusinessCandidate,
} from "./extractNestedJson";
import { redactSecrets } from "./redactSecrets";
import { dedupeOrganizations, computeDedupeKey } from "./dedupe";
import { emailDomain, isRoleInbox } from "./email";
import type { ColumnMapping, ImportConfig } from "./mapping";

/** A planned organization ready to be persisted. */
export interface PlannedOrg {
  dedupeKey: string;
  name: string;
  website?: string;
  domain?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  categories?: string;
  contacts: PlannedContact[];
  mergedCount: number;
}

/** A planned contact belonging to a planned organization. */
export interface PlannedContact {
  email?: string;
  emailDomain?: string;
  isRoleInbox: boolean;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
}

export interface ImportPlan {
  orgs: PlannedOrg[];
  /** Redacted raw rows, safe to persist for provenance. */
  redactedRows: Record<string, unknown>[];
  rowCount: number;
  orgCount: number;
  contactCount: number;
  redactedSecretCount: number;
  rowsWithNestedJson: number;
  /** A small preview for the UI summary. */
  sample: Array<{ name: string; email?: string; city?: string; domain?: string }>;
}

/** Split a full name into first/last (best-effort). */
function splitName(full?: string): { firstName?: string; lastName?: string } {
  if (!full) return {};
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Pick a value from a candidate given the mapped source field name. */
function mapped(
  candidate: BusinessCandidate,
  mapping: ColumnMapping,
  field: keyof ColumnMapping,
  canonicalFallback?: keyof Omit<BusinessCandidate, "extra">
): string | undefined {
  const source = mapping[field];
  if (source) {
    // Mapping may point at a canonical business field or an "extra" field.
    const asCanonical = (candidate as unknown as Record<string, unknown>)[
      source
    ];
    if (typeof asCanonical === "string" && asCanonical.trim()) {
      return asCanonical.trim();
    }
    const asExtra = candidate.extra[source];
    if (typeof asExtra === "string" && asExtra.trim()) return asExtra.trim();
  }
  if (canonicalFallback && candidate[canonicalFallback]) {
    return candidate[canonicalFallback];
  }
  return undefined;
}

/**
 * Build a full import plan from raw rows WITHOUT touching the database. Every
 * value in the plan (and in `redactedRows`) has passed through redaction, so no
 * secret ever leaves this function.
 */
export function buildImportPlan(
  rawRows: Record<string, unknown>[],
  config: ImportConfig
): ImportPlan {
  const mapping = config.mapping ?? {};
  const jsonColumns = config.jsonColumns ?? DEFAULT_JSON_COLUMNS;

  // 1. Redact secrets from the raw rows up front. Everything downstream reads
  //    from the redacted copy, guaranteeing secrets never reach the DB.
  let redactedSecretCount = 0;
  const redactedRows = rawRows.map((row) => {
    const { value, redactedCount } = redactSecrets(row);
    redactedSecretCount += redactedCount;
    return value;
  });

  // 2. Extract & flatten businesses from the (already redacted) rows.
  const { candidates, rowsWithNestedJson } = flattenScraperRows(
    redactedRows,
    { jsonColumns }
  );

  // 3. Map each candidate onto CRM fields, defensively redacting once more.
  const mappedCandidates = candidates.map((raw) => {
    const { value: candidate } = redactSecrets(raw);
    const name = mapped(candidate, mapping, "orgName", "name");
    const website = mapped(candidate, mapping, "orgWebsite", "website");
    const email = mapped(candidate, mapping, "contactEmail", "email");
    return {
      name: name ?? "",
      website,
      email,
      phone: mapped(candidate, mapping, "orgPhone", "phone"),
      address: mapped(candidate, mapping, "orgAddress", "address"),
      city: mapped(candidate, mapping, "orgCity", "city"),
      country: mapped(candidate, mapping, "orgCountry", "country"),
      categories: mapped(candidate, mapping, "orgCategories", "categories"),
      fullName: mapped(candidate, mapping, "contactFullName", "fullName"),
      title: mapped(candidate, mapping, "contactTitle", "title"),
    };
  });

  // 4. Dedupe organizations by normalized domain (else name+city).
  const deduped = dedupeOrganizations(mappedCandidates);

  // Group ALL candidates by dedupe key so multiple contacts attach to one org.
  const contactsByKey = new Map<string, PlannedContact[]>();
  for (const cand of mappedCandidates) {
    const key = computeDedupeKey(cand);
    if (!key) continue;
    if (!cand.email && !cand.fullName) continue;
    const list = contactsByKey.get(key) ?? [];
    // Avoid duplicate identical emails within one org.
    if (cand.email && list.some((c) => c.email === cand.email)) continue;
    const nameParts = splitName(cand.fullName);
    list.push({
      email: cand.email || undefined,
      emailDomain: emailDomain(cand.email),
      isRoleInbox: isRoleInbox(cand.email),
      fullName: cand.fullName || undefined,
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      title: cand.title || undefined,
    });
    contactsByKey.set(key, list);
  }

  const orgs: PlannedOrg[] = deduped
    .filter((d) => d.record.name && d.record.name.trim())
    .map((d) => {
      const website = d.record.website;
      const domain =
        normalizeDomainSafe(website) ?? normalizeDomainSafe(d.record.email);
      return {
        dedupeKey: d.dedupeKey,
        name: d.record.name!,
        website,
        domain,
        phone: d.record.phone,
        address: d.record.address,
        city: d.record.city,
        country: d.record.country,
        categories: d.record.categories,
        contacts: contactsByKey.get(d.dedupeKey) ?? [],
        mergedCount: d.mergedCount,
      };
    });

  const contactCount = orgs.reduce((n, o) => n + o.contacts.length, 0);
  const sample = orgs.slice(0, 5).map((o) => ({
    name: o.name,
    email: o.contacts[0]?.email,
    city: o.city,
    domain: o.domain,
  }));

  return {
    orgs,
    redactedRows,
    rowCount: rawRows.length,
    orgCount: orgs.length,
    contactCount,
    redactedSecretCount,
    rowsWithNestedJson,
    sample,
  };
}

/** Local domain normalizer that never throws. */
function normalizeDomainSafe(input?: string): string | undefined {
  if (!input) return undefined;
  try {
    // Reuse the dedupe normalizer indirectly via computeDedupeKey semantics.
    const key = computeDedupeKey({ website: input, email: input });
    if (key && key.startsWith("domain:")) return key.slice("domain:".length);
  } catch {
    // ignore
  }
  return undefined;
}

export interface ImportSummary {
  batchId: string;
  filename: string;
  rowCount: number;
  orgCount: number;
  contactCount: number;
  redactedSecretCount: number;
  rowsWithNestedJson: number;
  sample: ImportPlan["sample"];
}

export interface RunImportInput {
  buffer: Buffer;
  filename: string;
  config: ImportConfig;
}

/**
 * Full import: parse the file, build the plan, and persist Organizations,
 * Contacts, provenance rows, and activities. Returns a summary.
 *
 * Organizations are upserted by dedupeKey so repeated imports merge rather than
 * duplicate. Only the REDACTED raw rows are stored in ImportRow.raw.
 */
export async function runImport(input: RunImportInput): Promise<ImportSummary> {
  const { buffer, filename, config } = input;
  const parsed = parseFile(buffer, filename);
  const plan = buildImportPlan(parsed.rows, config);
  const contactTypeId = config.contactTypeId || null;

  const batch = await prisma.importBatch.create({
    data: {
      filename,
      rowCount: plan.rowCount,
      orgCount: plan.orgCount,
      contactCount: plan.contactCount,
      redactedSecretCount: plan.redactedSecretCount,
    },
  });

  // Store redacted provenance rows.
  if (plan.redactedRows.length) {
    await prisma.importRow.createMany({
      data: plan.redactedRows.map((r) => ({
        importBatchId: batch.id,
        raw: JSON.stringify(r),
      })),
    });
  }

  for (const org of plan.orgs) {
    const savedOrg = await prisma.organization.upsert({
      where: { dedupeKey: org.dedupeKey },
      update: {
        // Fill gaps only; do not clobber existing curated data with blanks.
        website: org.website || undefined,
        domain: org.domain || undefined,
        phone: org.phone || undefined,
        address: org.address || undefined,
        city: org.city || undefined,
        country: org.country || undefined,
        contactTypeId: contactTypeId || undefined,
      },
      create: {
        name: org.name,
        website: org.website || null,
        domain: org.domain || null,
        phone: org.phone || null,
        address: org.address || null,
        city: org.city || null,
        country: org.country || null,
        contactTypeId,
        source: `import:${filename}`,
        dedupeKey: org.dedupeKey,
        rawImportRef: batch.id,
        // Categories (if any) are appended to notes rather than a dedicated
        // column, which the schema does not define.
        notes: org.categories ? `Categories: ${org.categories}` : null,
      },
    });

    for (const contact of org.contacts) {
      // Skip contacts with no identifying info.
      if (!contact.email && !contact.fullName) continue;

      // Avoid duplicate contact rows for the same email under the same org.
      if (contact.email) {
        const existing = await prisma.contact.findFirst({
          where: { organizationId: savedOrg.id, email: contact.email },
          select: { id: true },
        });
        if (existing) continue;
      }

      const created = await prisma.contact.create({
        data: {
          organizationId: savedOrg.id,
          email: contact.email || null,
          emailDomain: contact.emailDomain || null,
          isRoleInbox: contact.isRoleInbox,
          fullName: contact.fullName || null,
          firstName: contact.firstName || null,
          lastName: contact.lastName || null,
          title: contact.title || null,
          source: `import:${filename}`,
        },
      });

      await prisma.activity.create({
        data: {
          contactId: created.id,
          type: "imported",
          summary: `Imported from ${filename}`,
          meta: JSON.stringify({
            batchId: batch.id,
            organization: savedOrg.name,
            isRoleInbox: contact.isRoleInbox,
          }),
        },
      });
    }
  }

  return {
    batchId: batch.id,
    filename,
    rowCount: plan.rowCount,
    orgCount: plan.orgCount,
    contactCount: plan.contactCount,
    redactedSecretCount: plan.redactedSecretCount,
    rowsWithNestedJson: plan.rowsWithNestedJson,
    sample: plan.sample,
  };
}
