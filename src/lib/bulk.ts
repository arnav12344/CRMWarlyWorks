/**
 * Bulk draft builder for "Write & send": render one template for many leads.
 * Pure (no I/O) so it is unit-tested; the API route loads data and persists.
 */
import { contactMergeContext, renderEmail, type MergeSnippet } from "./merge";
import { normalizeEmail } from "./email";
import { isReservedDomain } from "./outreach";

export interface BulkContact {
  id: string;
  email: string | null;
  suppressed: boolean;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  title: string | null;
  organization: {
    name: string | null;
    city: string | null;
    country: string | null;
    contactType?: { name: string } | null;
  } | null;
}

export interface BulkDraft {
  contactId: string;
  toAddress: string;
  subject: string;
  body: string;
  /** Unresolved merge fields — the email is created but Send will block until fixed. */
  missing: string[];
}

export interface BulkResult {
  drafts: BulkDraft[];
  skipped: Array<{ contactId: string; reason: string }>;
}

export function buildBulkDrafts(input: {
  contacts: BulkContact[];
  template: { subject: string; body: string };
  snippets: MergeSnippet[];
  suppressedEmails: Set<string>;
  alreadyQueued?: Set<string>;
}): BulkResult {
  const drafts: BulkDraft[] = [];
  const skipped: BulkResult["skipped"] = [];

  for (const c of input.contacts) {
    const email = normalizeEmail(c.email);
    if (!email) {
      skipped.push({ contactId: c.id, reason: "no email" });
      continue;
    }
    if (c.suppressed || input.suppressedEmails.has(email)) {
      skipped.push({ contactId: c.id, reason: "suppressed" });
      continue;
    }
    if (isReservedDomain(email)) {
      skipped.push({ contactId: c.id, reason: "demo address" });
      continue;
    }
    if (input.alreadyQueued?.has(c.id)) {
      skipped.push({ contactId: c.id, reason: "already in Ready to send" });
      continue;
    }
    const context = contactMergeContext({ ...c, email });
    const rendered = renderEmail(input.template, context, input.snippets);
    drafts.push({
      contactId: c.id,
      toAddress: email,
      subject: rendered.subject,
      body: rendered.body,
      missing: [...rendered.missing, ...rendered.missingSnippets.map((s) => `snippet:${s}`)],
    });
  }
  return { drafts, skipped };
}
