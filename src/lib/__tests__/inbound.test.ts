import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { FakeDb } from "./fakeDb";
import { classifyInbound, processInbound, stripQuoted, type InboundMail } from "../mail/inbound";

const OWN = ["arnav.malhotra20003@gmail.com", "a@warlyworks.com"];
const asDb = (db: FakeDb) => db as unknown as PrismaClient;

function mail(overrides: Partial<InboundMail> = {}): InboundMail {
  return {
    messageId: "<reply-1@school.edu.sg>",
    inReplyTo: null,
    references: [],
    from: "wei@rosyth.edu.sg",
    subject: "Re: Helping Rosyth School",
    text: "Sounds great, can we talk Tuesday?\n\nOn Thu, 1 Jan 2026 at 12:00, Arnav <a@warlyworks.com> wrote:\n> Hi Wei",
    headers: {},
    contentType: "text/plain",
    date: new Date("2026-01-02T03:00:00Z"),
    ...overrides,
  };
}

function seed() {
  const db = new FakeDb();
  db.pipelineStages.push(
    { id: "st-contacted", name: "Contacted", role: "contacted", isPositive: false, isTerminal: false },
    { id: "st-replied", name: "Replied", role: "replied", isPositive: true, isTerminal: false },
    { id: "st-not", name: "Not Interested", role: "not_interested", isPositive: false, isTerminal: true }
  );
  db.contacts.push({ id: "c1", email: "wei@rosyth.edu.sg", suppressed: false, pipelineStageId: "st-contacted" });
  db.messages.push({
    id: "m1",
    contactId: "c1",
    direction: "outbound",
    status: "sent",
    subject: "Helping Rosyth School",
    sentAt: new Date("2026-01-01T04:00:00Z"),
    messageIdHeader: "abc-123@warlyworks.com",
    createdAt: new Date("2026-01-01T04:00:00Z"),
  });
  db.enrollments.push({ id: "e1", contactId: "c1", sequenceId: "seq1", status: "active", currentStep: 1, enrolledAt: new Date() });
  db.followUps.push({ id: "f1", contactId: "c1", status: "pending", dueAt: new Date("2026-01-05T04:00:00Z") });
  // A follow-up step already drafted but not sent yet.
  db.messages.push({ id: "m2", contactId: "c1", direction: "outbound", status: "queued", sequenceEnrollmentId: "e1", subject: "Following up", createdAt: new Date() });
  return db;
}

describe("classifyInbound", () => {
  it("header-matched reply", () => {
    const c = classifyInbound(mail({ inReplyTo: "<ABC-123@warlyworks.com>" }), OWN);
    expect(c.kind).toBe("reply");
    expect(c.referencedIds).toContain("abc-123@warlyworks.com");
  });

  it("sender-only reply (no threading headers) is still a reply", () => {
    expect(classifyInbound(mail(), OWN).kind).toBe("reply");
  });

  it("Gmail mailer-daemon bounce with failed recipient + quoted Message-ID", () => {
    const c = classifyInbound(
      mail({
        from: "mailer-daemon@googlemail.com",
        subject: "Delivery Status Notification (Failure)",
        headers: { "x-failed-recipients": "Nobody@Rosyth.edu.sg" },
        text: "Address not found\nYour message wasn't delivered to nobody@rosyth.edu.sg because the address couldn't be found.\n\nMessage-ID: <abc-123@warlyworks.com>\n",
      }),
      OWN
    );
    expect(c.kind).toBe("bounce");
    expect(c.failedRecipient).toBe("nobody@rosyth.edu.sg");
    expect(c.referencedIds).toContain("abc-123@warlyworks.com");
  });

  it("unsubscribe reply is an opt-out", () => {
    expect(classifyInbound(mail({ text: "Please unsubscribe me.\n\n> old text" }), OWN).kind).toBe("optout");
    expect(classifyInbound(mail({ subject: "unsubscribe", text: "" }), OWN).kind).toBe("optout");
  });

  it("out-of-office is an auto-reply (not a reply)", () => {
    expect(classifyInbound(mail({ subject: "Out of Office: Helping Rosyth School" }), OWN).kind).toBe("autoreply");
    expect(classifyInbound(mail({ headers: { "auto-submitted": "auto-replied" } }), OWN).kind).toBe("autoreply");
  });

  it("our own mail (test emails etc.) is ignored", () => {
    expect(classifyInbound(mail({ from: "A@WarlyWorks.com" }), OWN).kind).toBe("ignore");
  });

  it("stripQuoted removes the quoted history", () => {
    expect(stripQuoted(mail().text)).toBe("Sounds great, can we talk Tuesday?");
  });
});

describe("processInbound", () => {
  it("reply: stores the reply, marks original replied, moves stage, stops sequence, pulls queued step", async () => {
    const db = seed();
    const s = await processInbound(asDb(db), [mail({ inReplyTo: "<abc-123@warlyworks.com>" })], { ownAddresses: OWN });
    expect(s.replies).toBe(1);
    const inbound = db.messages.find((m) => m.direction === "inbound");
    expect(inbound?.body).toBe("Sounds great, can we talk Tuesday?");
    expect(inbound?.status).toBe("replied");
    expect(db.messages.find((m) => m.id === "m1")?.repliedAt).toBeInstanceOf(Date);
    expect(db.contacts[0].pipelineStageId).toBe("st-replied");
    expect(db.enrollments[0].status).toBe("stopped");
    expect(db.enrollments[0].stoppedReason).toBe("replied");
    expect(db.messages.find((m) => m.id === "m2")?.status).toBe("draft");
    expect(db.followUps[0].status).toBe("done");
  });

  it("reply matched by sender when threading headers are missing", async () => {
    const db = seed();
    const s = await processInbound(asDb(db), [mail({ from: "WEI@rosyth.edu.sg" })], { ownAddresses: OWN });
    expect(s.replies).toBe(1);
  });

  it("reply cancels the user's standalone follow-ups (waiting + queued) so none send", async () => {
    const db = seed();
    // Two write-your-own follow-ups linked to the first email m1.
    db.messages.push(
      { id: "fu1", contactId: "c1", direction: "outbound", status: "waiting", parentMessageId: "m1", followUpAfterDays: 2, subject: "Nudge 1", createdAt: new Date() },
      { id: "fu2", contactId: "c1", direction: "outbound", status: "queued", parentMessageId: "m1", scheduledFor: new Date("2026-02-01T00:00:00Z"), subject: "Nudge 2", createdAt: new Date() }
    );
    await processInbound(asDb(db), [mail({ inReplyTo: "<abc-123@warlyworks.com>" })], { ownAddresses: OWN });

    const fu1 = db.messages.find((m) => m.id === "fu1");
    const fu2 = db.messages.find((m) => m.id === "fu2");
    expect(fu1?.status).toBe("draft");
    expect(fu2?.status).toBe("draft");
    expect(fu2?.scheduledFor).toBeNull();

    // releaseScheduled would find nothing to send now.
    const stillQueued = db.messages.filter(
      (m) => m.parentMessageId === "m1" && ["waiting", "queued", "approved"].includes(m.status as string)
    );
    expect(stillQueued).toHaveLength(0);
  });

  it("is idempotent: the same Message-ID twice changes nothing", async () => {
    const db = seed();
    await processInbound(asDb(db), [mail()], { ownAddresses: OWN });
    const count = db.messages.length;
    const s = await processInbound(asDb(db), [mail()], { ownAddresses: OWN });
    expect(s.duplicates).toBe(1);
    expect(db.messages.length).toBe(count);
  });

  it("bounce: marks original bounced and suppresses the contact", async () => {
    const db = seed();
    const s = await processInbound(
      asDb(db),
      [
        mail({
          messageId: "<dsn-1@google.com>",
          from: "mailer-daemon@googlemail.com",
          subject: "Delivery Status Notification (Failure)",
          text: "Your message wasn't delivered to wei@rosyth.edu.sg because the address couldn't be found.",
        }),
      ],
      { ownAddresses: OWN }
    );
    expect(s.bounces).toBe(1);
    expect(db.messages.find((m) => m.id === "m1")?.status).toBe("bounced");
    expect(db.contacts[0].suppressed).toBe(true);
    expect(db.suppressions.some((x) => x.email === "wei@rosyth.edu.sg")).toBe(true);
    expect(db.contacts[0].pipelineStageId).toBe("st-not");
  });

  it("opt-out: suppresses the contact", async () => {
    const db = seed();
    const s = await processInbound(asDb(db), [mail({ text: "unsubscribe" })], { ownAddresses: OWN });
    expect(s.optouts).toBe(1);
    expect(db.contacts[0].suppressed).toBe(true);
    expect(db.suppressions[0].reason).toBe("opt-out");
  });

  it("auto-reply: logged only, sequence keeps going", async () => {
    const db = seed();
    const s = await processInbound(asDb(db), [mail({ subject: "Automatic reply: Helping Rosyth School" })], { ownAddresses: OWN });
    expect(s.autoreplies).toBe(1);
    expect(db.enrollments[0].status).toBe("active");
    expect(db.contacts[0].suppressed).toBe(false);
  });

  it("unrelated mail from someone we never emailed is ignored", async () => {
    const db = seed();
    const s = await processInbound(asDb(db), [mail({ from: "newsletter@shop.com" })], { ownAddresses: OWN });
    expect(s.ignored).toBe(1);
    expect(db.messages.filter((m) => m.direction === "inbound")).toHaveLength(0);
  });
});
