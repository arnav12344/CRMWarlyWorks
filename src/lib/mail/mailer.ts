/**
 * Outbound mail transport.
 *
 * `Mailer` is a tiny interface so the send pipeline can be unit-tested with
 * `FakeMailer`, and so the transport can be swapped (e.g. to a domain SMTP or
 * Resend) by changing only this file.
 *
 * GmailSmtpMailer authenticates as GMAIL_USER and sends with From set to the
 * verified "Send mail as" alias (a@warlyworks.com). Gmail stores a copy in the
 * Sent folder automatically.
 */
import { randomUUID } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { readMailConfig, formatFrom, fromDomain, type MailConfig } from "./config";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  headers?: Record<string, string>;
}

export interface SentMail {
  /** Message-ID without angle brackets. */
  messageId: string;
}

export interface Mailer {
  /** The From address mail goes out as. */
  readonly fromAddress: string;
  send(mail: OutgoingMail): Promise<SentMail>;
}

/** Strip surrounding angle brackets / whitespace from a Message-ID. */
export function cleanMessageId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim().replace(/^<+/, "").replace(/>+$/, "").trim();
  return trimmed.length ? trimmed.toLowerCase() : null;
}

export class GmailSmtpMailer implements Mailer {
  readonly fromAddress: string;
  private readonly transport: Transporter;

  constructor(private readonly cfg: MailConfig) {
    this.fromAddress = cfg.fromAddress;
    this.transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: cfg.user, pass: cfg.appPassword },
      // Keep well inside the serverless function budget.
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
    });
  }

  async send(mail: OutgoingMail): Promise<SentMail> {
    // We mint the Message-ID ourselves so replies can be threaded back to the
    // exact message we stored.
    const messageId = `${randomUUID()}@${fromDomain(this.cfg)}`;
    await this.transport.sendMail({
      from: formatFrom(this.cfg),
      replyTo: this.cfg.fromAddress,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      messageId: `<${messageId}>`,
      headers: mail.headers,
    });
    return { messageId: messageId.toLowerCase() };
  }
}

/** Real mailer from env, or null when Gmail credentials are not configured. */
export function getMailer(): Mailer | null {
  const cfg = readMailConfig();
  return cfg ? new GmailSmtpMailer(cfg) : null;
}

/** In-memory mailer for tests. Records everything it "sent". */
export class FakeMailer implements Mailer {
  readonly sent: Array<OutgoingMail & { messageId: string }> = [];
  failWith: Error | null = null;

  constructor(readonly fromAddress = "a@warlyworks.com") {}

  async send(mail: OutgoingMail): Promise<SentMail> {
    if (this.failWith) throw this.failWith;
    const messageId = `fake-${this.sent.length + 1}@warlyworks.com`;
    this.sent.push({ ...mail, messageId });
    return { messageId };
  }
}
