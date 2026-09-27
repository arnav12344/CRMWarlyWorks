-- Supabase exposes the public schema through its Data API (PostgREST).
-- The app only talks to Postgres through Prisma (as the table owner, which
-- bypasses RLS), so we enable Row Level Security with NO policies on every
-- table. That makes the tables unreachable through the Data API / anon key
-- while leaving Prisma access unchanged.
ALTER TABLE "ContactType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineStage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailVerification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Snippet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SequenceStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SequenceEnrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FollowUp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Suppression" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportRow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
