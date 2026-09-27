---
inclusion: always
---

# WarlyWorks — Outreach CRM

A cold-outreach CRM for a founder doing personalized outreach to Singapore schools / PSLE English partners. Apollo.io-style flow in 4 steps: **Add leads → Verify emails → Write & send → Replies & pipeline**.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS (navy `brand-*` + marigold `accent-*`, Inter font)
- Prisma ORM + **Supabase Postgres** (pooled `DATABASE_URL` :6543 at runtime, `DIRECT_URL` :5432 for migrations; local dev uses `&schema=dev`)
- Real email: **Gmail SMTP** (nodemailer) as the alias `MAIL_FROM_ADDRESS` + **Gmail IMAP** (imapflow + mailparser) to detect replies/bounces/opt-outs
- Hosted on **Netlify** (Next.js adapter + scheduled function `netlify/functions/tick.mts` every 10 min)
- vitest for tests, lucide-react icons, date-fns-tz for Asia/Singapore times

## Run locally (Windows-friendly)

1. `npm install` (runs `prisma generate`)
2. Copy `.env.example` to `.env` and fill in values (Supabase dev-schema URLs, `APP_ENCRYPTION_KEY`, Gmail creds, `CRON_SECRET`)
3. `npm run db:migrate` (applies `prisma/migrations` to the schema in your URL)
4. `npm run seed:config` (config data only) — or `ALLOW_DEMO_SEED=1 npm run seed` for fake demo contacts on `.example` domains (dev only; wipes data)
5. `npm run dev` → http://localhost:3000

## Routing / structure

- `/` → Home with the 4 step cards: `src/app/(app)/page.tsx`. `/about` → marketing page. `/dashboard` and `/compose` redirect.
- Steps: `/leads` (+ `/import`), `/verification`, `/send` (Ready to send + New email wizard), `/replies` (replies, follow-ups, pipeline)
- "More": `/contacts`, `/contacts/[id]`, `/sequences`, `/analytics`, `/settings`
- Nav config: `src/components/steps.ts`; shell: `Sidebar.tsx`, `Topbar.tsx`, `(app)/layout.tsx`
- Send engine: `src/lib/outreach.ts` (`sendMessage` with safety checks, daily limit, opt-out footer)
- Mail: `src/lib/mail/{config,mailer,inbound,inbox}.ts`; cron: `src/lib/cron.ts` + `/api/cron/tick` (needs `CRON_SECRET`)
- Sequences: `src/lib/sequences.ts` (drafts due steps into Ready to send; never auto-sends)
- Verification: `src/lib/verify/*` — live providers only when a key exists; mock only outside production; credits in `credits.ts`
- Seed: `src/lib/seed/config.ts` (idempotent config), `prisma/seed.ts` (guarded demo)

## Rules that matter

- Nothing sends without the user clicking Send. Keep all send guards in `sendMessage`.
- Long work (import, verify, bulk send) is chunked from the browser — keep each request small (serverless time limits).
- "Today" = Singapore day (`src/lib/time.ts`), never server-local `setHours`.
- Keep configurable things (contact types, stages, sequences, templates, snippets) as DATA.
- Marigold (`accent-*`) is a fill with navy text only — never marigold text on white.
- After changes run `npm test`, `npm run lint`, `npm run build`.
- No login yet (user decision) — the site URL must be kept private.
