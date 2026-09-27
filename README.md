# WarlyWorks Outreach CRM

A founder-friendly outreach CRM for WarlyWorks' go-to-market: find schools,
tuition centres, NGOs, funders and partners; verify their emails; send
personalized outreach from **a@warlyworks.com**; and track every reply.
Apollo-style, but reduced to **four steps**:

1. **Add leads** — import a CSV/XLSX (messy Google Maps scraper exports are fine)
2. **Verify emails** — MillionVerifier / ZeroBounce, only unchecked addresses use credits
3. **Write & send** — pick leads, choose a template or sequence, preview, send
4. **Replies & pipeline** — replies, bounces and opt-outs arrive automatically

Everything else (contacts, sequences & templates, analytics, settings) lives under **More**.

---

## How it works

| Piece | What it does |
| --- | --- |
| **Hosting** | Netlify (Next.js 15 App Router). A scheduled function (`netlify/functions/tick.mts`) runs every 10 minutes. |
| **Database** | Supabase Postgres via Prisma. Row Level Security is enabled on every table so Supabase's public Data API can't read them; the app connects as the table owner. |
| **Sending** | Gmail SMTP, logged in as `GMAIL_USER`, From: `MAIL_FROM_ADDRESS` (a verified Gmail "Send mail as" alias). Gmail keeps a copy in Sent. |
| **Replies** | Cloudflare Email Routing forwards mail for a@warlyworks.com into the Gmail inbox. The app reads new INBOX messages over IMAP and classifies them: reply, bounce, opt-out ("unsubscribe"), auto-reply, or unrelated. |
| **Follow-ups** | Sequence steps are drafted into **Ready to send** when due (business days, Singapore time). Nothing is sent automatically — you always click Send. |

### Send safety checks (`src/lib/outreach.ts → sendMessage`)

A message is only sent when **all** of these pass: not already sent/replied/bounced,
contact has an email and isn't suppressed, not a reserved demo domain, no
unfilled merge fields (`[firstName?]`), its sequence hasn't been stopped, the
**daily limit** (default 50/day, Singapore time) isn't reached, and Gmail is
configured. The message is claimed atomically first so a double click can't send
twice. Every email gets an opt-out line and a `List-Unsubscribe` header.

### Personalization

Templates use `{{firstName}}`, `{{orgName}}`, `{{city}}`, `{{title}}`,
`{{contactType}}` and snippets `{{snippet:Label}}`. Add a fallback with a pipe:
`{{firstName|there}}` → "Hi there" when a lead (like info@school) has no name.

---

## Environment variables

See `.env.example`. All secrets live in env vars (Netlify → Site configuration →
Environment variables), never in git.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase **transaction pooler** (port 6543) + `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Supabase **session pooler / direct** (port 5432) for migrations |
| `APP_ENCRYPTION_KEY` | 32-byte hex; encrypts verifier API keys stored in the DB |
| `GMAIL_USER` | Gmail account that sends and reads mail |
| `GMAIL_APP_PASSWORD` | Google App Password (needs 2-Step Verification) |
| `MAIL_FROM_ADDRESS` | `a@warlyworks.com` |
| `MAIL_FROM_NAME` | Display name, e.g. `Arnav from WarlyWorks` |
| `CRON_SECRET` | Protects `/api/cron/tick` |

Local dev: append `&schema=dev` to both database URLs so dev data stays out of production (`public` schema).

---

## Run locally

Requires Node.js 22.

```bash
npm install                  # also runs prisma generate
cp .env.example .env         # fill in values (dev schema!)
npm run db:migrate           # apply migrations
npm run seed:config          # contact types, stages, templates, snippets, sequences
npm run dev                  # http://localhost:3000
```

Optional fake data for trying the UI (dev only — wipes contacts/messages, all demo
emails use the reserved `.example` domain so they can never be sent):

```bash
ALLOW_DEMO_SEED=1 npm run seed        # PowerShell: $env:ALLOW_DEMO_SEED=1; npm run seed
```

Other scripts: `npm test`, `npm run lint`, `npm run build`.

---

## Deploy (Netlify)

```bash
npx netlify login
npx netlify sites:create --name <site-name>   # or: npx netlify link
npx netlify env:set GMAIL_APP_PASSWORD "..."  # repeat for each variable above
# production database (public schema):
DATABASE_URL=... DIRECT_URL=... npm run db:migrate
DATABASE_URL=... DIRECT_URL=... npm run seed:config
npx netlify deploy --build --prod
```

After deploy: open **Settings → Send test email to myself**, then check
`/api/health`. The scheduled `tick` function shows under Netlify → Functions
(use **Run now** to trigger it once).

---

## Deliverability notes (warlyworks.com in Cloudflare DNS)

- **SPF**: one TXT record on `warlyworks.com` including both Cloudflare (inbound
  routing) and Google (outbound via Gmail):
  `v=spf1 include:_spf.mx.cloudflare.net include:_spf.google.com ~all`
- **DMARC**: keep `v=DMARC1; p=none; ...` — Gmail signs alias mail with a
  gmail.com DKIM key, so a strict policy (`quarantine`/`reject`) on warlyworks.com
  would send your own mail to spam.
- Check a sent test email in Gmail: ⋮ → **Show original** → SPF / DKIM / DMARC.
- Google has announced that Gmail's "Send mail as" for third-party addresses ends
  in **January 2027**. If that affects the alias, swap the transport in
  `src/lib/mail/mailer.ts` (e.g. Google Workspace, Zoho or Resend) — nothing else changes.

---

## Security

- **There is no login.** Anyone with the site URL can see contacts and send email
  from your Gmail. Keep the URL private (the site is `noindex`). Adding a password
  gate is a small follow-up.
- `/api/cron/tick` requires `CRON_SECRET`.
- Verifier API keys are encrypted at rest (AES-256-GCM) and only shown masked.
- Import redacts `api_key` / `token` / `secret` / `password` values before storing anything.
