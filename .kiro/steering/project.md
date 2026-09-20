---
inclusion: always
---

# WarlyWorks — Outreach CRM

An all-in-one cold-outreach CRM for a founder doing personalized outreach (targeting Singapore schools / PSLE English education). Apollo.io in spirit: import leads, verify emails, run sequences, track emails/replies, and manage a pipeline.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Prisma ORM + SQLite (embedded — the DB is just a local file `prisma/dev.db`)
- vitest for tests, lucide-react icons, date-fns-tz for Asia/Singapore times

## How to run it locally (Windows-friendly)

1. `npm install`
2. Copy `.env.example` to `.env`, then set a real `APP_ENCRYPTION_KEY` (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). `DATABASE_URL` should be `"file:./dev.db"`.
3. `npx prisma generate` (generates the Prisma client)
4. `npx prisma migrate dev` (creates dev.db + tables)
5. `npm run seed` (loads sample data)
6. `npm run dev` (http://localhost:3000)

Note: `npm run build` runs `prisma generate` automatically, but `npm run dev` does NOT. On a fresh clone you must run prisma generate + migrate before dev, and create `.env` (which is gitignored) from `.env.example`.

## Routing / structure

- `/` -> public marketing LANDING page (shell-less, static): `src/app/page.tsx`
- `/dashboard` -> daily-action DASHBOARD (live Prisma data): `src/app/(app)/dashboard/page.tsx`
- App routes live under the `src/app/(app)/` route group (Sidebar + Topbar shell in `(app)/layout.tsx`): `/leads`, `/contacts`, `/contacts/[id]`, `/compose`, `/sequences`, `/import`, `/verification`, `/analytics`, `/settings`
- API route handlers: `src/app/api/*`
- Root layout `src/app/layout.tsx` is minimal (html/body + globals.css)
- UI primitives: `src/components/ui/*` ; nav: `src/components/Sidebar.tsx`, `Topbar.tsx`
- Prisma schema: `prisma/schema.prisma` ; seed: `prisma/seed.ts` ; db client: `src/lib/db.ts`
- Business-day reminder logic: `src/lib/reminders.ts` (`APP_TIMEZONE = Asia/Singapore`)
- Import + secret redaction: `src/lib/import/*` (redacts api_key/token/secret before persisting)

## Features already built

- Import wizard for messy Google-Maps-scraper CSV/XLSX (nested JSON, dedupe, secret redaction)
- Data-driven contact types & pipeline stages (editable records, NOT hardcoded)
- Dual email verification (MillionVerifier + ZeroBounce) behind a provider interface, keys stored ENCRYPTED via `APP_ENCRYPTION_KEY`, mock fallback when keys absent
- Personalized composer (templates + merge vars + proof-point snippets) + review-before-send queue
- Multi-step sequences with auto-stop on reply/bounce/opt-out; 2-day/3-day business-day follow-ups
- Suppression/opt-out, per-contact activity timeline, funnel analytics, daily-action dashboard

## Known intentional stubs

- Email SENDING is simulated (no SMTP wired up) — sends are tracked/labeled in the UI
- Verification uses a mock until real MillionVerifier/ZeroBounce keys are entered in Settings

## Conventions

- Keep configurable things (contact types, pipeline stages, sequences, templates) as DATA, not hardcoded.
- Reuse existing UI primitives and the `brand-*`/`accent-*` Tailwind palette.
- After changes, run: `npm run build`, `npm test`, `npm run lint` — keep them passing.
