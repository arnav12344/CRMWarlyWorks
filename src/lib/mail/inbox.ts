/**
 * Gmail inbox sync over IMAP (imap.gmail.com:993, same App Password as SMTP).
 *
 * Reads INBOX messages newer than the last UID we processed (stored in the
 * `imap_state` Setting), parses them, and hands them to `processInbound`.
 * The first run looks back 7 days. Designed to stay inside a serverless time
 * budget: it stops fetching once `deadlineMs` is reached and resumes from the
 * saved UID next time.
 *
 * Cloudflare Email Routing forwards replies sent to a@warlyworks.com into this
 * Gmail inbox; Gmail's own bounce notices (mailer-daemon) land here too.
 */
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import type { PrismaClient } from "@prisma/client";
import { readMailConfig, ownAddresses } from "./config";
import { processInbound, type InboundMail, type ProcessSummary } from "./inbound";
import { getPlainSetting, saveSetting, SETTING_KEYS } from "../verify/settings";

const MAX_FULL_SIZE = 1_000_000; // bytes; bigger messages are read headers-only
const MAX_PER_RUN = 40;
const FIRST_RUN_LOOKBACK_DAYS = 7;

interface ImapState {
  uidValidity: string;
  lastUid: number;
}

export interface SyncResult extends ProcessSummary {
  ok: boolean;
  configured: boolean;
  fetched: number;
  more: boolean;
  error?: string;
}

function emptySummary(): ProcessSummary {
  return { replies: 0, bounces: 0, optouts: 0, autoreplies: 0, ignored: 0, duplicates: 0 };
}

function headerMap(parsed: ParsedMail): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of parsed.headers) {
    if (typeof value === "string") out[key.toLowerCase()] = value;
    else if (value && typeof value === "object" && "value" in value) {
      out[key.toLowerCase()] = String((value as { value: unknown }).value);
    } else if (value != null) out[key.toLowerCase()] = String(value);
  }
  return out;
}

/** Convert a mailparser result into our transport-agnostic InboundMail. */
export function toInboundMail(parsed: ParsedMail, fallbackDate: Date): InboundMail {
  const refs = parsed.references;
  const fromAddr = parsed.from?.value?.[0]?.address ?? null;
  const headers = headerMap(parsed);
  const ctHeader = parsed.headers.get("content-type");
  const contentType =
    ctHeader && typeof ctHeader === "object" && "value" in ctHeader
      ? `${(ctHeader as { value: string }).value}; ${JSON.stringify((ctHeader as { params?: unknown }).params ?? {})}`
      : headers["content-type"] ?? null;
  return {
    messageId: parsed.messageId ?? null,
    inReplyTo: parsed.inReplyTo ?? null,
    references: Array.isArray(refs) ? refs : refs ? [refs] : [],
    from: fromAddr,
    subject: parsed.subject ?? "",
    text: parsed.text ?? (typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, " ") : ""),
    headers,
    contentType,
    date: parsed.date ?? fallbackDate,
  };
}

async function loadState(): Promise<ImapState | null> {
  const raw = await getPlainSetting(SETTING_KEYS.imapState, "");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImapState;
  } catch {
    return null;
  }
}

/** When did the last successful sync finish? (ISO string or null) */
export async function lastSyncedAt(): Promise<string | null> {
  const v = await getPlainSetting(SETTING_KEYS.imapLastSync, "");
  return v || null;
}

export async function syncInbox(
  db: PrismaClient,
  opts: { deadlineMs?: number; now?: Date } = {}
): Promise<SyncResult> {
  const cfg = readMailConfig();
  if (!cfg) {
    return { ok: false, configured: false, fetched: 0, more: false, ...emptySummary(), error: "Email not connected." };
  }
  const started = Date.now();
  const deadline = started + (opts.deadlineMs ?? 4500);
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

  const mails: InboundMail[] = [];
  let maxUid = 0;
  let more = false;
  let state: ImapState | null = null;
  let uidValidity = "";

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const box = client.mailbox;
      uidValidity = box ? String(box.uidValidity) : "";
      state = await loadState();

      let uids: number[] = [];
      if (!state || state.uidValidity !== uidValidity) {
        const since = new Date(now.getTime() - FIRST_RUN_LOOKBACK_DAYS * 24 * 3600 * 1000);
        uids = (await client.search({ since }, { uid: true })) || [];
      } else {
        const found = (await client.search({ uid: `${state.lastUid + 1}:*` }, { uid: true })) || [];
        uids = found.filter((u) => u > state!.lastUid);
      }
      uids.sort((a, b) => a - b);
      if (uids.length > MAX_PER_RUN) {
        more = true;
        uids = uids.slice(0, MAX_PER_RUN);
      }

      if (uids.length) {
        // Pass 1: sizes, so huge messages are read headers-only.
        const sizes = new Map<number, number>();
        for await (const msg of client.fetch(uids.join(","), { uid: true, size: true }, { uid: true })) {
          sizes.set(msg.uid, msg.size ?? 0);
        }
        // Pass 2: one message at a time in UID order, so stopping at the
        // deadline never skips anything — we resume after the last handled UID.
        for (const uid of uids) {
          if (Date.now() > deadline) {
            more = true;
            break;
          }
          const big = (sizes.get(uid) ?? 0) > MAX_FULL_SIZE;
          const msg = await client.fetchOne(
            String(uid),
            big ? { uid: true, headers: true } : { uid: true, source: true },
            { uid: true }
          );
          if (msg) {
            const raw = big ? msg.headers : msg.source;
            if (raw) {
              const inbound = toInboundMail(await simpleParser(raw), now);
              if (big) inbound.text = "(Large message — open it in Gmail to read the full text.)";
              mails.push(inbound);
            }
          }
          maxUid = uid;
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    try {
      client.close();
    } catch {
      /* ignore */
    }
    const message = err instanceof Error ? err.message : String(err);
    // Still process whatever we fetched before the failure.
    const partial = mails.length ? await processInbound(db, mails, { ownAddresses: ownAddresses(cfg) }) : emptySummary();
    return { ok: false, configured: true, fetched: mails.length, more: true, ...partial, error: message };
  }

  const summary = await processInbound(db, mails, { ownAddresses: ownAddresses(cfg) });

  const lastUid = Math.max(state?.uidValidity === uidValidity ? state.lastUid : 0, maxUid);
  await saveSetting(SETTING_KEYS.imapState, JSON.stringify({ uidValidity, lastUid }));
  await saveSetting(SETTING_KEYS.imapLastSync, new Date().toISOString());

  return { ok: true, configured: true, fetched: mails.length, more, ...summary };
}
