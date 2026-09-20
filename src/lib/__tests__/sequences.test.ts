import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { FakeDb } from "./fakeDb";
import { advanceEnrollments } from "../sequences";
import {
  simulateSend,
  simulateEvent,
  enrollContact,
  isEmailSuppressed,
} from "../outreach";

function seedBasic() {
  const db = new FakeDb();
  db.pipelineStages.push(
    { id: "st-contacted", name: "Contacted", order: 1 },
    { id: "st-replied", name: "Replied", order: 2 },
    { id: "st-not", name: "Not Interested", order: 5 }
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
    { id: "tpl1", name: "Intro", subject: "Hi {{firstName}}", body: "For {{orgName}}" },
    { id: "tpl2", name: "Bump", subject: "Following up", body: "Any thoughts, {{firstName}}?" }
  );
  db.sequences.push({ id: "seq1", name: "PSLE English Outreach", isActive: true });
  db.sequenceSteps.push(
    { id: "s1", sequenceId: "seq1", order: 0, dayOffset: 0, templateId: "tpl1", stopOnReply: true },
    { id: "s2", sequenceId: "seq1", order: 1, dayOffset: 2, templateId: "tpl2", stopOnReply: true }
  );
  return db;
}

const asDb = (db: FakeDb) => db as unknown as PrismaClient;

describe("advanceEnrollments", () => {
  it("drafts the first step's message when due (dayOffset 0)", async () => {
    const db = seedBasic();
    db.enrollments.push({
      id: "e1",
      contactId: "c1",
      sequenceId: "seq1",
      status: "active",
      currentStep: 0,
      enrolledAt: new Date("2026-01-01T04:00:00Z"),
    });
    const result = await advanceEnrollments(asDb(db), new Date("2026-01-01T05:00:00Z"));
    expect(result.createdMessageIds).toHaveLength(1);
    const msg = db.messages[0];
    expect(msg.status).toBe("queued");
    expect(msg.subject).toBe("Hi Wei");
    expect(msg.body).toBe("For Rosyth School");
    expect(db.enrollments[0].currentStep).toBe(1);
    expect(db.enrollments[0].status).toBe("active");
  });

  it("does not draft the next step before its business-day offset is due", async () => {
    const db = seedBasic();
    db.enrollments.push({
      id: "e1",
      contactId: "c1",
      sequenceId: "seq1",
      status: "active",
      currentStep: 1, // step 2 has dayOffset 2
      enrolledAt: new Date("2026-01-01T04:00:00Z"), // Thursday
    });
    // Only 1 day later — step 2 (2 business days) not yet due.
    const result = await advanceEnrollments(asDb(db), new Date("2026-01-02T05:00:00Z"));
    expect(result.createdMessageIds).toHaveLength(0);
  });

  it("completes the enrollment after the last step is drafted", async () => {
    const db = seedBasic();
    db.enrollments.push({
      id: "e1",
      contactId: "c1",
      sequenceId: "seq1",
      status: "active",
      currentStep: 1,
      enrolledAt: new Date("2026-01-01T04:00:00Z"),
    });
    // Far enough in the future that step 2 is due.
    await advanceEnrollments(asDb(db), new Date("2026-01-20T05:00:00Z"));
    expect(db.enrollments[0].status).toBe("completed");
  });

  it("STOPS an enrollment when the contact has replied", async () => {
    const db = seedBasic();
    db.messages.push({ id: "m0", contactId: "c1", status: "replied", repliedAt: new Date() });
    db.enrollments.push({
      id: "e1",
      contactId: "c1",
      sequenceId: "seq1",
      status: "active",
      currentStep: 0,
      enrolledAt: new Date("2026-01-01T04:00:00Z"),
    });
    const result = await advanceEnrollments(asDb(db), new Date("2026-01-05T05:00:00Z"));
    expect(result.stoppedEnrollmentIds).toContain("e1");
    expect(db.enrollments[0].status).toBe("stopped");
    expect(db.enrollments[0].stoppedReason).toBe("replied");
    // No new draft was created beyond the existing replied message.
    expect(result.createdMessageIds).toHaveLength(0);
  });

  it("STOPS an enrollment when the contact has bounced", async () => {
    const db = seedBasic();
    db.messages.push({ id: "m0", contactId: "c1", status: "bounced", bouncedAt: new Date() });
    db.enrollments.push({
      id: "e1",
      contactId: "c1",
      sequenceId: "seq1",
      status: "active",
      currentStep: 0,
      enrolledAt: new Date("2026-01-01T04:00:00Z"),
    });
    const result = await advanceEnrollments(asDb(db), new Date("2026-01-05T05:00:00Z"));
    expect(db.enrollments[0].status).toBe("stopped");
    expect(db.enrollments[0].stoppedReason).toBe("bounced");
    expect(result.createdMessageIds).toHaveLength(0);
  });

  it("STOPS an enrollment when the contact's email is suppressed", async () => {
    const db = seedBasic();
    db.suppressions.push({ id: "sup1", email: "wei@rosyth.edu.sg", reason: "opt-out" });
    db.enrollments.push({
      id: "e1",
      contactId: "c1",
      sequenceId: "seq1",
      status: "active",
      currentStep: 0,
      enrolledAt: new Date("2026-01-01T04:00:00Z"),
    });
    const result = await advanceEnrollments(asDb(db), new Date("2026-01-05T05:00:00Z"));
    expect(db.enrollments[0].status).toBe("stopped");
    expect(db.enrollments[0].stoppedReason).toBe("suppressed");
    expect(result.createdMessageIds).toHaveLength(0);
  });
});

describe("suppression prevents sending / enrolling", () => {
  it("simulateSend refuses to send to a suppressed contact", async () => {
    const db = seedBasic();
    db.contacts[0].suppressed = true;
    db.messages.push({ id: "m1", contactId: "c1", status: "queued", subject: "Hi" });
    const res = await simulateSend(asDb(db), "m1");
    expect(res.ok).toBe(false);
    expect(db.messages[0].status).toBe("queued"); // unchanged, never sent
  });

  it("simulateSend refuses when the email is on the suppression list", async () => {
    const db = seedBasic();
    db.suppressions.push({ id: "s1", email: "wei@rosyth.edu.sg" });
    db.messages.push({ id: "m1", contactId: "c1", status: "queued", subject: "Hi" });
    const res = await simulateSend(asDb(db), "m1");
    expect(res.ok).toBe(false);
  });

  it("enrollContact refuses to enroll a suppressed contact", async () => {
    const db = seedBasic();
    db.contacts[0].suppressed = true;
    const res = await enrollContact(asDb(db), "c1", "seq1");
    expect(res.ok).toBe(false);
    expect(db.enrollments).toHaveLength(0);
  });

  it("isEmailSuppressed reflects the suppression list", async () => {
    const db = seedBasic();
    expect(await isEmailSuppressed(asDb(db), "wei@rosyth.edu.sg")).toBe(false);
    db.suppressions.push({ id: "s1", email: "wei@rosyth.edu.sg" });
    expect(await isEmailSuppressed(asDb(db), "wei@rosyth.edu.sg")).toBe(true);
  });
});

describe("simulateSend + follow-up scheduling", () => {
  it("sends (simulated), sets sentAt, logs Activity, schedules 2 follow-ups", async () => {
    const db = seedBasic();
    db.messages.push({ id: "m1", contactId: "c1", status: "queued", subject: "Hi Wei" });
    const res = await simulateSend(asDb(db), "m1", new Date("2026-01-01T04:00:00Z"));
    expect(res.ok).toBe(true);
    expect(db.messages[0].status).toBe("sent");
    expect(db.messages[0].sentAt).toBeInstanceOf(Date);
    expect(db.followUps).toHaveLength(2);
    expect(db.followUps.map((f) => f.businessDaysOffset).sort()).toEqual([2, 3]);
    expect(db.activities.some((a) => a.type === "email_sent")).toBe(true);
    // Pipeline advanced to Contacted.
    expect(db.contacts[0].pipelineStageId).toBe("st-contacted");
  });
});

describe("simulateEvent tracking + suppression", () => {
  it("reply stops active enrollments and moves to Replied", async () => {
    const db = seedBasic();
    db.messages.push({ id: "m1", contactId: "c1", status: "sent", sentAt: new Date() });
    db.enrollments.push({ id: "e1", contactId: "c1", sequenceId: "seq1", status: "active", currentStep: 1, enrolledAt: new Date() });
    const res = await simulateEvent(asDb(db), "m1", "reply");
    expect(res.ok).toBe(true);
    expect(db.messages[0].status).toBe("replied");
    expect(db.enrollments[0].status).toBe("stopped");
    expect(db.contacts[0].pipelineStageId).toBe("st-replied");
  });

  it("bounce stops enrollments AND adds the contact to Suppression", async () => {
    const db = seedBasic();
    db.messages.push({ id: "m1", contactId: "c1", status: "sent", sentAt: new Date() });
    db.enrollments.push({ id: "e1", contactId: "c1", sequenceId: "seq1", status: "active", currentStep: 1, enrolledAt: new Date() });
    const res = await simulateEvent(asDb(db), "m1", "bounce");
    expect(res.ok).toBe(true);
    expect(res.suppressed).toBe(true);
    expect(db.messages[0].status).toBe("bounced");
    expect(db.enrollments[0].status).toBe("stopped");
    expect(db.suppressions.some((s) => s.email === "wei@rosyth.edu.sg")).toBe(true);
    expect(db.contacts[0].suppressed).toBe(true);
  });

  it("open stamps openedAt without stopping enrollments", async () => {
    const db = seedBasic();
    db.messages.push({ id: "m1", contactId: "c1", status: "sent", sentAt: new Date() });
    db.enrollments.push({ id: "e1", contactId: "c1", sequenceId: "seq1", status: "active", currentStep: 1, enrolledAt: new Date() });
    const res = await simulateEvent(asDb(db), "m1", "open");
    expect(res.ok).toBe(true);
    expect(db.messages[0].openedAt).toBeInstanceOf(Date);
    expect(db.enrollments[0].status).toBe("active");
  });
});
