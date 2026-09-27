/**
 * Mail account configuration, read ONLY from environment variables:
 *
 *   GMAIL_USER          the Gmail account that authenticates (SMTP + IMAP)
 *   GMAIL_APP_PASSWORD  a Google App Password (requires 2-Step Verification)
 *   MAIL_FROM_ADDRESS   the From address — a verified Gmail "Send mail as" alias
 *   MAIL_FROM_NAME      display name shown to recipients
 *
 * Secrets never touch the database or the browser.
 */

export interface MailConfig {
  user: string;
  appPassword: string;
  fromAddress: string;
  fromName: string;
}

type Env = Record<string, string | undefined>;

/** Parse mail config from env. Returns null when credentials are missing. */
export function readMailConfig(env: Env = process.env): MailConfig | null {
  const user = env.GMAIL_USER?.trim();
  // Google shows app passwords as "abcd efgh ijkl mnop" — spaces are not part of it.
  const appPassword = env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !appPassword) return null;
  const fromAddress = env.MAIL_FROM_ADDRESS?.trim() || user;
  const fromName = env.MAIL_FROM_NAME?.trim() || "WarlyWorks";
  return { user, appPassword, fromAddress, fromName };
}

/** RFC 5322 From header: `"Name" <address>` with quotes escaped. */
export function formatFrom(cfg: Pick<MailConfig, "fromAddress" | "fromName">): string {
  const name = cfg.fromName.replace(/["\\]/g, "");
  return `"${name}" <${cfg.fromAddress}>`;
}

/** Addresses that belong to us (never treat mail from them as a prospect reply). */
export function ownAddresses(cfg: MailConfig | null): string[] {
  if (!cfg) return [];
  return Array.from(new Set([cfg.user.toLowerCase(), cfg.fromAddress.toLowerCase()]));
}

/** Domain part of the From address, used to build Message-IDs. */
export function fromDomain(cfg: Pick<MailConfig, "fromAddress">): string {
  return cfg.fromAddress.split("@")[1]?.toLowerCase() || "localhost";
}
