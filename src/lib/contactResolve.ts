/**
 * Shared contact/organization resolution used when logging or composing an
 * email against an address that may or may not already be a lead.
 *
 * A work-domain address joins the organization already imported for that
 * domain; a free-mail address (gmail, etc.) never groups contacts by domain.
 */

import type { PrismaClient } from "@prisma/client";
import { normalizeEmail } from "./email";
import { computeDedupeKey, normalizeDomain } from "./import/dedupe";
import { isRoleInbox } from "./import/email";

type Db = PrismaClient;

/** Personal-mailbox domains: never used to group contacts into one organization. */
export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.com.sg",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "singnet.com.sg",
  "protonmail.com",
  "proton.me",
]);

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Find an organization for a new contact, creating one when a name is given. */
export async function resolveOrganization(
  db: Db,
  email: string,
  orgName: string | undefined
): Promise<string | null> {
  const domain = normalizeDomain(email);
  const companyDomain = domain && !FREE_MAIL_DOMAINS.has(domain) ? domain : undefined;

  // A work address joins the org already imported for that domain.
  if (companyDomain) {
    const byDomain = await db.organization.findFirst({ where: { dedupeKey: `domain:${companyDomain}` } });
    if (byDomain) return byDomain.id;
  }

  const name = orgName?.trim();
  if (!name) return null;

  const dedupeKey = computeDedupeKey({ name, email: companyDomain ? email : undefined });
  if (!dedupeKey) return null;
  const existing = await db.organization.findFirst({ where: { dedupeKey } });
  if (existing) return existing.id;

  const created = await db.organization.create({
    data: { name, domain: companyDomain ?? null, dedupeKey, source: "manual" },
  });
  return created.id;
}

export interface ContactRow {
  id: string;
  email: string | null;
  suppressed?: boolean;
}

export type ResolveContactResult =
  | { ok: true; contact: ContactRow; createdContact: boolean }
  | { ok: false; code: "invalid" | "not_found"; reason: string };

/**
 * Resolve a contact by id, or find/create one by email (creating an org when a
 * work domain or org name allows). Mirrors the behavior in manualLog.
 */
export async function resolveContact(
  db: Db,
  input: { contactId?: string; email?: string; fullName?: string; orgName?: string }
): Promise<ResolveContactResult> {
  if (input.contactId) {
    const contact = (await db.contact.findUnique({ where: { id: input.contactId } })) as ContactRow | null;
    if (!contact) return { ok: false, code: "not_found", reason: "Contact not found." };
    return { ok: true, contact, createdContact: false };
  }

  const email = normalizeEmail(input.email);
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, code: "invalid", reason: "Enter a valid email address." };
  }
  const existing = (await db.contact.findFirst({ where: { email } })) as ContactRow | null;
  if (existing) return { ok: true, contact: existing, createdContact: false };

  const organizationId = await resolveOrganization(db, email, input.orgName);
  const created = (await db.contact.create({
    data: {
      email,
      emailDomain: normalizeDomain(email) ?? null,
      fullName: input.fullName?.trim() || null,
      isRoleInbox: isRoleInbox(email),
      organizationId,
      source: "manual",
    },
  })) as ContactRow;
  return { ok: true, contact: created, createdContact: true };
}
