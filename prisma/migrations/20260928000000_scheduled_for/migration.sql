-- Per-message send scheduling.
ALTER TABLE "EmailMessage" ADD COLUMN "scheduledFor" TIMESTAMP(3);
CREATE INDEX "EmailMessage_scheduledFor_idx" ON "EmailMessage"("scheduledFor");
