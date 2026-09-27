import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { getMailer } from "@/lib/mail/mailer";
import { readMailConfig } from "@/lib/mail/config";
import { APP_TIMEZONE } from "@/lib/reminders";

export const runtime = "nodejs";

/** POST /api/mail/test — send a test email from the alias to your own Gmail. */
export async function POST() {
  const cfg = readMailConfig();
  const mailer = getMailer();
  if (!cfg || !mailer) {
    return NextResponse.json(
      { ok: false, error: "Email not connected — set GMAIL_USER and GMAIL_APP_PASSWORD." },
      { status: 503 }
    );
  }
  try {
    const stamp = formatInTimeZone(new Date(), APP_TIMEZONE, "d MMM yyyy, HH:mm");
    const { messageId } = await mailer.send({
      to: cfg.user,
      subject: `WarlyWorks test email (${stamp})`,
      text:
        `This is a test from your WarlyWorks CRM.\n\n` +
        `It was sent through ${cfg.user} with From: ${cfg.fromAddress}.\n` +
        `If you can read this, sending works.\n\n` +
        `Tip: in Gmail, open the message, click ⋮ → "Show original" and check that SPF, DKIM and DMARC say PASS.`,
    });
    return NextResponse.json({ ok: true, to: cfg.user, from: cfg.fromAddress, messageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = /invalid login|535|username and password/i.test(message)
      ? " Check GMAIL_USER and that GMAIL_APP_PASSWORD is a Google App Password (not your normal password)."
      : "";
    return NextResponse.json({ ok: false, error: `${message}${hint}` }, { status: 502 });
  }
}
