# LeadPilot

Find local businesses, collect their public contact details, and send personalised outreach from your own inboxes, with every email reviewed by you first.

```
leadpilot/
  server/   Express + TypeScript + MongoDB API, email scheduler and reply checker   (port 4000)
  web/      Next.js 14 + Tailwind + Framer Motion                                   (port 3000)
```

## What it does

1. **Find leads.** Search any business type or keyword in any place (Google Places). Filter by rating, reviews, price, website, phone.
2. **Collect contacts.** Save the businesses you tick, scan their websites for public emails and social profiles, check emails with MillionVerifier, export to Excel or CSV.
3. **Outreach.** Create a campaign with a first email and up to three follow-ups. Claude writes one personal line per business (reading their website). You review, edit and approve every first email. Approved emails go out from your inboxes during your sending hours, with random gaps and daily caps. Replies and bounces are detected automatically and stop the follow-ups. Every email has a one-click unsubscribe.

## Setup

You need Node 20+, MongoDB Atlas and a Google Places API (New) key. Claude and MillionVerifier keys are optional; the related features stay off without them.

```bash
# API
cd server
cp .env.example .env     # fill it in, see below
npm install
npm run dev              # expect: MongoDB connected / Email scheduler running / listening on :4000

# Web app (second terminal)
cd web
cp .env.example .env.local
npm install
npm run dev              # http://localhost:3000
```

Register at http://localhost:3000/register with the email you put in `ADMIN_EMAILS` to get the unlimited plan.

### Server .env essentials

| Variable | Notes |
|---|---|
| `MONGODB_URI` | Include the database name: `.../leadpilot?retryWrites=true&w=majority` |
| `JWT_SECRET` | 64 random hex characters |
| `ENCRYPTION_KEY` | 64 random hex characters. Encrypts inbox passwords. **Never change it after connecting inboxes**, or they'll need reconnecting. |
| `PUBLIC_APP_URL` | Your public web address. Used in unsubscribe and password-reset links. Campaigns refuse to start while it points to localhost. |
| `GOOGLE_PLACES_API_KEY` | Required |
| `ANTHROPIC_API_KEY` | Optional. Turns on the AI personal line (model `claude-haiku-5-5`). |
| `MILLIONVERIFIER_API_KEY` | Optional. Turns on "Check emails". |
| `SYSTEM_SMTP_URL` | Optional. Sends password-reset emails. Without it, reset links print in the server console. |
| `DNS_SERVERS` | Only if MongoDB fails with `querySrv ECONNREFUSED` on Windows: `1.1.1.1,8.8.8.8` |

Generate random hex in PowerShell: `-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })`

## First campaign, step by step

1. **Settings, Sender details.** Add your business name and postal address. They go in every footer; anti-spam law (CASL, CAN-SPAM, UK and EU rules) requires them.
2. **Settings, Sending inboxes.** Connect your outreach inboxes with an **app password**:
   - Gmail / Google Workspace: turn on 2-Step Verification, then create an app password at myaccount.google.com/apppasswords.
   - Zoho: My Account, Security, App Passwords, and enable IMAP in Mail settings. Use "Zoho Mail India" for zoho.in accounts.
   - Outlook / Microsoft 365: the admin must enable Authenticated SMTP for the mailbox.

   Use "Send me a test" to confirm it works.
3. **Outreach, New campaign.** Edit the emails on the Emails tab. Variables like `{{business_name}}` fill in per lead; `{{city|your area}}` sets a fallback. Describe what you offer so Claude has context.
4. **Sending tab.** Pick inboxes, timezone (your recipients'), hours, days and gap between emails.
5. **Leads.** Tick businesses with emails and choose **Add to campaign**. Optionally **Check emails** first.
6. **Review tab.** Read each draft, edit or rewrite the line, approve. Nothing sends without approval.
7. **Start sending.** The scheduler sends approved emails in your window. Follow-ups queue themselves and stop on reply, bounce or unsubscribe.

## Deliverability rules built in

- Plain-text emails, no images, no open-tracking pixels.
- Random gap between sends per inbox; daily cap per inbox (counted over the last 24 hours).
- `List-Unsubscribe` and one-click unsubscribe headers (Gmail and Yahoo expect them), plus a link in the footer.
- Bounces are added to the do-not-contact list automatically; unsubscribes mark the lead "Do not contact".
- Out-of-office replies don't stop a sequence; real replies do.

Your part: send from a **separate domain** (e.g. getbymsy.com) with SPF, DKIM and DMARC set up; warm each inbox up for 2 to 3 weeks; start at 20 to 30 emails per inbox per day.

## How it works

- The browser only talks to the Next.js app; `/api/*` is proxied to Express, so the session cookie stays first-party and httpOnly.
- **Scheduler** (`server/src/services/scheduler.ts`) runs every 20 seconds: for each active campaign in its window, each inbox under its cap and past its gap sends one approved email. Each email's Message-ID contains its database id, which is how replies and bounces are matched later.
- **Reply checker** (`server/src/services/replies.ts`) reads each inbox over IMAP every 3 minutes, only new messages since the last check.
- **AI line** (`server/src/services/ai.ts`) sends the lead's facts and a trimmed copy of their homepage to Claude. Website text is passed as data with an instruction to ignore anything inside it, so a website can't hijack the prompt.
- Inbox passwords are encrypted with AES-256-GCM (`server/src/lib/crypto.ts`) and never returned by the API.

## API overview

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register, /login, /logout, /forgot, /reset, /password` and `GET /api/auth/me` |
| Search | `POST /api/search`, `GET /api/search/history`, `GET /api/search/:id` |
| Leads | `GET /api/leads`, `GET /api/leads/summary`, `POST /api/leads/from-search, /enrich, /verify, /bulk-status, /delete, /export`, `PATCH /api/leads/:id` |
| Inboxes | `GET/POST /api/mailboxes`, `PATCH/DELETE /api/mailboxes/:id`, `POST /api/mailboxes/:id/test, /send-test` |
| Campaigns | `GET/POST /api/campaigns`, `GET/PATCH /api/campaigns/:id`, `POST /api/campaigns/:id/start, /pause, /archive, /leads` |
| Drafts | `GET /api/campaigns/:id/messages?view=review|approved|sent|replied|problems`, `POST .../messages/approve, /unapprove, /skip, /retry, /regenerate`, `PATCH .../messages/:messageId`, `POST .../messages/:messageId/test` |
| Settings | `GET/PATCH /api/settings`, `GET/POST /api/settings/suppression`, `DELETE /api/settings/suppression/:id` |
| Public | `GET/POST /api/u/:token` (unsubscribe) |

## Deploying

- **API** must run on an always-on server (Railway, Render, Fly.io or a VPS). The scheduler and reply checker live inside it, so serverless hosting won't work. Run exactly one instance, or set `SCHEDULER_ENABLED=false` on extra ones.
- **Web** on Vercel with `API_URL` set to the API's public URL.
- Set `NODE_ENV=production`, `WEB_ORIGIN` and `PUBLIC_APP_URL` to your web domain (https).
- In MongoDB Atlas, allow only the API server's IP. In Google Cloud, restrict the Places key to that IP and set a budget alert.

## Brand and icons

- Name and tagline: `web/lib/brand.ts`. Logo mark: `web/components/Logo.tsx`.
- Favicons follow Next.js file conventions, so no `<link>` tags are needed: `web/app/favicon.ico` (16, 32, 48), `web/app/icon.svg` (tab-optimised, heavier stroke), `web/app/apple-icon.png` (180), and `web/app/manifest.ts` pointing at `web/public/icon-192.png`, `icon-512.png` and `icon-maskable-512.png`.

## Ready for SaaS

Workspaces, plans and monthly limits (searches, website scans, email checks, AI lines, emails) are in place (`server/src/services/usage.ts`). `workspace.billing` is reserved for the payment provider. To launch paid plans: add Stripe or Paddle checkout, a webhook that sets `workspace.plan`, and a billing page. Teams can be added by allowing several users per workspace (the `role` field already exists).
