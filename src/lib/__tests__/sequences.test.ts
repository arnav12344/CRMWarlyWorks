import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { FakeDb } from "./fakeDb";
import { advanceEnrollments } from "../sequences";
import {
  sendMessage,
  enrollContact,
  isEmailSuppressed,
  findPlaceholders,
  releaseScheduled,
} from "../outreach";
import { FakeMailer } from "../mail/mailer";
import { LEGACY_OPT_OUT_FOOTER } from "../mail/compose";

function seedBasic() {
  const db = new FakeDb();
  db.pipelineStages.push(
    { id: "st-contacted", name: "Contacted", role: "contacted", order: 1, isPositive: false, isTerminal: false },
    { id: "st-replied", name: "Replied", role: "replied", order: 2, isPositive: true, isTerminal: false },
    { id: "st-meeting", name: "Meeting", role: "meeting", order: 4, isPositive: true, isTerminal: false },
    { id: "st-not", name: "Not Interested", role: "not_interested", order: 5, isPositive: false, isTerminal: true }
  );
  db.organizations.push({ id: "org1", name: "Rosyth School", city: "Singapore" });
  db.contacts.push({
    id: "c1",
    organizationId: "org1",
    firstName: "Wei",
    fullName: "Wei Tan",
    email: "wei@rosyth.edu.sg",
    suppressed: false,
    pipelineStageId: null,
  });
  db.templates.push(
    { id: "tpl1", name: "Intro", subject: "Hi {{firstName}}", body: "For {{orgName}}. {{snippet:Proof}}" },
    { id: "tpl2", name: "Bump", subject: "Following up", body: "Any thoughts, {{firstName|there}}?" }
  );
  db.snippets.push({ id: "sn1", label: "Proof", body: "Students improved 1 grade." });
  db.sequences.push({ id: "seq1", name: "PSLE English Outreach", isActive: true });
  db.sequenceSteps.push(
    { id: "s1", sequenceId: "seq1", order: 0, dayOffset: 0, templateId: "tpl1", stopOnReply: true },
    { id: "s2", sequenceId: "seq1", order: 1, dayOffset: 2, templateId: "tpl2", stopOnReply: true }
  );
  return db;
}

const asDb = (db: FakeDb) => db as unknown as PrismaClient;
const NOW = new Date("2026-01-01T04:00:00Z"); // Thu 12:00 SGT

function queue(db: FakeDb, extra: Record<string, unknown> = {}) {
  db.messages.push({
    id: "m1",
    contactId: "c1",
    direction: "outbound",
    status: "queued",
    subject: "Hi Wei",
    body: "Hello from WarlyWorks",
    createdAt: NOW,
    ...extra,
  });
}

describe("advanceEnrollments", () => {
  it("drafts the first step with snippets resolved", async () => {
    const db = seedBasic();
    db.enrollments.push({ id: "e1", contactId: "c1", sequenceId: "seq1", status: "active", currentStep: 0, enrolledAt: NOW });
    const result = await advanceEnrollments(asDb(db), new Date("2026-01-01T05:00:00Z"));
    expect(result.createdMessageIds).toHaveLength(1);
    const msg = db.messages[0];
    expect(msg.status).toBe("queued");
    expect(msg.subject).toBe("Hi Wei");
    expect(msg.body).toBe("For Rosyth School. Students improved 1 grade.");
    expect(String(msg.body)).not.toMatch(/\[snippet:/);
    expect(db.enrollments[0].currentStep).toBe(1);
  });

  it("waits for step 1 to be SENT before drafting step 2", async () => {
    const db = seedBasic();
    db.enrollments.push({ id: "e1", contactId: "c1", sequenceId: "seq1", status: "active", currentStep: 1, enrolledAt: NOW });
    db.messages.push({ id: "m0", contactId: "c1", sequenceEnrollmentId: "e1", direction: "outbound", status: "queued", createdAt: NOW });
    const result = await advanceEnrollments(asDb(db), new Date("2026-01-20T05:00:00Z"));
    expect(result.createdMessageIds).toHaveLength(0);
  });

  it("drafts step 2 two business days after step 1 was sent", async () => {
    const db = seedBasic();
    db.enrollments.push({ id: "e1", contactId: "c1", sequenceId: "seq1", status: "active", currentStep: 1, enrolledAt: NOW });
    db.messages.push({ id: "m0", contactId: "c1", sequenceEnrollmentId: "e1", direction: "outbound", status: "sent", sentAt: NOW, createdAt: NOW });
    // Friday — only 1 business day later: not due.
    expect((await advanceEnrollments(asDb(db), new Date("2026-01-02T05:00:00Z"))).createdMessageIds).toHaveLength(0);
    // Monday — 2 business days (weekend skipped): due.
    const r = await advanceEnrollments(asDb(db), new Date("2026-01-05T05:00:00Z"));
    expect(r.createdMessageIds).toHaveLength(1);
    expect(db.messages.at(-1)?.body).toBe("Any thoughts, Wei?");
    expect(db.enrollments[0].status).toBe("completed");
  });

  it("drafts later steps as a reply: subject is Re: <the first step's subject>", async () => {
    const db = seedBasic();
    db.enrollments.push({ id: "e1", contactId: "c1", sequenceId: "seq1", status: "active", currentStep: 1, enrolledAt: NOW });
    db.messages.push({ id: "m0", contactId: "c1", sequenceEnrollmentId: "e1", direction: "outbound", status: "sent", subject: "Hi Wei", sentAt: NOW, createdAt: NOW });
    await advanceEnrollments(asDb(db), new Date("2026-01-05T05:00:00Z"));
    expect(db.messages.at(-1)?.subject).toBe("Re: Hi Wei");
  });

  it("only advances the given enrollmentIds when provided", async () => {
    const db = seedBasic();
    db.enrollments.push(
      { id: "e1", contactId: "c1", sequenceId: "seq1", status: "active", currentStep: 0, enrolledAt: NOW },
      { id: "e2", contactId: "c1", sequenceId: "seq1", status: "active", currentStep: 0, enrolledAt: NOW }
    );
    const r = await advanceEnrollments(asDb(db), new Date("2026-01-01T05:00:00Z"), undefined, { enrollmentIds: ["e2"] });
    expect(r.advancedEnrollmentIds).toEqual(["e2"]);
  });

  it.each([
    ["replied", { status: "replied", repliedAt: new Date() }],
    ["bounced", { status: "bounced", bouncedAt: new Date() }],
  ])("STOPS an enrollment when the contact %s", async (reason, msg) => {
    const db = seedBasic();
    db.messages.push({ id: "m0", contactId: "c1", ...msg });
    db.enrollments.push({ id: "e1", contactId: "c1", sequenceId: "seq1", status: "active", currentStep: 0, enrolledAt: NOW });
    const result = await advanceEnrollments(asDb(db), new Date("2026-01-05T05:00:00Z"));
    expect(db.enrollments[0].status).toBe("stopped");
    expect(db.enrollments[0].stoppedReason).toBe(reason);
    expect(result.createdMessageIds).toHaveLength(0);
  });

  it("STOPS when the email is suppressed, even with different casing", async () => {
    const db = seedBasic();
    db.contacts[0].email = "Wei@Rosyth.EDU.sg";
    db.suppressions.push({ id: "sup1", email: "wei@rosyth.edu.sg", reason: "opt-out" });
    db.enrollments.push({ id: "e1", contactId: "c1", sequenceId: "seq1", status: "active", currentStep: 0, enrolledAt: NOW });
    await advanceEnrollments(asDb(db), new Date("2026-01-05T05:00:00Z"));
    expect(db.enrollments[0].stoppedReason).toBe("suppressed");
  });
});

describe("sendMessage — real send pipeline", () => {
  it("sends text + HTML with no opt-out footer or List-Unsubscribe, stores Message-ID, schedules 2 follow-ups", async () => {
    const db = seedBasic();
    queue(db);
    const mailer = new FakeMailer();
    const res = await sendMessage(asDb(db), "m1", { mailer, now: NOW });
    expect(res.ok).toBe(true);
    expect(mailer.sent).toHaveLength(1);
    const sent = mailer.sent[0];
    expect(sent.to).toBe("wei@rosyth.edu.sg");
    expect(sent.subject).toBe("Hi Wei");
    expect(sent.text).toBe("Hello from WarlyWorks");
    expect(sent.text).not.toMatch(/unsubscribe/i);
    expect(sent.html).toContain("Hello from WarlyWorks");
    expect(sent.headers?.["List-Unsubscribe"]).toBeUndefined();
    expect(sent.inReplyTo).toBeUndefined();
    const m = db.messages[0];
    expect(m.status).toBe("sent");
    expect(m.sentAt).toEqual(NOW);
    expect(m.body).toBe("Hello from WarlyWorks");
    expect(m.messageIdHeader).toBe("fake-1@warlyworks.com");
    expect(m.fromAddress).toBe("a@warlyworks.com");
    expect(db.followUps.map((f) => f.businessDaysOffset).sort()).toEqual([2, 3]);
    expect(db.activities.some((a) => a.type === "email_sent" && !String(a.summary).includes("simulated"))).toBe(true);
    expect(db.contacts[0].pipelineStageId).toBe("st-contacted");
  });

  it("does not schedule reminder follow-ups for sequence emails", async () => {
    const db = seedBasic();
    db.enrollments.push({ id: "e1", contactId: "c1", sequenceId: "seq1", status: "active", currentStep: 1, enrolledAt: NOW });
    queue(db, { sequenceEnrollmentId: "e1" });
    const res = await sendMessage(asDb(db), "m1", { mailer: new FakeMailer(), now: NOW });
    expect(res.ok).toBe(true);
    expect(db.followUps).toHaveLength(0);
  });

  it("does not downgrade a contact already at a positive stage", async () => {
    const db = seedBasic();
    db.contacts[0].pipelineStageId = "st-meeting";
    queue(db);
    await sendMessage(asDb(db), "m1", { mailer: new FakeMailer(), now: NOW });
    expect(db.contacts[0].pipelineStageId).toBe("st-meeting");
  });

  it.each(["sent", "replied", "bounced", "sending"])("refuses a message that is already %s", async (status) => {
    const db = seedBasic();
    queue(db, { status });
    const mailer = new FakeMailer();
    const res = await sendMessage(asDb(db), "m1", { mailer, now: NOW });
    expect(res.ok).toBe(false);
    expect(mailer.sent).toHaveLength(0);
  });

  it("blocks suppressed contacts (flag or list, any casing) without calling the mailer", async () => {
    const db = seedBasic();
    db.contacts[0].email = "WEI@Rosyth.EDU.sg";
    db.suppressions.push({ id: "s1", email: "wei@rosyth.edu.sg" });
    queue(db);
    const mailer = new FakeMailer();
    const res = await sendMessage(asDb(db), "m1", { mailer, now: NOW });
    expect(res.code).toBe("suppressed");
    expect(mailer.sent).toHaveLength(0);
    expect(db.messages[0].status).toBe("queued");
  });

  it("blocks unresolved merge placeholders", async () => {
    const db = seedBasic();
    queue(db, { body: "Hi [firstName?], see [snippet:Proof?]" });
    const res = await sendMessage(asDb(db), "m1", { mailer: new FakeMailer(), now: NOW });
    expect(res.code).toBe("placeholders");
    expect(res.reason).toContain("[firstName?]");
  });

  it("blocks reserved demo domains", async () => {
    const db = seedBasic();
    db.contacts[0].email = "grace@rivervale.example";
    queue(db);
    const res = await sendMessage(asDb(db), "m1", { mailer: new FakeMailer(), now: NOW });
    expect(res.code).toBe("demo_address");
  });

  it("blocks a step whose sequence was stopped", async () => {
    const db = seedBasic();
    db.enrollments.push({ id: "e1", contactId: "c1", sequenceId: "seq1", status: "stopped", stoppedReason: "replied", currentStep: 2, enrolledAt: NOW });
    queue(db, { sequenceEnrollmentId: "e1" });
    const res = await sendMessage(asDb(db), "m1", { mailer: new FakeMailer(), now: NOW });
    expect(res.code).toBe("sequence_stopped");
  });

  it("enforces the daily limit using the Singapore day", async () => {
    const db = seedBasic();
    // Two sends earlier the same SGT day (00:30 SGT = 16:30 UTC previous day).
    db.messages.push(
      { id: "x1", contactId: "c1", direction: "outbound", status: "sent", sentAt: new Date("2025-12-31T16:30:00Z") },
      { id: "x2", contactId: "c1", direction: "outbound", status: "sent", sentAt: new Date("2026-01-01T01:00:00Z") },
      // Yesterday SGT — doesn't count.
      { id: "x3", contactId: "c1", direction: "outbound", status: "sent", sentAt: new Date("2025-12-31T15:00:00Z") }
    );
    queue(db);
    const res = await sendMessage(asDb(db), "m1", { mailer: new FakeMailer(), now: NOW, dailyLimit: 2 });
    expect(res.code).toBe("daily_limit");
    expect(res.sentToday).toBe(2);
    const ok = await sendMessage(asDb(db), "m1", { mailer: new FakeMailer(), now: NOW, dailyLimit: 3 });
    expect(ok.ok).toBe(true);
  });

  it("never double-sends when two sends race", async () => {
    const db = seedBasic();
    queue(db);
    const mailer = new FakeMailer();
    const [a, b] = await Promise.all([
      sendMessage(asDb(db), "m1", { mailer, now: NOW }),
      sendMessage(asDb(db), "m1", { mailer, now: NOW }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(mailer.sent).toHaveLength(1);
  });

  it("respectSchedule skips a message scheduled for the future, sends a due one", async () => {
    const db = seedBasic();
    const future = new Date(NOW.getTime() + 3600_000);
    queue(db, { scheduledFor: future });
    const mailer = new FakeMailer();
    const skipped = await sendMessage(asDb(db), "m1", { mailer, now: NOW, respectSchedule: true });
    expect(skipped.code).toBe("scheduled");
    expect(mailer.sent).toHaveLength(0);
    expect(db.messages[0].status).toBe("queued");

    // Clicking Send (respectSchedule off) sends it now regardless.
    const forced = await sendMessage(asDb(db), "m1", { mailer, now: NOW });
    expect(forced.ok).toBe(true);
    expect(db.messages[0].scheduledFor).toBeNull();
  });

  it("marks the message failed (no follow-ups) when the mailer throws, and allows retry", async () => {
    const db = seedBasic();
    queue(db);
    const mailer = new FakeMailer();
    mailer.failWith = new Error("535 Invalid login");
    const res = await sendMessage(asDb(db), "m1", { mailer, now: NOW });
    expect(res.code).toBe("send_failed");
    expect(db.messages[0].status).toBe("failed");
    expect(db.messages[0].error).toContain("535");
    expect(db.followUps).toHaveLength(0);

    mailer.failWith = null;
    const retry = await sendMessage(asDb(db), "m1", { mailer, now: NOW });
    expect(retry.ok).toBe(true);
    expect(db.messages[0].status).toBe("sent");
  });

  it("releases a waiting '+2 business days' follow-up once the first email sends", async () => {
    const db = seedBasic();
    queue(db); // the first email, id m1
    // A user-written follow-up waiting on the first email.
    db.messages.push({
      id: "f1",
      contactId: "c1",
      parentMessageId: "m1",
      direction: "outbound",
      status: "waiting",
      followUpAfterDays: 2,
      scheduledFor: null,
      subject: "Nudge",
      body: "Just checking in",
      createdAt: NOW,
    });

    const res = await sendMessage(asDb(db), "m1", { mailer: new FakeMailer(), now: NOW });
    expect(res.ok).toBe(true);

    const follow = db.messages.find((m) => m.id === "f1");
    expect(follow?.status).toBe("queued");
    // NOW is Thu 12:00 SGT; +2 business days (Fri, Mon) = Monday, same wall time.
    expect((follow?.scheduledFor as Date).toISOString()).toBe("2026-01-05T04:00:00.000Z");
  });

  it("leaves an absolute-date follow-up untouched when the first email sends", async () => {
    const db = seedBasic();
    queue(db);
    const dateISO = "2026-01-09T04:00:00.000Z";
    db.messages.push({
      id: "f1",
      contactId: "c1",
      parentMessageId: "m1",
      direction: "outbound",
      status: "queued",
      followUpAfterDays: null,
      scheduledFor: new Date(dateISO),
      subject: "Nudge",
      body: "Body",
      createdAt: NOW,
    });
    await sendMessage(asDb(db), "m1", { mailer: new FakeMailer(), now: NOW });
    const follow = db.messages.find((m) => m.id === "f1");
    expect(follow?.status).toBe("queued");
    expect((follow?.scheduledFor as Date).toISOString()).toBe(dateISO);
  });

  it("returns not_configured when no mailer is set up", async () => {
    const db = seedBasic();
    queue(db);
    const res = await sendMessage(asDb(db), "m1", { mailer: null, now: NOW });
    expect(res.code).toBe("not_configured");
    expect(db.messages[0].status).toBe("queued");
  });

  it("appends the signature to the text and HTML parts", async () => {
    const db = seedBasic();
    queue(db);
    const mailer = new FakeMailer();
    const signature = {
      html: '<div class="gmail_signature">Arnav<br><a href="https://warlyworks.com">warlyworks.com</a></div>',
      text: "Arnav\nwarlyworks.com",
    };
    await sendMessage(asDb(db), "m1", { mailer, now: NOW, signature });
    expect(mailer.sent[0].text).toBe("Hello from WarlyWorks\n\nArnav\nwarlyworks.com");
    expect(mailer.sent[0].html).toContain(signature.html);
    // The stored body stays exactly what you wrote.
    expect(db.messages[0].body).toBe("Hello from WarlyWorks");
  });
});

describe("sendMessage — follow-ups go out as replies in the same thread", () => {
  const FIRST_SENT = new Date("2025-12-29T01:00:00Z"); // Mon 09:00 SGT

  function firstEmail(db: FakeDb, extra: Record<string, unknown> = {}) {
    db.messages.push({
      id: "m0",
      contactId: "c1",
      direction: "outbound",
      status: "sent",
      subject: "Hi Wei",
      body: "Hello Wei,\nQuick idea for Rosyth.",
      sentAt: FIRST_SENT,
      messageIdHeader: "first-1@warlyworks.com",
      fromAddress: "a@warlyworks.com",
      createdAt: FIRST_SENT,
      ...extra,
    });
  }

  it("a sequence step replies to the previous step: Re: subject, In-Reply-To, References, quoted history", async () => {
    const db = seedBasic();
    db.enrollments.push({ id: "e1", contactId: "c1", sequenceId: "seq1", status: "active", currentStep: 2, enrolledAt: FIRST_SENT });
    firstEmail(db, { sequenceEnrollmentId: "e1" });
    queue(db, { sequenceEnrollmentId: "e1", subject: "Following up", body: "Any thoughts, Wei?" });

    const mailer = new FakeMailer();
    const res = await sendMessage(asDb(db), "m1", { mailer, now: NOW });
    expect(res.ok).toBe(true);
    const sent = mailer.sent[0];
    expect(sent.subject).toBe("Re: Hi Wei");
    expect(sent.inReplyTo).toBe("first-1@warlyworks.com");
    expect(sent.references).toEqual(["first-1@warlyworks.com"]);
    expect(sent.text).toContain("Any thoughts, Wei?");
    expect(sent.text).toContain("On Mon, 29 Dec 2025 at 09:00, Arnav from WarlyWorks <a@warlyworks.com> wrote:");
    expect(sent.text).toContain("> Hello Wei,\n> Quick idea for Rosyth.");
    expect(sent.html).toContain('class="gmail_quote"');

    const m = db.messages.find((x) => x.id === "m1");
    expect(m?.subject).toBe("Re: Hi Wei");
    expect(m?.inReplyTo).toBe("first-1@warlyworks.com");
    expect(m?.body).toBe("Any thoughts, Wei?");
  });

  it("a write-your-own follow-up replies to the latest email of its thread, with the whole chain in References", async () => {
    const db = seedBasic();
    firstEmail(db);
    db.messages.push({
      id: "f1",
      contactId: "c1",
      parentMessageId: "m0",
      direction: "outbound",
      status: "sent",
      subject: "Re: Hi Wei",
      body: "Bumping this up.",
      sentAt: new Date("2025-12-31T01:00:00Z"),
      messageIdHeader: "fu-1@warlyworks.com",
      inReplyTo: "first-1@warlyworks.com",
      createdAt: FIRST_SENT,
    });
    queue(db, { parentMessageId: "m0", subject: "whatever was typed", body: "Last nudge from me!" });

    const mailer = new FakeMailer();
    expect((await sendMessage(asDb(db), "m1", { mailer, now: NOW })).ok).toBe(true);
    const sent = mailer.sent[0];
    expect(sent.subject).toBe("Re: Hi Wei");
    expect(sent.inReplyTo).toBe("fu-1@warlyworks.com");
    expect(sent.references).toEqual(["first-1@warlyworks.com", "fu-1@warlyworks.com"]);
    // Newest quoted first, the first email nested inside it.
    expect(sent.text.indexOf("> Bumping this up.")).toBeGreaterThan(-1);
    expect(sent.text).toContain("> > Hello Wei,");
  });

  it("waits (never sends) while the first email hasn't gone out, and the cron doesn't count it as failed", async () => {
    const db = seedBasic();
    firstEmail(db, { status: "queued", sentAt: null, messageIdHeader: null });
    queue(db, { parentMessageId: "m0", scheduledFor: new Date(NOW.getTime() - 1000) });

    const mailer = new FakeMailer();
    const res = await sendMessage(asDb(db), "m1", { mailer, now: NOW });
    expect(res.code).toBe("waiting_parent");
    expect(mailer.sent).toHaveLength(0);
    expect(db.messages.find((x) => x.id === "m1")?.status).toBe("queued");

    const run = await releaseScheduled(asDb(db), { mailer, now: NOW, dailyLimit: 50 });
    expect(run.failed).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it("drops the old opt-out footer from quoted emails sent before it was removed", async () => {
    const db = seedBasic();
    firstEmail(db, { body: `Hello Wei\n\n${LEGACY_OPT_OUT_FOOTER}` });
    queue(db, { parentMessageId: "m0", body: "Any update?" });
    const mailer = new FakeMailer();
    await sendMessage(asDb(db), "m1", { mailer, now: NOW });
    expect(mailer.sent[0].text).toContain("> Hello Wei");
    expect(mailer.sent[0].text).not.toMatch(/unsubscribe/i);
  });
});

describe("releaseScheduled (cron)", () => {
  function queued(db: FakeDb, id: string, scheduledFor: Date | null) {
    db.messages.push({
      id,
      contactId: "c1",
      direction: "outbound",
      status: "queued",
      subject: "Hi Wei",
      body: "Hello",
      scheduledFor,
      createdAt: NOW,
    });
  }

  it("sends due + past-scheduled messages, leaves future ones", async () => {
    const db = seedBasic();
    queued(db, "past", new Date(NOW.getTime() - 1000));
    queued(db, "future", new Date(NOW.getTime() + 3_600_000));
    const mailer = new FakeMailer();
    const res = await releaseScheduled(db as unknown as PrismaClient, { mailer, now: NOW, dailyLimit: 50 });
    expect(res.sent).toBe(1);
    expect(db.messages.find((m) => m.id === "past")?.status).toBe("sent");
    expect(db.messages.find((m) => m.id === "future")?.status).toBe("queued");
  });

  it("only flushes 'no schedule' emails when includeWindow is set", async () => {
    const db = seedBasic();
    queued(db, "parked", null);
    const off = await releaseScheduled(db as unknown as PrismaClient, { mailer: new FakeMailer(), now: NOW, dailyLimit: 50 });
    expect(off.sent).toBe(0);
    const on = await releaseScheduled(db as unknown as PrismaClient, { mailer: new FakeMailer(), now: NOW, dailyLimit: 50, includeWindow: true });
    expect(on.sent).toBe(1);
  });

  it("stops at the daily limit", async () => {
    const db = seedBasic();
    queued(db, "a", new Date(NOW.getTime() - 2000));
    queued(db, "b", new Date(NOW.getTime() - 1000));
    const res = await releaseScheduled(db as unknown as PrismaClient, { mailer: new FakeMailer(), now: NOW, dailyLimit: 1 });
    expect(res.sent).toBe(1);
    expect(res.hitLimit).toBe(true);
  });
});

describe("helpers", () => {
  it("findPlaceholders lists unresolved merge fields", () => {
    expect(findPlaceholders("Hi [firstName?]", "x [snippet:Proof?] [ok]")).toEqual(["[firstName?]", "[snippet:Proof?]"]);
    expect(findPlaceholders("All good")).toEqual([]);
  });
});

describe("enrollment + suppression", () => {
  it("enrollContact refuses suppressed contacts and contacts without email", async () => {
    const db = seedBasic();
    db.contacts[0].suppressed = true;
    expect((await enrollContact(asDb(db), "c1", "seq1")).ok).toBe(false);
    db.contacts[0].suppressed = false;
    db.contacts[0].email = null;
    expect((await enrollContact(asDb(db), "c1", "seq1")).ok).toBe(false);
    expect(db.enrollments).toHaveLength(0);
  });

  it("isEmailSuppressed matches regardless of casing", async () => {
    const db = seedBasic();
    expect(await isEmailSuppressed(asDb(db), "wei@rosyth.edu.sg")).toBe(false);
    db.suppressions.push({ id: "s1", email: "wei@rosyth.edu.sg" });
    expect(await isEmailSuppressed(asDb(db), "WEI@Rosyth.edu.SG")).toBe(true);
  });
});
