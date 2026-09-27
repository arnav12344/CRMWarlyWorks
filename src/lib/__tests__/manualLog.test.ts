import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { FakeDb } from "./fakeDb";
import { logSentEmail } from "../manualLog";
import { processInbound } from "../mail/inbound";

const asDb = (db: FakeDb) => db as unknown as PrismaClient;
const NOW = new Date("2026-09-28T02:00:00Z"); // Mon 10:00 in Singapore

function seed() {
  const db = new FakeDb();
  db.pipelineStages.push(
    { id: "st-new", name: "New", role: "new", isPositive: false, isTerminal: false },
    { id: "st-contacted", name: "Contacted", role: "contacted", isPositive: false, isTerminal: false },
    { id: "st-replied", name: "Replied", role: "replied", isPositive: true, isTerminal: false },
    { id: "st-meeting", name: "Meeting", role: "meeting", isPositive: true, isTerminal: false }
  );
  db.organizations.push({ id: "org-1", name: "Centre Stage", dedupeKey: "domain:centre-stage.com" });
  db.contacts.push({
    id: "c1",
    email: "info@centre-stage.com",
    organizationId: "org-1",
    suppressed: false,
    pipelineStageId: "st-new",
  });
  return db;
}

describe("logSentEmail", () => {
  it("records a sent email, moves the contact to Contacted and schedules 2 + 3 business-day follow-ups", async () => {
    const db = seed();
    const sentAt = new Date("2026-09-28T01:00:00Z");
    const res = await logSentEmail(asDb(db), { contactId: "c1", subject: "Partnering on PSLE English", sentAt, now: NOW });

    expect(res.ok).toBe(true);
    const msg = db.messages[0];
    expect(msg).toMatchObject({
      contactId: "c1",
      direction: "outbound",
      status: "sent",
      toAddress: "info@centre-stage.com",
      subject: "Partnering on PSLE English",
    });
    expect(msg.sentAt).toEqual(sentAt);
    expect(db.contacts[0].pipelineStageId).toBe("st-contacted");
    expect(db.activities.map((a) => a.type)).toEqual(["email_sent"]);

    // Mon + 2 business days = Wed, + 3 = Thu (Singapore days).
    const due = db.followUps.map((f) => (f.dueAt as Date).toISOString());
    expect(due).toEqual(["2026-09-30T01:00:00.000Z", "2026-10-01T01:00:00.000Z"]);
  });

  it("makes a later reply from that address get detected as a reply", async () => {
    const db = seed();
    await logSentEmail(asDb(db), { contactId: "c1", subject: "Partnering on PSLE English", now: NOW });

    const summary = await processInbound(asDb(db), [
      {
        // A reply to a Gmail-sent email carries a Message-ID we never stored.
        messageId: "<reply-9@centre-stage.com>",
        inReplyTo: "<gmail-original@mail.gmail.com>",
        references: ["<gmail-original@mail.gmail.com>"],
        from: "Info@Centre-Stage.com",
        subject: "Re: Partnering on PSLE English",
        text: "Happy to chat next week.",
        headers: {},
        contentType: "text/plain",
        date: new Date("2026-09-29T03:00:00Z"),
      },
    ]);

    expect(summary.replies).toBe(1);
    expect(db.messages.some((m) => m.direction === "inbound" && m.contactId === "c1")).toBe(true);
  });

  it("creates a new lead from an address and joins the org imported for that domain", async () => {
    const db = seed();
    const res = await logSentEmail(asDb(db), {
      email: "  Alison@Centre-Stage.com ",
      fullName: "Alison Tompkins",
      subject: "Hello",
      now: NOW,
    });

    expect(res.ok && res.createdContact).toBe(true);
    const created = db.contacts.find((c) => c.email === "alison@centre-stage.com");
    expect(created).toMatchObject({ fullName: "Alison Tompkins", organizationId: "org-1", source: "manual" });
    expect(db.organizations).toHaveLength(1);
  });

  it("reuses an existing lead when the address matches", async () => {
    const db = seed();
    const res = await logSentEmail(asDb(db), { email: "INFO@centre-stage.com", subject: "Hi", now: NOW });
    expect(res.ok && !res.createdContact && res.contactId === "c1").toBe(true);
    expect(db.contacts).toHaveLength(1);
  });

  it("never groups personal mailboxes by domain, but creates the named org", async () => {
    const db = seed();
    db.organizations.push({ id: "org-gmail", name: "Gmail mess", dedupeKey: "domain:gmail.com" });
    await logSentEmail(asDb(db), { email: "founder@gmail.com", orgName: "Tiny Drama Studio", subject: "Hi", now: NOW });

    const created = db.contacts.find((c) => c.email === "founder@gmail.com");
    const org = db.organizations.find((o) => o.id === created?.organizationId);
    expect(org).toMatchObject({ name: "Tiny Drama Studio", dedupeKey: "name:tiny drama studio", domain: null });
  });

  it("uses the chosen stage and follow-up date, and replaces pending follow-ups", async () => {
    const db = seed();
    db.followUps.push({ id: "old", contactId: "c1", status: "pending", dueAt: new Date("2026-09-20T00:00:00Z") });
    const dueAt = new Date("2026-10-05T01:00:00Z");
    await logSentEmail(asDb(db), {
      contactId: "c1",
      subject: "Hi",
      pipelineStageId: "st-meeting",
      followUp: { kind: "date", dueAt },
      now: NOW,
    });

    expect(db.contacts[0].pipelineStageId).toBe("st-meeting");
    expect(db.followUps.find((f) => f.id === "old")?.status).toBe("done");
    const pending = db.followUps.filter((f) => f.status === "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].dueAt).toEqual(dueAt);
  });

  it("schedules nothing when no reminder is chosen and leaves existing ones alone", async () => {
    const db = seed();
    db.followUps.push({ id: "old", contactId: "c1", status: "pending", dueAt: NOW });
    await logSentEmail(asDb(db), { contactId: "c1", subject: "Hi", followUp: { kind: "none" }, now: NOW });
    expect(db.followUps).toHaveLength(1);
    expect(db.followUps[0].status).toBe("pending");
  });

  it("does not downgrade a contact who is already further along", async () => {
    const db = seed();
    db.contacts[0].pipelineStageId = "st-meeting";
    await logSentEmail(asDb(db), { contactId: "c1", subject: "Hi", now: NOW });
    expect(db.contacts[0].pipelineStageId).toBe("st-meeting");
  });

  it("refuses suppressed addresses and writes nothing", async () => {
    const db = seed();
    db.suppressions.push({ id: "s1", email: "info@centre-stage.com" });
    const res = await logSentEmail(asDb(db), { contactId: "c1", subject: "Hi", now: NOW });
    expect(res).toMatchObject({ ok: false, code: "suppressed" });
    expect(db.messages).toHaveLength(0);
    expect(db.followUps).toHaveLength(0);
  });

  it("rejects a future send time, a missing subject and a bad address", async () => {
    const db = seed();
    const future = await logSentEmail(asDb(db), {
      contactId: "c1",
      subject: "Hi",
      sentAt: new Date(NOW.getTime() + 60 * 60 * 1000),
      now: NOW,
    });
    expect(future).toMatchObject({ ok: false, code: "invalid" });
    expect((await logSentEmail(asDb(db), { contactId: "c1", subject: "  ", now: NOW })).ok).toBe(false);
    expect((await logSentEmail(asDb(db), { email: "not-an-email", subject: "Hi", now: NOW })).ok).toBe(false);
    expect((await logSentEmail(asDb(db), { contactId: "missing", subject: "Hi", now: NOW })).ok).toBe(false);
    expect(db.messages).toHaveLength(0);
  });
});
