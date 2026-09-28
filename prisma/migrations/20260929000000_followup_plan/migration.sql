-- Write-your-own auto-follow-ups + inbound reply "seen" state. Additive only.

-- Link a follow-up email to the first email it follows up on.
ALTER TABLE "EmailMessage" ADD COLUMN "parentMessageId" TEXT;

-- "+N business days after the previous email" offset, resolved to scheduledFor
-- once the parent actually sends.
ALTER TABLE "EmailMessage" ADD COLUMN "followUpAfterDays" INTEGER;

-- When an inbound reply was marked read (for the unread-reply badge).
ALTER TABLE "EmailMessage" ADD COLUMN "seenAt" TIMESTAMP(3);

CREATE INDEX "EmailMessage_parentMessageId_idx" ON "EmailMessage"("parentMessageId");

ALTER TABLE "EmailMessage"
  ADD CONSTRAINT "EmailMessage_parentMessageId_fkey"
  FOREIGN KEY ("parentMessageId") REFERENCES "EmailMessage"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
