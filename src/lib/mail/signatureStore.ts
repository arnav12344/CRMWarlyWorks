/**
 * Signature persistence (Setting table) + "Import from Gmail".
 *
 * The import reads your Gmail "Sent" folder over IMAP (same App Password as
 * the inbox sync), newest first, and takes the signature block from the first
 * email you sent from Gmail itself. Emails the CRM sent have no Gmail
 * signature block, so they are skipped automatically.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { readMailConfig } from "./config";
import { extractGmailSignature, sanitizeSignatureHtml, signatureFromHtml, MAX_SIGNATURE_HTML, type Signature } from "./signature";
import { getPlainSetting, saveSetting, SETTING_KEYS } from "../verify/settings";

export interface StoredSignature extends Signature {
  source: "gmail" | "manual";
  updatedAt: string;
}

/** The saved signature, or null when none is set. */
export async function getSignature(): Promise<StoredSignature | null> {
  const raw = await getPlainSetting(SETTING_KEYS.emailSignature, "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSignature>;
    if (typeof parsed.html !== "string" || !parsed.html.trim()) return null;
    return {
      html: parsed.html,
      text: typeof parsed.text === "string" ? parsed.text : "",
      source: parsed.source === "gmail" ? "gmail" : "manual",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

/** Save (or clear, with null) the signature added to every email. */
export async function saveSignature(sig: Signature | null, source: StoredSignature["source"] = "manual"): Promise<StoredSignature | null> {
  if (!sig) {
    await saveSetting(SETTING_KEYS.emailSignature, "");
    return null;
  }
  const stored: StoredSignature = { html: sig.html, text: sig.text, source, updatedAt: new Date().toISOString() };
  await saveSetting(SETTING_KEYS.emailSignature, JSON.stringify(stored));
  return stored;
}

export type ImportResult =
  | { ok: true; signature: StoredSignature; droppedEmbeddedImages: boolean; foundIn: { subject: string; date: string | null } }
  | { ok: false; code: "not_configured" | "not_found" | "imap_error"; reason: string };

const MAX_MESSAGES = 25;
const MAX_MESSAGE_BYTES = 2_000_000;
const LOOKBACK_DAYS = 365;

/**
 * Find your Gmail signature in a recent email you sent from Gmail and save it.
 * Stops at `deadlineMs` so it fits the serverless time limit.
 */
export async function importSignatureFromGmail(opts: { deadlineMs?: number; now?: Date } = {}): Promise<ImportResult> {
  const cfg = readMailConfig();
  if (!cfg) return { ok: false, code: "not_configured", reason: "Email not connected — add GMAIL_USER and GMAIL_APP_PASSWORD." };

  const deadline = Date.now() + (opts.deadlineMs ?? 7000);
  const now = opts.now ?? new Date();
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: cfg.user, pass: cfg.appPassword },
    logger: false,
    connectionTimeout: 7000,
    greetingTimeout: 7000,
    socketTimeout: 15000,
  });

  try {
    await client.connect();
    const boxes = await client.list();
    const sentPath = boxes.find((b) => b.specialUse === "\\Sent")?.path ?? "[Gmail]/Sent Mail";

    let found: { sig: Signature; dropped: boolean; subject: string; date: string | null } | null = null;
    const lock = await client.getMailboxLock(sentPath);
    try {
      const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 3600 * 1000);
      // Prefer emails sent as the alias (Gmail keeps a signature per address).
      let uids = (await client.search({ since, from: cfg.fromAddress }, { uid: true })) || [];
      if (!uids.length && cfg.fromAddress.toLowerCase() !== cfg.user.toLowerCase()) {
        uids = (await client.search({ since }, { uid: true })) || [];
      }
      uids = [...uids].sort((a, b) => b - a).slice(0, MAX_MESSAGES);

      for (const uid of uids) {
        if (Date.now() > deadline) break;
        const msg = await client.fetchOne(String(uid), { uid: true, size: true, source: true }, { uid: true });
        if (!msg || !msg.source || (msg.size ?? 0) > MAX_MESSAGE_BYTES) continue;
        const parsed = await simpleParser(msg.source);
        const block = extractGmailSignature(typeof parsed.html === "string" ? parsed.html : null);
        if (!block) continue;
        const clean = sanitizeSignatureHtml(block);
        if (!clean.html || clean.html.length > MAX_SIGNATURE_HTML) continue;
        const sig = signatureFromHtml(clean.html);
        if (!sig.text.trim() && !/<img\b/i.test(sig.html)) continue;
        found = {
          sig,
          dropped: clean.droppedEmbeddedImages,
          subject: parsed.subject ?? "(no subject)",
          date: parsed.date ? parsed.date.toISOString() : null,
        };
        break;
      }
    } finally {
      lock.release();
    }
    await client.logout();

    if (!found) {
      return {
        ok: false,
        code: "not_found",
        reason:
          "No Gmail signature found in your recent sent emails. Make sure a signature is set in Gmail (Settings → See all settings → Signature), send any email from Gmail on the web, then try again — or type your signature below.",
      };
    }
    const saved = (await saveSignature(found.sig, "gmail")) as StoredSignature;
    return {
      ok: true,
      signature: saved,
      droppedEmbeddedImages: found.dropped,
      foundIn: { subject: found.subject, date: found.date },
    };
  } catch (err) {
    try {
      client.close();
    } catch {
      /* ignore */
    }
    return { ok: false, code: "imap_error", reason: `Couldn't read Gmail: ${err instanceof Error ? err.message : String(err)}` };
  }
}
