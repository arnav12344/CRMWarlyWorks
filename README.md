# WarlyWorks Outreach CRM

A founder-friendly outreach CRM built for Arnav to run WarlyWorks' go-to-market:
find schools, tuition centres, NGOs, funders, partners and educators; clean and
verify their emails; send personalized outreach; and track every reply, meeting
and follow-up in one place. Think of it as a focused, self-hosted alternative to
tools like Apollo / Instantly / Lemlist, tuned for the WarlyWorks PSLE English
story and safe to run on messy scraped lead lists.

Everything you configure — the **types of people to contact**, your **pipeline
stages**, **sequences**, **templates** and **proof-point snippets** — is stored
as editable DATA in the database. Nothing like "NGO" or "School" is hardcoded in
the code, so you can add, rename or delete categories from the UI at any time.

---

## Feature list

- **Import pipeline** — Upload CSV / XLSX (including messy Google-Maps-scraper
  exports with parent-job + per-city subtask rows and lead data buried in nested
  `data` / `metadata` / `error` JSON columns). The wizard previews detected
  columns, surfaces the businesses found inside nested JSON, and lets you map
  columns to fields.
- **Secret redaction** — Any `api_key` / `token` / `secret` / `password` /
  `bearer` value (flat or nested, even inside stringified JSON) is redacted to
  `[REDACTED]` *before* anything is stored. A prominent banner reports how many
  secrets were caught. Secrets are never written to the database.
- **Dedupe & split** — Organizations are deduped by normalized domain (or
  name+city) and merged instead of duplicated; contacts are split out from
  organizations. Role inboxes (`info@`, `admissions@`, …) are auto-flagged.
- **Dual email verification** — Cross-check deliverability with **MillionVerifier**
  and **ZeroBounce** behind a provider-agnostic interface. A consensus layer
  classifies each address (valid / invalid / catch-all / disposable / role /
  unknown) and whether it is likely an individual vs a role mailbox. When no API
  keys are configured it degrades gracefully to a built-in **mock** verifier so
  the queue never crashes.
- **Personalized composer** — Templates with merge variables (`{{firstName}}`,
  `{{orgName}}`, `{{city}}`, …) plus a reusable **proof-point / snippet library**
  (`{{snippet:PSLE Proof}}`). Live preview; missing variables show a visible
  placeholder instead of crashing.
- **Review-before-send queue** — Drafts land in an approval queue. Approve →
  Send (simulated) sets `sentAt`, logs activity, advances the pipeline stage,
  and auto-schedules follow-ups.
- **Multi-step sequences (drip)** — Build ordered steps with business-day
  offsets and a template per step. Enroll one or many contacts. Sequences
  auto-stop on reply, bounce or opt-out, and never touch suppressed contacts.
- **Business-day follow-up reminders** — 2-day and 3-day follow-ups computed on
  **Asia/Singapore** business days (weekends skipped) and surfaced on the
  dashboard as "due today" / "overdue".
- **Reply / pipeline tracking** — Simulate opens, replies and bounces to move
  contacts through configurable stages; bounces and opt-outs add the address to
  the **suppression** list automatically.
- **Leads table (Apollo-style)** — Filter by contact type, pipeline stage,
  verification status and suppression; save segments; bulk-enroll or bulk-verify;
  engagement columns (sent / replied / last activity).
- **Contact detail timeline** — Org, type, editable pipeline stage, verification
  results, sequence status, quick actions, and a merged chronological activity
  timeline.
- **Daily action dashboard** — The in-app operational home, served at
  `/dashboard`: live counts for follow-ups due today, overdue follow-ups, new
  replies, drafts to approve, the verification queue, recent bounces, and warm
  prospects / upcoming meetings.
- **Public landing page** — Visiting `/` shows a static marketing page that
  describes the product, with calls-to-action into the app at `/dashboard` and
  `/leads`.
- **Funnel analytics** — Imported → Verified → Contacted → Replied → Positive →
  Meeting with conversion rates, plus breakdowns by contact type and pipeline
  stage.
- **Settings** — Store MillionVerifier & ZeroBounce API keys (encrypted) and set
  the default timezone.

---

## The exact end-to-end user workflow

1. **Import** — Upload a CSV/XLSX lead export in the Import wizard.
2. **Dedupe / clean & secret redaction** — The pipeline flattens scraper rows,
   extracts businesses from nested JSON, **redacts any secret-like fields before
   storage**, dedupes organizations, and splits out contacts.
3. **Dual verify** — Queue addresses in Verification. MillionVerifier + ZeroBounce
   cross-check each email; a consensus mailbox type and likely-individual flag are
   stored. Without keys, the mock verifier fills in results so nothing breaks.
4. **Segment** — In the Leads table, filter by contact type / stage / verification
   / suppression and save segments to target the right people.
5. **Compose / personalize** — Pick a contact and template, insert proof-point
   snippets, and preview the merged, personalized email.
6. **Review before send (approve)** — The draft goes to the review queue. Approve
   it (or send it back to drafts).
7. **Enroll in a sequence** — Optionally enroll the contact (or a bulk selection)
   into a multi-step drip sequence.
8. **Send / track** — "Send" (simulated) marks the message sent, logs activity,
   and advances the pipeline stage.
9. **Business-day follow-up reminders** — 2-day and 3-day follow-ups are scheduled
   automatically on Asia/Singapore business days.
10. **Reply / pipeline tracking** — Replies, opens and bounces move contacts
    through your configurable stages; bounces and opt-outs auto-suppress.
11. **Dashboard & analytics** — The daily action dashboard at `/dashboard` tells
    you what to do today; analytics shows the funnel and conversion rates.

---

## How to run

Requires Node.js 22 and npm. The database is embedded SQLite (no external
service to install).

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file (see .env.example)
#    DATABASE_URL="file:./dev.db"
#    APP_ENCRYPTION_KEY="<64 hex chars or any passphrase>"
cp .env.example .env   # then edit APP_ENCRYPTION_KEY

# 3. Generate the Prisma client and create the database schema
npx prisma generate
npx prisma migrate dev      # or: npx prisma db push

# 4. Seed the full demo dataset (reset + reseed)
npm run seed

# 5. Run the app
npm run dev                 # http://localhost:3000
```

Once running, `http://localhost:3000/` is the public marketing landing page
(static; describes the product and links into the app), and
`http://localhost:3000/dashboard` is the live daily action dashboard.

Other scripts: `npm run build`, `npm start`, `npm run lint`, `npm test`.

`npm run seed` is **reset-and-reseed**: it clears transactional data and rebuilds
a consistent snapshot (contact types, pipeline stages, snippets, templates,
sequences, ~25 organizations + contacts with varied verification results, sent /
replied / bounced messages, follow-ups due today and overdue, suppression
entries and an activity timeline). Your saved Settings (encrypted API keys) are
preserved.

---

## Configuring verification API keys (MillionVerifier + ZeroBounce)

1. Open **Settings** in the app.
2. Paste your MillionVerifier and/or ZeroBounce API key and save.
3. Keys are **encrypted at rest** with AES-256-GCM (keyed by `APP_ENCRYPTION_KEY`)
   and stored in `Setting.valueEncrypted`. They are **never** shown in plaintext —
   the UI only displays a masked last-4 and a "configured" badge.
4. With at least one key set, verification runs the real providers. With **no**
   keys, verification transparently falls back to the offline mock verifier so
   the queue still produces results.

---

## Everything configurable is DATA (NGOs are not hardcoded)

Contact types, pipeline stages, sequences, templates and snippets live in
database tables (`ContactType`, `PipelineStage`, `Sequence`/`SequenceStep`,
`Template`, `Snippet`) — not in TypeScript enums. The seed ships **School,
Tuition Centre, NGO, Funder, Partner, Educator** as example rows and **New,
Verified, Contacted, Replied, Positive, Meeting, Closed** (plus **Not
Interested**) as example stages, but you can add, rename or delete any of them
from the UI. Add a new "type of person to contact" and it flows through import,
segmentation, and analytics automatically.

---

## Stubbed vs fully working

**Fully working (persists to SQLite):**

- Import parsing, nested-JSON extraction, secret redaction, dedupe, org/contact
  split, and import provenance (`ImportBatch` / `ImportRow`).
- Email verification consensus and the mock/offline verifier.
- Templates, snippets, sequences, enrollments and business-day follow-up
  scheduling (Asia/Singapore).
- Review-before-send approval, pipeline stage movement, suppression / opt-out
  handling, per-contact activity timeline.
- Encrypted storage of provider API keys.
- Dashboard live counts and funnel analytics.

**Stubbed / simulated:**

- **Email sending is simulated.** There is no SMTP configured. "Send" marks the
  message sent, stamps `sentAt`, logs an activity and schedules follow-ups — it
  does **not** deliver real mail. Opens, replies and bounces are simulated via UI
  actions so the tracking, suppression and auto-stop flows can be demonstrated
  end-to-end.
- **Verification providers use a mock fallback** whenever MillionVerifier /
  ZeroBounce keys are absent, so the app never crashes on missing keys. With real
  keys, the real provider APIs are called.

Everything else persists to the local SQLite database (`dev.db`), which is
gitignored, as is your `.env`.
