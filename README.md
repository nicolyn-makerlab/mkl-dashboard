# Maker Lab client dashboard (GitHub Pages)

Pulls your Notion client data and Google Calendar on a schedule via
GitHub Actions, and publishes the command-deck dashboard as a static
site on GitHub Pages.

`.claude/skills/humanize/` and `.claude/skills/ai-check/` are vendored
from [harshaneel/humanize](https://github.com/harshaneel/humanize) (MIT
license, see each skill's `LICENSE`) — use them whenever copy (labels,
empty-states, README text) is drafted for this repo, to keep it reading
as human-written.

**Heads up on privacy:** this is a public repo/Pages setup. Anyone with
the URL can view the dashboard, including client names, task details,
and check-in status. Contact emails are deliberately stripped from the
published data, and the page is marked `noindex` so search engines
won't list it, but neither of those makes it actually private. Treat
the URL itself as something to keep off public channels. If your
GitHub org is later upgraded to Enterprise Cloud, ask Claude Code to
switch this to access-controlled Pages instead.

As before, the fastest way to get this running is to hand the folder
to Claude Code and say: **"push this to a new GitHub repo, set up the
Pages workflow, and walk me through adding the secrets."**

## One-time setup

### 1. Notion integration
1. Create an integration at https://www.notion.so/my-integrations, copy its secret.
2. In Notion, share your "Companies & Clients CRM" page and the Tasks database with it (`...` menu → Connections).

### 2. Google Calendar OAuth (local step, needed once)
1. In https://console.cloud.google.com: enable the Calendar API, create an OAuth **Desktop app** client, download the JSON as `google-credentials.json` in this folder.
2. Run:
   ```bash
   npm install
   npm run auth
   ```
3. This prints `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` — copy these, you'll need them in step 4.

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

### 5. Enable Pages
**Settings → Pages → Build and deployment → Source: GitHub Actions**

### 6. Run it
**Actions tab → "Refresh and deploy dashboard" → Run workflow** (manual first run). After that it refreshes automatically every 30 minutes on weekdays, 7am-9pm SGT — edit the `cron` line in `.github/workflows/refresh-and-deploy.yml` to change that.

Your dashboard URL will be `https://<your-username>.github.io/<your-repo>/`, shown in the Actions run summary and in Settings → Pages.

## Local dev (optional)
`npm start` still runs the old live Express server on localhost if you want to iterate on layout/logic before pushing — it hits Notion/Calendar directly rather than reading the static JSON.

## How the rules map to code
- **Tasks due this week**: `lib/dashboard-data.js` — Owner = `TASK_OWNER_NAME`, Status not Done, due within `TASK_LOOKAHEAD_DAYS`, sorted by date then client then task. Companies in `EXCLUDE_COMPANIES` are filtered out.
- **Next client touchpoints**: calendar attendee emails matched against Clients CRM contact emails, within `MEETING_LOOKAHEAD_DAYS`. Video link = call, physical location = face to face.
- **Client health**: per contact, using `LAST_CONTACT_YELLOW_DAYS` / `LAST_CONTACT_RED_DAYS`. No date logged shows as a distinct "unlogged" state.

## Known gaps to ask Claude Code to close
- Company-to-touchpoint matching only checks attendee email, not a location/name fallback.
- If a Notion database schema changes (renamed property, moved database), `lib/notion.js` will need updating — Claude Code can check current `@notionhq/client` docs if `build.js` throws.
- The cron schedule is UTC and hand-converted to SGT hours — double check after any daylight-saving-adjacent regions get added, or just widen the window.
