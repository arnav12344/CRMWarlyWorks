/**
 * Unread-reply helpers for the in-app notification badge.
 *
 * A reply is "unread" while its inbound EmailMessage row (status replied/optout)
 * has no `seenAt`. Opening the Replies page marks them seen, which clears the
 * badge. Auto-replies and bounce notices don't count as replies to read.
 */

import type { PrismaClient } from "@prisma/client";

type Db = PrismaClient;

/** Human replies/opt-outs that haven't been marked read yet. */
export async function countUnreadReplies(db: Db): Promise<number> {
  return db.emailMessage.count({
    where: { direction: "inbound", status: { in: ["replied", "optout"] }, seenAt: null },
  });
}

/** Mark all currently-unread replies as read. Returns how many were updated. */
export async function markRepliesSeen(db: Db, now: Date = new Date()): Promise<number> {
  const res = await db.emailMessage.updateMany({
    where: { direction: "inbound", status: { in: ["replied", "optout"] }, seenAt: null },
    data: { seenAt: now },
  });
  return res.count;
}
