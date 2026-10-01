/**
 * Builds the exact text + HTML of an outgoing email, the way Gmail would:
 *
 *   what you wrote → your signature → (for a reply) the earlier emails quoted
 *   underneath in Gmail's own "gmail_quote" format, so Gmail collapses them
 *   behind "…" and other mail apps show the usual "On …, … wrote:" history.
 *
 * Pure (no I/O) so it is unit-tested. Signature parsing lives in ./signature.
 */
import { formatInTimeZone } from "date-fns-tz";

/** A signature in both formats (HTML part + plain-text part of the email). */
export interface Signature {
  html: string;
  text: string;
}

/** An earlier email of the thread, as quoted under a reply. */
export interface QuotedMessage {
  body: string | null;
  sentAt: Date | null;
  fromName: string;
  fromAddress: string;
}

/** The opt-out line older emails were sent with. Stripped when they're quoted. */
export const LEGACY_OPT_OUT_FOOTER = "--\nNot relevant? Just reply \"unsubscribe\" and I won't email again.";

/** Earlier emails quoted under a reply (the most recent ones). */
export const MAX_QUOTED_MESSAGES = 5;

const REPLY_PREFIX = /^\s*(?:(?:re|aw|sv)\s*(?:\[\d+\])?\s*:\s*)+/i;

/** "Re: Re: Hello" → "Hello". */
export function stripReplyPrefix(subject: string | null | undefined): string {
  return (subject ?? "").replace(REPLY_PREFIX, "").trim();
}

/** Subject for a reply in the same thread: exactly one "Re: " prefix. */
export function replySubject(subject: string | null | undefined): string {
  const base = stripReplyPrefix(subject);
  return base ? `Re: ${base}` : "Re:";
}

/** Remove the old opt-out footer from a stored body (emails sent before it was dropped). */
export function stripLegacyFooter(body: string | null | undefined): string {
  const trimmed = (body ?? "").replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  if (!trimmed.endsWith(LEGACY_OPT_OUT_FOOTER)) return trimmed;
  return trimmed.slice(0, -LEGACY_OPT_OUT_FOOTER.length).replace(/\s+$/, "");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text → safe HTML with line breaks kept. */
export function textToHtml(text: string | null | undefined): string {
  return escapeHtml((text ?? "").replace(/\r\n?/g, "\n")).replace(/\n/g, "<br>");
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
};

/** Decode HTML entities in one pass (so "&amp;lt;" stays the literal text "&lt;"). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1] === "x" || entity[1] === "X";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const BLOCK_TAG = /<\/?(?:div|p|tr|table|tbody|thead|blockquote|ul|ol|li|h[1-6]|section|header|footer)\b[^>]*>/gi;
const SOFT_BREAK = "\u0001";
const HARD_BREAK = "\u0002";

/**
 * HTML → readable plain text (used for the text part of a signature).
 * Block elements start a new line, <br> is a line break, and a link whose
 * text doesn't show its URL keeps the URL: "Website <https://…>".
 */
export function htmlToText(html: string | null | undefined): string {
  let s = (html ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/\s+/g, " "); // source whitespace isn't significant in HTML

  s = s.replace(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi, (_m, _q, href: string, inner: string) => {
    const url = decodeEntities(href).trim();
    if (!/^https?:\/\//i.test(url)) return inner;
    const label = decodeEntities(inner.replace(/<[^>]+>/g, "")).trim();
    if (!label) return escapeHtml(url);
    const bare = url.replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
    return label.toLowerCase().includes(bare) ? inner : `${inner} &lt;${escapeHtml(url)}&gt;`;
  });

  s = s
    .replace(/<br\s*\/?>/gi, HARD_BREAK)
    .replace(BLOCK_TAG, SOFT_BREAK)
    .replace(/<\/t[dh]\s*>/gi, " ")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s).replace(/\u00a0/g, " ");

  // A soft break only starts a new line if we're not already at one; a hard
  // break always adds one. Mirrors how browsers lay out <div>/<br>.
  let out = "";
  for (const ch of s) {
    if (ch === SOFT_BREAK) {
      if (out.length > 0 && !out.endsWith("\n")) out += "\n";
    } else if (ch === HARD_BREAK) {
      out += "\n";
    } else {
      out += ch;
    }
  }
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatSent(sentAt: Date, timeZone: string): string {
  return formatInTimeZone(sentAt, timeZone, "EEE, d MMM yyyy 'at' HH:mm");
}

function attributionText(m: QuotedMessage, timeZone: string): string {
  const who = m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress;
  return m.sentAt ? `On ${formatSent(m.sentAt, timeZone)}, ${who} wrote:` : `${who} wrote:`;
}

function attributionHtml(m: QuotedMessage, timeZone: string): string {
  const addr = escapeHtml(m.fromAddress);
  const who = m.fromName
    ? `${escapeHtml(m.fromName)} &lt;<a href="mailto:${addr}">${addr}</a>&gt;`
    : `<a href="mailto:${addr}">${addr}</a>`;
  return m.sentAt ? `On ${escapeHtml(formatSent(m.sentAt, timeZone))}, ${who} wrote:` : `${who} wrote:`;
}

/** Nested "> " quote of the thread, newest first (oldest emails are the deepest). */
function quoteText(thread: QuotedMessage[], timeZone: string): string {
  const last = thread[thread.length - 1];
  const earlier = thread.slice(0, -1);
  let inner = stripLegacyFooter(last.body);
  if (earlier.length) inner += `\n\n${quoteText(earlier, timeZone)}`;
  const quoted = inner
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
  return `${attributionText(last, timeZone)}\n\n${quoted}`;
}

const QUOTE_STYLE = "margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex";

/** Gmail's own reply markup, nested the same way Gmail nests it. */
function quoteHtml(thread: QuotedMessage[], timeZone: string): string {
  const last = thread[thread.length - 1];
  const earlier = thread.slice(0, -1);
  let inner = `<div dir="ltr">${textToHtml(stripLegacyFooter(last.body))}</div>`;
  if (earlier.length) inner += `<br>${quoteHtml(earlier, timeZone)}`;
  return (
    `<br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">${attributionHtml(last, timeZone)}<br></div>` +
    `<blockquote class="gmail_quote" style="${QUOTE_STYLE}">${inner}</blockquote></div>`
  );
}

export interface BuildEmailInput {
  /** What you wrote (plain text). */
  body: string | null | undefined;
  signature?: Signature | null;
  /** Earlier emails of the thread, oldest first; the last one is the one being replied to. */
  thread?: QuotedMessage[];
  timeZone?: string;
}

/** The text and HTML parts of the email exactly as they will be sent. */
export function buildEmailContent(input: BuildEmailInput): { text: string; html: string } {
  const timeZone = input.timeZone ?? "Asia/Singapore";
  const body = (input.body ?? "").replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  const sig = input.signature && input.signature.html.trim() ? input.signature : null;
  const thread = (input.thread ?? []).slice(-MAX_QUOTED_MESSAGES);

  let text = body;
  if (sig && sig.text.trim()) text += `\n\n${sig.text.trim()}`;

  let html = `<div dir="ltr">${textToHtml(body)}`;
  if (sig) html += `<br clear="all"><div><br></div>${sig.html}`;
  html += "</div>";

  if (thread.length) {
    text += `\n\n${quoteText(thread, timeZone)}`;
    html += quoteHtml(thread, timeZone);
  }
  return { text, html };
}
