/**
 * Email helpers used by the importer: domain derivation and role-inbox
 * detection.
 *
 * A "role inbox" is a shared, non-personal mailbox (info@, admissions@, ...).
 * These are flagged so outreach can be personalized only when a real named
 * individual is on the other end.
 */

/** Local-parts that indicate a shared / role mailbox rather than a person. */
export const ROLE_INBOX_LOCALPARTS = new Set([
  "info",
  "admissions",
  "enquiry",
  "enquiries",
  "hello",
  "contact",
  "admin",
  "office",
  "general",
  "generaloffice",
  "reception",
  "sales",
  "support",
  "team",
  "hr",
  "careers",
  "marketing",
  "mail",
  "enquire",
  "inquiry",
  "inquiries",
]);

/** Extract the lowercased domain from an email address. */
export function emailDomain(email?: string | null): string | undefined {
  if (!email) return undefined;
  const value = String(email).trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 0) return undefined;
  const domain = value.slice(at + 1).trim();
  return domain.length ? domain : undefined;
}

/** True when the email is a shared / role inbox (info@, admissions@, ...). */
export function isRoleInbox(email?: string | null): boolean {
  if (!email) return false;
  const value = String(email).trim().toLowerCase();
  const at = value.indexOf("@");
  if (at <= 0) return false;
  const local = value.slice(0, at);
  // Handle plus-addressing (info+foo@...) and dotted variants (admissions.uk@).
  const base = local.split("+")[0]?.split(".")[0] ?? local;
  return ROLE_INBOX_LOCALPARTS.has(local) || ROLE_INBOX_LOCALPARTS.has(base);
}
