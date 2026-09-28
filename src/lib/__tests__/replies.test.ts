import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { FakeDb } from "./fakeDb";
import { countUnreadReplies, markRepliesSeen } from "../replies";

const asDb = (db: FakeDb) => db as unknown as PrismaClient;

function seed() {
  const db = new FakeDb();
  db.messages.push(
    { id: "r1", direction: "inbound", status: "replied", seenAt: null },
    { id: "r2", direction: "inbound", status: "optout", seenAt: null },
    { id: "r3", direction: "inbound", status: "replied", seenAt: new Date() }, // already read
    { id: "r4", direction: "inbound", status: "autoreply", seenAt: null }, // not a human reply
    { id: "r5", direction: "inbound", status: "bounce_notice", seenAt: null }, // not a reply
    { id: "o1", direction: "outbound", status: "sent", seenAt: null } // outbound never counts
  );
  return db;
}

describe("unread replies", () => {
  it("counts only unseen human replies and opt-outs", async () => {
    const db = seed();
    expect(await countUnreadReplies(asDb(db))).toBe(2);
  });

  it("marking seen clears the unread count", async () => {
    const db = seed();
    const n = await markRepliesSeen(asDb(db), new Date("2026-09-29T00:00:00Z"));
    expect(n).toBe(2);
    expect(await countUnreadReplies(asDb(db))).toBe(0);
    // Auto-reply / bounce / outbound were left alone.
    expect(db.messages.find((m) => m.id === "r4")?.seenAt).toBeNull();
    expect(db.messages.find((m) => m.id === "o1")?.seenAt).toBeNull();
  });
});
