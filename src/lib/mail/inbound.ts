/**
 * Inbound mail classification + processing.
 *
 * `classifyInbound` is PURE (no I/O): given a parsed email it decides whether
 * it is a bounce, an auto-reply, an opt-out, a human reply, or something to
 * ignore (e.g. our own mail).
 *
 * `processInbound` applies the result to the database. It is idempotent: each
 * inbound email is stored once, keyed by its Message-ID, so re-reading the
 * same inbox messages changes nothing.
 */
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { normalizeEmail } from "../email";
import { cleanMessageId } from "./mailer";
import { moveToStage, stopActiveEnrollments, suppressContact } from "../outreach";

type Db = PrismaClient;

export interface InboundMail {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  /** Sender address (any case). */
  from: string | null;
  subject: string;
  text: string;
  /** Lower-cased header names -> values. */
  headers: Record<string, string>;
  /** Top-level content type, e.g. "multipart/report". */
  contentType?: string | null;
  date: Date;
}

export type InboundKind = "bounce" | "autoreply" | "optout" | "reply" | "ignore";

export interface Classification {
  kind: InboundKind;
  sender: string | null;
  /** Message-IDs this mail refers to (In-Reply-To, References, quoted headers). */
  referencedIds: string[];
  /** For bounces: the recipient that failed, when we can find it. */
  failedRecipient: string | null;
}

const BOUNCE_SENDER = /^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)@/i;
const BOUNCE_SUBJECT =
  /(delivery status notification|undeliver|mail delivery (failed|subsystem)|returned mail|failure notice|delivery failure|could not be delivered|address not found)/i;
const AUTO_SUBJECT =
  /^(auto(matic)?[ -]?(reply|response)|out of (the )?office|away from (the )?office|on (annual )?leave|i am (currently )?(away|out)|autoreply)/i;
const OPT_OUT =
  /\b(unsubscribe|remove me|take me off|stop (emailing|contacting|sending)|opt[ -]?out|do not (contact|email)|don'?t (contact|email) me|no longer interested)\b/i;

const EMAIL_RE = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** Reply text without the quoted history ("On ... wrote:" / "> " lines). */
export function stripQuoted(text: string): string {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*On .{3,200}wrote:\s*$/i.test(line)) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line)) break;
    if (/^\s*From:\s.+/i.test(line) && out.length > 0) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

function uniq(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.map(cleanMessageId).filter((x): x is string => !!x))];
}

export function classifyInbound(mail: InboundMail, ownAddresses: string[] = []): Classification {
  const sender = normalizeEmail(mail.from);
  const own = new Set(ownAddresses.map((a) => a.toLowerCase()));
  const headerIds = uniq([mail.inReplyTo, ...mail.references]);
  const base = { sender, referencedIds: headerIds, failedRecipient: null as string | null };

  if (!sender || own.has(sender)) return { ...base, kind: "ignore" };

  const h = mail.headers;
  const ct = (mail.contentType ?? h["content-type"] ?? "").toLowerCase();
  const isBounce =
    BOUNCE_SENDER.test(sender) ||
    (ct.includes("multipart/report") && ct.includes("delivery-status")) ||
    (BOUNCE_SUBJECT.test(mail.subject) && /mailer|daemon|postmaster|delivery/i.test(sender + (h["from"] ?? "")));

  if (isBounce) {
    const text = mail.text ?? "";
    const quotedIds = [...text.matchAll(/^\s*Message-ID:\s*<([^>\s]+)>/gim)].map((m) => m[1]);
    const failed =
      normalizeEmail(h["x-failed-recipients"]?.split(",")[0]) ??
      normalizeEmail(text.match(/Final-Recipient:\s*rfc822;\s*<?([^\s>]+)>?/i)?.[1]) ??
      normalizeEmail(text.match(/wasn'?t delivered to\s+<?([^\s>]+@[^\s>]+?)>?\s/i)?.[1]) ??
      normalizeEmail(text.match(/(?:delivery to|delivered to|recipient)[^\n]*?\b(\S+@\S+\.\w{2,})/i)?.[1]?.replace(/[<>.,;:]+$/g, "")) ??
      null;
    return {
      kind: "bounce",
      sender,
      referencedIds: uniq([...headerIds, ...quotedIds]),
      failedRecipient: failed && EMAIL_RE.test(failed) ? failed : null,
    };
  }

  const autoSubmitted = (h["auto-submitted"] ?? "").toLowerCase();
  const isAuto =
    (autoSubmitted !== "" && autoSubmitted !== "no") ||
    "x-autoreply" in h ||
    "x-autorespond" in h ||
    /auto[_-]?reply/i.test(h["x-auto-response-suppress"] ?? "") ||
    /^(auto_reply|bulk|junk)$/i.test(h["precedence"] ?? "") ||
    AUTO_SUBJECT.test(mail.subject.replace(/^(re|aw|fw|fwd):\s*/i, ""));
  if (isAuto) return { ...base, kind: "autoreply" };

  const firstLines = stripQuoted(mail.text).split("\n").slice(0, 6).join(" ");
  if (OPT_OUT.test(mail.subject) || OPT_OUT.test(firstLines)) return { ...base, kind: "optout" };

  return { ...base, kind: "reply" };
}

export interface ProcessSummary {
  replies: number;
  bounces: number;
  optouts: number;
  autoreplies: number;
  ignored: number;
  duplicates: number;
}

function inboundKey(mail: InboundMail): string {
  const id = cleanMessageId(mail.messageId);
  if (id) return id;
  const hash = createHash("sha1")
    .update(`${mail.from}|${mail.date.toISOString()}|${mail.subject}`)
    .digest("hex");
  return `synthetic-${hash}@inbound`;
}

/** Find the outbound message a reply/bounce refers to, by Message-ID. */
async function findOriginal(db: Db, ids: string[]) {
  for (const id of ids) {
    const m = await db.emailMessage.findFirst({ where: { messageIdHeader: id, direction: "outbound" } });
    if (m) return m;
  }
  return null;
}

/** Latest sent outbound message to a contact. */
async function latestSentTo(db: Db, contactId: string) {
  const rows = await db.emailMessage.findMany({
    where: { contactId, direction: "outbound", sentAt: { not: null } },
    orderBy: { sentAt: "desc" },
    take: 1,
  });
  return rows[0] ?? null;
}

/** Pull not-yet-sent sequence emails for a contact out of Ready to send. */
export async function cancelQueuedSequenceMail(db: Db, contactId: string): Promise<number> {
  const res = await db.emailMessage.updateMany({
    where: {
      contactId,
      direction: "outbound",
      status: { in: ["queued", "approved", "failed"] },
      sequenceEnrollmentId: { not: null },
    },
    data: { status: "draft" },
  });
  return res.count;
}

export async function processInbound(
  db: Db,
  mails: InboundMail[],
  opts: { ownAddresses?: string[] } = {}
): Promise<ProcessSummary> {
  const summary: ProcessSummary = { replies: 0, bounces: 0, optouts: 0, autoreplies: 0, ignored: 0, duplicates: 0 };

  for (const mail of mails) {
    const key = inboundKey(mail);
    if (await db.emailMessage.findUnique({ where: { messageIdHeader: key } })) {
      summary.duplicates += 1;
      continue;
    }

    const c = classifyInbound(mail, opts.ownAddresses);
    if (c.kind === "ignore") {
      summary.ignored += 1;
      continue;
    }

    // Which of our outbound emails / contacts does this relate to?
    let original = await findOriginal(db, c.referencedIds);
    let contactId: string | null = original?.contactId ?? null;
    const lookupEmail = c.kind === "bounce" ? c.failedRecipient : c.sender;
    if (!contactId && lookupEmail) {
      const contact = await db.contact.findFirst({ where: { email: lookupEmail } });
      if (contact) {
        const sent = await latestSentTo(db, contact.id);
        // Only treat as related if we actually emailed this person.
        if (sent) {
          contactId = contact.id;
          original = sent;
        }
      }
    }
    if (!contactId) {
      summary.ignored += 1;
      continue;
    }

    const subject = mail.subject || "(no subject)";
    const inboundStatus =
      c.kind === "bounce" ? "bounce_notice" : c.kind === "autoreply" ? "autoreply" : c.kind === "optout" ? "optout" : "replied";
    await db.emailMessage.create({
      data: {
        contactId,
        direction: "inbound",
        status: inboundStatus,
        subject,
        body: (c.kind === "bounce" ? mail.text : stripQuoted(mail.text)).slice(0, 20000),
        fromAddress: c.sender,
        messageIdHeader: key,
        inReplyTo: original?.messageIdHeader ?? cleanMessageId(mail.inReplyTo),
        repliedAt: c.kind === "reply" || c.kind === "optout" ? mail.date : null,
        createdAt: mail.date,
      },
    });

    if (c.kind === "bounce") {
      if (original) {
        await db.emailMessage.update({
          where: { id: original.id },
          data: { status: "bounced", bouncedAt: mail.date },
        });
      }
      await db.activity.create({
        data: { contactId, type: "email_bounced", summary: `Bounced: ${original?.subject ?? subject}` },
      });
      await moveToStage(db, contactId, "not_interested");
      await suppressContact(db, contactId, "bounced");
      summary.bounces += 1;
      continue;
    }

    if (c.kind === "autoreply") {
      await db.activity.create({
        data: { contactId, type: "email_autoreply", summary: `Auto-reply: ${subject}` },
      });
      summary.autoreplies += 1;
      continue;
    }

    // Human reply or opt-out.
    if (original && !original.repliedAt) {
      await db.emailMessage.update({
        where: { id: original.id },
        data: { status: "replied", repliedAt: mail.date },
      });
    }
    await db.followUp.updateMany({
      where: { contactId, status: "pending" },
      data: { status: "done", completedAt: mail.date },
    });
    await cancelQueuedSequenceMail(db, contactId);

    if (c.kind === "optout") {
      await db.activity.create({
        data: { contactId, type: "opted_out", summary: `Opted out: ${subject}` },
      });
      await moveToStage(db, contactId, "not_interested");
      await suppressContact(db, contactId, "opt-out");
      summary.optouts += 1;
      continue;
    }

    await db.activity.create({
      data: { contactId, type: "email_replied", summary: `Replied: ${subject}` },
    });
    await moveToStage(db, contactId, "replied", { onlyForward: true });
    await stopActiveEnrollments(db, contactId, "replied");
    summary.replies += 1;
  }

  return summary;
}
