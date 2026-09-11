# Maker Lab client dashboard (GitHub Pages)

Pulls your Notion client data and Google Calendar on a schedule via
GitHub Actions, and publishes the command-deck dashboard as a static
site on GitHub Pages.

**Heads up on privacy:** this is a public repo/Pages setup. Anyone with
the URL can view the dashboard, including client names, task details,
check-in status, and (as of the company page) contact email addresses.
The page is marked `noindex` so search engines won't list it, but that
doesn't make it actually private. Treat the URL itself as something to
keep off public channels. If your GitHub org is later upgraded to
Enterprise Cloud, ask Claude Code to switch this to access-controlled
Pages instead.

As before, the fastest way to get this running is to hand the folder
to Claude Code and say: **"push this to a new GitHub repo, set up the
Pages workflow, and walk me through adding the secrets."**

## One-time setup

### 1. Notion integration
1. Create an integration at https://www.notion.so/my-integrations, copy its secret.
2. In Notion, share your "Companies & Clients CRM" page and the Tasks database with it (`...` menu → Connections).

### 2. Google Calendar + Sheets + Chat OAuth (local step, needed once)
1. In https://console.cloud.google.com: enable the **Calendar API**, the **Sheets API**, and the **Chat API**, create an OAuth **Desktop app** client, download the JSON as `google-credentials.json` in this folder.
2. Run:
   ```bash
   npm install
   npm run auth
   ```
3. This prints `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` — copy these, you'll need them in step 4.

If you'd already done this setup before "number of talent" or Chat were added, you need to redo this step - a refresh token only covers the scopes it was issued with, and Google won't let it grow new permissions after the fact. Re-running `npm run auth` gives you a fresh `GOOGLE_REFRESH_TOKEN` covering everything currently in `SCOPES`; update the GitHub secret with the new value.

**Chat access specifically may need one more thing.** Google treats Chat's read scopes as more sensitive than Calendar/Sheets. Before running `npm run auth`:
- Check your OAuth consent screen's user type (Cloud Console → APIs & Services → OAuth consent screen). If it's set to **Internal** (restricted to your Workspace), you're fine. If it's **External**, Google's verification review for these scopes can take weeks.
- If, after approving access in the browser, the connection still fails with something like "administrator has restricted this app" or "access blocked," that's your Workspace admin's API controls (Admin console → Security → API controls) blocking it — an admin needs to allowlist the app, not something fixable from this repo.

Once `npm run auth` succeeds, run `npm run chat-check` to confirm the Chat connection actually works — it lists the spaces/DMs it can see without touching the real dashboard build. Report back what it prints (or any error) before wiring Chat data into the dashboard itself.

### 3. Push to GitHub
```bash
git init
git add .
git commit -m "Initial dashboard"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```
`.gitignore` already excludes `.env`, `google-credentials.json`, `google-token.json`, and the generated `dashboard-data.json` — none of these should ever be committed.

### 4. Add repo secrets and variables
In your repo: **Settings → Secrets and variables → Actions**

Secrets (Settings → Secrets and variables → Actions → **Secrets** tab):
| Name | Value |
|---|---|
| `NOTION_TOKEN` | your Notion integration secret |
| `GOOGLE_CLIENT_ID` | from step 2 |
| `GOOGLE_CLIENT_SECRET` | from step 2 |
| `GOOGLE_REFRESH_TOKEN` | from step 2 |

Variables (same page, **Variables** tab — these aren't secret, just config):
| Name | Value |
|---|---|
| `NOTION_COMPANIES_DS` | `3c77f4cc-dcfc-8088-9e44-000ba802b165` |
| `NOTION_CLIENTS_CRM_DS` | `f5a7f4cc-dcfc-821c-97e5-07ac2f6d750a` |
| `NOTION_TASKS_DS` | `3c77f4cc-dcfc-8094-89fb-000bedf54690` |
| `TASK_OWNER_NAME` | `Me` |
| `EXCLUDE_COMPANIES` | `MKL Leadership & PM docs` |
| `TASK_LOOKAHEAD_DAYS` | `7` |
| `MEETING_LOOKAHEAD_DAYS` | `14` |
| `LAST_CONTACT_YELLOW_DAYS` | `14` |
| `LAST_CONTACT_RED_DAYS` | `30` |
| `GOOGLE_TALENT_SHEET_ID` | `1wAot7_LKf-oHhZNKYLhWcXBXL6MxjzzaQ7GjBbzPj74` |

The Google account you authorized in step 2 also needs at least Viewer access to that talent spreadsheet, same as any other Google Sheet you'd share.

For the Chat and Granola summaries (see below), add these secrets:
| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | an API key from https://console.anthropic.com (separate from your Claude subscription — this is metered, pay-as-you-go usage) |
| `GRANOLA_API_KEY` | from the Granola desktop app: Settings → Connectors → API keys (requires a Business or Enterprise plan) |

### 5. Enable Pages
**Settings → Pages → Build and deployment → Source: GitHub Actions**

### 6. Run it
**Actions tab → "Refresh and deploy dashboard" → Run workflow** (manual first run). After that it refreshes automatically every 30 minutes on weekdays, 7am-9pm SGT — edit the `cron` line in `.github/workflows/refresh-and-deploy.yml` to change that.

Your dashboard URL will be `https://<your-username>.github.io/<your-repo>/`, shown in the Actions run summary and in Settings → Pages.

## Local dev (optional)
`npm start` still runs the old live Express server on localhost if you want to iterate on layout/logic before pushing — it hits Notion/Calendar/Sheets directly rather than reading the static JSON.

## How the rules map to code
- **Tasks due this week**: `lib/dashboard-data.js` — Owner = `TASK_OWNER_NAME`, Status not Done, due within `TASK_LOOKAHEAD_DAYS`, sorted by date then client then task. Companies in `EXCLUDE_COMPANIES` are filtered out.
- **Next client touchpoints**: calendar attendee emails matched against Clients CRM contact emails, within `MEETING_LOOKAHEAD_DAYS`. Video link = call, physical location = face to face.
- **Client health**: per contact, using `LAST_CONTACT_YELLOW_DAYS` / `LAST_CONTACT_RED_DAYS`. No date logged shows as a distinct "unlogged" state.
- **Company lookup**: dropdown near the top of the dashboard, listing every company from Notion except anything with "MKL" in the name (Maker Lab's own internal entries, never real clients). Selecting one goes to that company's own page (`company.html`), showing its contacts (name, email, last known contact date) and its open tasks (with description and due date, pulled from Notion). Built in `lib/dashboard-data.js` (the `companies` field) and rendered in `public/app.js` / `public/company.js`. Company names in the tasks table, touchpoints, and client health list also link to this page.
- **Number of talent** (on each company page): count of current (non-terminated) people staffed on that account, from the "Client Contracts" tab of the talent tracker spreadsheet (`lib/sheets.js`, `GOOGLE_TALENT_SHEET_ID`). A few things worth knowing:
  - Only that one tab is read — the spreadsheet has ~20 other tabs with HR-sensitive data (salaries, performance reviews, exit reasons, etc.) that this dashboard never touches.
  - "Airwallex" and "Singapore Tourism Board" in the sheet are matched to "AirWallex" and "STB" in Notion. "YouTube" is tracked separately in the sheet and is deliberately left out of Google's count for now.
  - Marriott and Warner Music aren't in this spreadsheet at all, so they show `0` — that's "not tracked here," not a confirmed zero.
  - If the sheet can't be reached (auth not set up yet, access revoked, tab renamed), the number shows as "TBC" instead of a wrong number.
- **Talent roster** (`talent.html`, linked from the "number of talent" box on each company page): Name, Role, Started, and Contract Length for everyone counted above. Role and contract dates come from "Client Contracts"; the Started date is cross-referenced from a separate roster tab by Employee ID (that tab isn't one of the spreadsheet's indexed tabs, so `lib/sheets.js` finds it by matching its header row — `Employee ID, Name, Client, Team, Start Date` — rather than a hardcoded tab name, since that name could change). Only those five columns are ever read from that tab; the salary/increment columns next to them are never touched. Contract Length is computed as the number of months between Started and the contract's end date (Employment Contract End Date, or SOW Expiry if that's blank) — it's the full planned length of the engagement, not time remaining.

### Key Chats (Google Chat)
Each company page can show a short, AI-generated list of recent discussion topics from that client's Google Chat spaces (`lib/chat-summary.js`) — topics only, never verbatim quotes, dollar amounts, or personal details, since this dashboard is public. This runs on its own schedule (`.github/workflows/refresh-chat-summaries.yml`, twice a day) rather than the main 30-min refresh, because it calls the Anthropic API, which costs per run — decoupling it keeps that cost low regardless of how often the rest of the dashboard refreshes. It writes `chat-summary-cache.json` at the repo root and commits it straight back to `main` automatically (so `main` will get small auto-commits twice a day from this) — `lib/build.js` just reads that file on every regular refresh, no extra API calls.

Which Chat space feeds which company is a manual list in `lib/chat-summary.js` (`COMPANY_SPACES`) — space names don't reliably match company names, so this isn't auto-matched. Currently mapped: STB, Trade Desk, KFC, Grab, Workday, Google, AirWallex. Ask Claude Code to add a company once its Chat space is clear from `npm run chat-check`.

A company with no mapped space shows "Not connected for this company yet" rather than nothing, so it's clear that's a setup gap, not a bug.

### Executive Summary (Granola)
Each company page's "Executive Summary" panel shows a short, AI-generated list of topics from that client's last 3 Granola meeting notes (`lib/granola-summary.js`). A note is matched to a company by attendee email against Clients CRM contacts first (same approach as calendar touchpoints); if a note has no useful attendee data (e.g. it wasn't linked to a calendar invite - this happens), it falls back to checking whether a company name appears in the note's title. No manual mapping table needed, unlike Chat.

Same idea as Chat, with stricter rules given what Granola notes actually contain: abstracted topics only - no dollar amounts, invoice/payment status, salary or rate figures, contract renewal risk assessments, or named individuals. This runs on its own twice-daily schedule (`.github/workflows/refresh-granola-summaries.yml`), same reasoning as Chat - summarization costs per call, so it's decoupled from the 30-min refresh. Writes `granola-summary-cache.json`, committed back to `main` automatically; `lib/build.js` just reads it.

**Setup (Granola side):** requires a Business or Enterprise plan on the Granola workspace. In the Granola desktop app: Settings → Connectors → API keys → Create new key, choosing note access (your own notes, workspace public notes, or both). Add it as the `GRANOLA_API_KEY` repo secret. `npm run granola-check` is a standalone diagnostic - lists recent notes and confirms the key works without touching the real dashboard build.

## Known gaps to ask Claude Code to close
- Company-to-touchpoint matching only checks attendee email, not a location/name fallback.
- If a Notion database schema changes (renamed property, moved database), `lib/notion.js` will need updating — Claude Code can check current `@notionhq/client` docs if `build.js` throws.
- The cron schedule is UTC and hand-converted to SGT hours — double check after any daylight-saving-adjacent regions get added, or just widen the window.
