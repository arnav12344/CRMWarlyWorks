# WarlyWorks — Outreach CRM

_This file mirrors `.kiro/steering/project.md` (auto-loaded by the Kiro editor). See README.md for setup, deployment and DNS notes._

A cold-outreach CRM for a founder doing personalized outreach to Singapore schools / PSLE English partners, in 4 steps: **Add leads → Verify emails → Write & send → Replies & pipeline**.

- Next.js 15 + TypeScript + Tailwind (navy `brand-*`, marigold `accent-*`), Prisma + Supabase Postgres, hosted on Netlify
- Real email through Gmail SMTP as `a@warlyworks.com`; replies/bounces/opt-outs read from the Gmail inbox over IMAP (Cloudflare Email Routing forwards the alias)
- Scheduled function every 10 min: drafts due sequence steps into Ready to send + syncs the inbox
- Nothing is sent without clicking Send; daily limit 50 (Singapore day); follow-ups go out as replies in the same thread; your signature (Settings) is appended; no opt-out footer (replies like "unsubscribe" still auto-suppress)
- Verification only spends credits on unchecked addresses; never mocked in production
- No login yet — keep the URL private
