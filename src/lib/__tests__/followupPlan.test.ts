import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { FakeDb } from "./fakeDb";
import { personalizePlan, scheduleFollowUpEmails, validateFollowUps } from "../followupPlan";
import { contactMergeContext } from "../merge";

const asDb = (db: FakeDb) => db as unknown as PrismaClient;
const NOW = new Date("2026-09-28T02:00:00Z"); // Mon 10:00 Singapore

function seedFirst(db: FakeDb) {
  db.contacts.push({ id: "c1", email: "info@centre-stage.com", suppressed: false });
  const first = { id: "m-first", contactId: "c1", direction: "outbound", status: "queued" };
  db.messages.push(first);
  return first;
}

describe("scheduleFollowUpEmails", () => {
  it("creates a waiting afterDays follow-up and a queued date follow-up, linked to the first email, in order", async () => {
    const db = new FakeDb();
    seedFirst(db);
    const dateISO = "2026-10-05T01:00:00.000Z";

    const res = await scheduleFollowUpEmails(asDb(db), {
      firstMessageId: "m-first",
      firstSubject: "Your Christmas show + 5 speaking turns",
      contactId: "c1",
      toAddress: "info@centre-stage.com",
      followUps: [
        { body: "Just checking in", when: { kind: "afterDays", days: 2 } },
        { subject: "typed but ignored", body: "One more time", when: { kind: "date", dateISO } },
      ],
      now: NOW,
    });

    expect(res.ok).toBe(true);
    const followUps = db.messages.filter((m) => m.parentMessageId === "m-first");
    expect(followUps).toHaveLength(2);

    const [f1, f2] = followUps;
    // Follow-ups reply in the first email's thread, so they share its subject.
    expect(f1).toMatchObject({
      status: "waiting",
      followUpAfterDays: 2,
      scheduledFor: null,
      subject: "Re: Your Christmas show + 5 speaking turns",
      toAddress: "info@centre-stage.com",
      direction: "outbound",
    });
    expect(f2).toMatchObject({ status: "queued", followUpAfterDays: null, subject: "Re: Your Christmas show + 5 speaking turns" });
    expect((f2.scheduledFor as Date).toISOString()).toBe(dateISO);
  });

  it("stores only the body you wrote (no footer; the signature is added at send time)", async () => {
    const db = new FakeDb();
    seedFirst(db);
    await scheduleFollowUpEmails(asDb(db), {
      firstMessageId: "m-first",
      firstSubject: "Hello",
      contactId: "c1",
      toAddress: "info@centre-stage.com",
      followUps: [{ body: "Body only", when: { kind: "afterDays", days: 2 } }],
      now: NOW,
    });
    const f = db.messages.find((m) => m.parentMessageId === "m-first");
    expect(f?.body).toBe("Body only");
    expect(String(f?.body)).not.toContain("unsubscribe");
  });

  it("rejects a follow-up with no message and writes nothing", async () => {
    const db = new FakeDb();
    seedFirst(db);
    const res = await scheduleFollowUpEmails(asDb(db), {
      firstMessageId: "m-first",
      firstSubject: "Hello",
      contactId: "c1",
      toAddress: "info@centre-stage.com",
      followUps: [{ body: "   ", when: { kind: "afterDays", days: 2 } }],
      now: NOW,
    });
    expect(res.ok).toBe(false);
    expect(db.messages.filter((m) => m.parentMessageId === "m-first")).toHaveLength(0);
  });

  it("rejects a past date and writes nothing", async () => {
    const db = new FakeDb();
    seedFirst(db);
    const res = await scheduleFollowUpEmails(asDb(db), {
      firstMessageId: "m-first",
      contactId: "c1",
      toAddress: "info@centre-stage.com",
      followUps: [{ subject: "Late", body: "x", when: { kind: "date", dateISO: "2026-09-01T00:00:00Z" } }],
      now: NOW,
    });
    expect(res.ok).toBe(false);
    expect(db.messages.filter((m) => m.parentMessageId === "m-first")).toHaveLength(0);
  });

  it("validateFollowUps enforces day range and count", () => {
    expect(validateFollowUps([{ subject: "a", body: "b", when: { kind: "afterDays", days: 0 } }], NOW).ok).toBe(false);
    expect(validateFollowUps([{ subject: "a", body: "b", when: { kind: "afterDays", days: 61 } }], NOW).ok).toBe(false);
    const many = Array.from({ length: 11 }, () => ({ subject: "a", body: "b", when: { kind: "afterDays" as const, days: 2 } }));
    expect(validateFollowUps(many, NOW).ok).toBe(false);
  });
});

describe("personalizePlan (Email + follow-ups)", () => {
  const snippets = [{ label: "Sign-off", body: "Cheers, Arnav" }];
  const plan = (contact: Parameters<typeof contactMergeContext>[0]) =>
    personalizePlan({
      first: { subject: "Helping {{orgName}}", body: "Hi {{firstName|there}},\n\n{{snippet:Sign-off}}" },
      followUps: [{ body: "Any thoughts on this for {{orgName|your team}}, {{firstName}}?", when: { kind: "afterDays", days: 2 } }],
      context: contactMergeContext(contact),
      snippets,
    });

  it("fills each lead's fields into the first email and every follow-up", () => {
    const r = plan({ fullName: "Wei Tan", email: "wei@rosyth.edu.sg", organization: { name: "Rosyth School" } });
    expect(r.first).toEqual({ subject: "Helping Rosyth School", body: "Hi Wei,\n\nCheers, Arnav" });
    expect(r.followUps[0].body).toBe("Any thoughts on this for Rosyth School, Wei?");
    expect(r.followUps[0].when).toEqual({ kind: "afterDays", days: 2 });
    expect(r.unfilled).toEqual([]);
  });

  it("uses fallbacks, and flags a field the lead has no value for instead of sending it raw", () => {
    const r = plan({ email: "info@centre-stage.com", organization: { name: "Centre Stage" } });
    expect(r.first.body).toBe("Hi there,\n\nCheers, Arnav");
    expect(r.followUps[0].body).toBe("Any thoughts on this for Centre Stage, [firstName?]?");
    expect(r.unfilled).toEqual(["[firstName?]"]);
    expect(JSON.stringify(r)).not.toContain("{{");
  });
});
