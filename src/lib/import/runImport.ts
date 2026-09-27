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
import { normalizeEmail } from "@/lib/email";
import type { ColumnMapping, ImportConfig } from "./mapping";
import { nextOffset } from "./chunk";

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

/** Most emails kept per organization (scraper exports can list 20+ branch inboxes). */
export const MAX_EMAILS_PER_ORG = 5;

const EMAIL_TOKEN = /[A-Z0-9._%+'-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;

/** Pull every valid, normalized, de-duplicated email out of a free-text list. */
export function parseEmailList(value?: string | null): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const m of value.match(EMAIL_TOKEN) ?? []) {
    const e = normalizeEmail(m.replace(/^[.'-]+|[.'-]+$/g, ""));
    // Skip obvious non-contact artefacts (image names, sentry/wix placeholders).
    if (!e || /\.(png|jpe?g|gif|webp|svg)$/.test(e) || /(sentry|wixpress|example\.com)/.test(e)) continue;
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

/** Column names (besides the mapped one) that scraper exports use for emails. */
const EMAIL_COLUMN_RE = /^(recommended[_ -]?emails?|emails?|e[_-]?mails?|email[_-]?addresses|emails?[_-]?\d+|contact[_-]?emails?)$/i;

/**
 * All emails for a candidate: the scraper's "recommended" pick first, then the
 * mapped column, then any other email-like column. Capped per organization.
 */
function candidateEmails(candidate: BusinessCandidate, mappedValue?: string): string[] {
  const recommended: string[] = [];
  const others: string[] = [];
  for (const [key, val] of Object.entries(candidate.extra)) {
    if (!EMAIL_COLUMN_RE.test(key.trim())) continue;
    (/recommended/i.test(key) ? recommended : others).push(val);
  }
  const all = [
    ...recommended.flatMap(parseEmailList),
    ...parseEmailList(mappedValue),
    ...parseEmailList(candidate.email),
    ...others.flatMap(parseEmailList),
  ];
  return [...new Set(all)];
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
    const emails = candidateEmails(candidate, mapped(candidate, mapping, "contactEmail", "email"));
    return {
      name: name ?? "",
      website,
      // First email is used for dedupe/domain fallback; all are imported below.
      email: emails[0],
      emails,
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
    if (!cand.emails.length && !cand.fullName) continue;
    const list = contactsByKey.get(key) ?? [];
    const nameParts = splitName(cand.fullName);
    if (!cand.emails.length) {
      // A named person without an email: keep them (no duplicates by name).
      if (!list.some((c) => !c.email && c.fullName === cand.fullName)) {
        list.push({
          isRoleInbox: false,
          fullName: cand.fullName || undefined,
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
          title: cand.title || undefined,
        });
      }
      contactsByKey.set(key, list);
      continue;
    }
    cand.emails.forEach((email, i) => {
      // Emails are already normalized; skip duplicates and respect the cap.
      if (list.some((c) => c.email === email)) return;
      if (list.filter((c) => c.email).length >= MAX_EMAILS_PER_ORG) return;
      // A named person belongs to the first address only.
      const person = i === 0 && cand.fullName && !isRoleInbox(email);
      list.push({
        email,
        emailDomain: emailDomain(email),
        isRoleInbox: isRoleInbox(email),
        fullName: person ? cand.fullName : undefined,
        firstName: person ? nameParts.firstName : undefined,
        lastName: person ? nameParts.lastName : undefined,
        title: i === 0 ? cand.title || undefined : undefined,
      });
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

type Db = typeof prisma;

/**
 * Save an organization's planned contacts, skipping ones that already exist
 * (same email, or same name for people without an email). An organization
 * with no email at all still gets one "no email" lead row so it shows up in
 * Leads (with its phone/website); that row is upgraded in place if a later
 * import finds an email for it.
 */
export async function persistOrgContacts(
  db: Db,
  input: {
    organizationId: string;
    organizationName: string;
    contacts: PlannedContact[];
    source: string;
    batchId: string;
  }
): Promise<{ created: number; upgraded: number }> {
  const existing = await db.contact.findMany({
    where: { organizationId: input.organizationId },
    select: { id: true, email: true, fullName: true },
  });
  const emails = new Set(existing.map((c) => c.email).filter(Boolean));
  const names = new Set(existing.filter((c) => !c.email && c.fullName).map((c) => c.fullName));
  let placeholder = existing.find((c) => !c.email && !c.fullName) ?? null;
  let created = 0;
  let upgraded = 0;

  const log = (contactId: string, isRoleInbox: boolean) =>
    db.activity.create({
      data: {
        contactId,
        type: "imported",
        summary: `Imported from ${input.source.replace(/^import:/, "")}`,
        meta: JSON.stringify({ batchId: input.batchId, organization: input.organizationName, isRoleInbox }),
      },
    });

  for (const c of input.contacts) {
    if (c.email ? emails.has(c.email) : !c.fullName || names.has(c.fullName)) continue;
    const data = {
      email: c.email || null,
      emailDomain: c.emailDomain || null,
      isRoleInbox: c.isRoleInbox,
      fullName: c.fullName || null,
      firstName: c.firstName || null,
      lastName: c.lastName || null,
      title: c.title || null,
    };
    if (c.email && placeholder) {
      await db.contact.update({ where: { id: placeholder.id }, data });
      await log(placeholder.id, c.isRoleInbox);
      placeholder = null;
      upgraded += 1;
    } else {
      const row = await db.contact.create({
        data: { ...data, organizationId: input.organizationId, source: input.source },
      });
      await log(row.id, c.isRoleInbox);
      created += 1;
    }
    if (c.email) emails.add(c.email);
    else if (c.fullName) names.add(c.fullName);
  }

  if (existing.length === 0 && created === 0) {
    const row = await db.contact.create({
      data: { organizationId: input.organizationId, source: input.source, isRoleInbox: false },
    });
    await log(row.id, false);
    created += 1;
  }
  return { created, upgraded };
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
  /** Orgs handled in THIS request. */
  processedOrgs: number;
  contactsCreated: number;
  /** Offset for the next request, or null when the import is finished. */
  nextOffset: number | null;
}

export interface RunImportInput {
  buffer: Buffer;
  filename: string;
  config: ImportConfig;
  /** Chunking: process plan.orgs[offset, offset+limit). */
  offset?: number;
  limit?: number;
  /** Batch created by the first chunk; later chunks reuse it. */
  batchId?: string | null;
}

/**
 * Import one CHUNK: parse the file, build the (deterministic) plan, and
 * persist organizations [offset, offset+limit) with their contacts. The first
 * chunk also records the ImportBatch + redacted provenance rows. The browser
 * calls this repeatedly until `nextOffset` is null, so no single request runs
 * long enough to hit the serverless time limit.
 *
 * Organizations are upserted by dedupeKey so repeated imports merge rather than
 * duplicate. Only the REDACTED raw rows are stored in ImportRow.raw.
 */
export async function runImport(input: RunImportInput): Promise<ImportSummary> {
  const { buffer, filename, config } = input;
  const parsed = parseFile(buffer, filename);
  const plan = buildImportPlan(parsed.rows, config);
  const contactTypeId = config.contactTypeId || null;
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.max(1, input.limit ?? plan.orgs.length);

  let batchId = input.batchId ?? null;
  if (!batchId) {
    const batch = await prisma.importBatch.create({
      data: {
        filename,
        rowCount: plan.rowCount,
        orgCount: plan.orgCount,
        contactCount: plan.contactCount,
        redactedSecretCount: plan.redactedSecretCount,
      },
    });
    batchId = batch.id;
    if (plan.redactedRows.length) {
      await prisma.importRow.createMany({
        data: plan.redactedRows.map((r) => ({ importBatchId: batch.id, raw: JSON.stringify(r) })),
      });
    }
  }
  const batch = { id: batchId };

  const window = plan.orgs.slice(offset, offset + limit);
  let contactsCreated = 0;

  for (const org of window) {
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

    const r = await persistOrgContacts(prisma, {
      organizationId: savedOrg.id,
      organizationName: savedOrg.name,
      contacts: org.contacts,
      source: `import:${filename}`,
      batchId: batch.id,
    });
    contactsCreated += r.created;
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
    processedOrgs: window.length,
    contactsCreated,
    nextOffset: nextOffset(offset, window.length, plan.orgs.length),
  };
}
