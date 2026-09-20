/**
 * Shared, offline heuristics used by the mock verifier and by the aggregation
 * layer's role-inbox detection. These never make network calls.
 */

/** Local-parts that indicate a shared / role mailbox rather than a person. */
export const ROLE_LOCALPARTS = new Set([
  "info",
  "admin",
  "administrator",
  "office",
  "contact",
  "hello",
  "hi",
  "enquiry",
  "enquiries",
  "inquiry",
  "inquiries",
  "admissions",
  "sales",
  "support",
  "help",
  "team",
  "mail",
  "email",
  "general",
  "reception",
  "billing",
  "accounts",
  "hr",
  "careers",
  "jobs",
  "marketing",
  "press",
  "media",
  "noreply",
  "no-reply",
  "donotreply",
  "webmaster",
  "postmaster",
]);

/** Common free-mailbox providers. */
export const FREE_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "zoho.com",
  "yandex.com",
]);

/** Common disposable / throwaway domains. */
export const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "trashmail.com",
  "yopmail.com",
  "throwawaymail.com",
  "getnada.com",
  "dispostable.com",
  "sharklasers.com",
  "maildrop.cc",
  "fakeinbox.com",
]);

/** Lowercase, trimmed domain from an email; undefined if malformed. */
export function domainOf(email: string): string | undefined {
  const value = String(email).trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0) return undefined;
  const domain = value.slice(at + 1).trim();
  return domain.length ? domain : undefined;
}

/** Lowercase, trimmed local-part from an email; undefined if malformed. */
export function localPartOf(email: string): string | undefined {
  const value = String(email).trim().toLowerCase();
  const at = value.indexOf("@");
  if (at <= 0) return undefined;
  return value.slice(0, at);
}

/**
 * Role-inbox detection from the local-part alone (info@, admissions@, ...).
 * Handles plus-addressing (info+x@) and dotted variants (admissions.uk@).
 */
export function isRoleLocalPart(email: string): boolean {
  const local = localPartOf(email);
  if (!local) return false;
  if (ROLE_LOCALPARTS.has(local)) return true;
  const base = local.split("+")[0]?.split(".")[0] ?? local;
  return ROLE_LOCALPARTS.has(base);
}

export function isFreeDomain(email: string): boolean {
  const d = domainOf(email);
  return d ? FREE_DOMAINS.has(d) : false;
}

export function isDisposableDomain(email: string): boolean {
  const d = domainOf(email);
  return d ? DISPOSABLE_DOMAINS.has(d) : false;
}
