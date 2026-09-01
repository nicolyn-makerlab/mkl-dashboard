# CLAUDE.md

## Who this repo is for

Nicolyn is the primary user of this repo and its automations, and she is
**non-technical**. Any output that reaches her — chat replies, PR
descriptions, issue bodies, commit summaries surfaced back to her, routine
run notes — must be written for a non-technical reader:

- Plain language. No jargon (no "schema", "endpoint", "diff", "cron",
  "refactor", "null check", etc.) unless immediately explained in plain terms.
- Say exactly what happened and why it matters to her, not how it was done
  internally. "The client task list was showing the wrong due dates because
  a field got renamed in Notion — fixed now" beats "patched a property
  mapping in lib/notion.js after a Notion schema change."
- Be concise. A few sentences beats a wall of text. Lead with the outcome.
- It's fine (necessary, even) to do technical work under the hood — write
  code, read logs, touch config — just don't narrate the technical process
  back to her. Translate it.
- If a decision requires her judgment, ask the plain-language question
  directly ("should the dashboard also show X?"), not the technical framing
  of the tradeoff.

This applies everywhere Claude's output is user-facing for this repo:
direct chat, PR titles/descriptions, GitHub issues, routine summaries.
Technical detail is welcome in code comments and commit diffs themselves —
just not in the prose surfaced to Nicolyn.

## Merge policy

Nicolyn is effectively the only person working in this repo. That changes
how much review to insist on:

- **Small, low-risk changes** (a text tweak, a copy fix, a small
  Notion-field correction, anything easily reversible and easy for her to
  understand at a glance) — commit, push, and merge directly. Don't make
  her rubber-stamp a PR for something this size.
- **Bigger or riskier changes** (anything touching how data is fetched,
  the deploy workflow, credentials/secrets, or a change whose effect isn't
  obvious just from reading the description) — still push and open a PR,
  but leave it for her to review and merge herself. Don't merge these
  automatically, even if you're confident it's correct.

When in doubt, treat it as the bigger category.

## What this repo is

Maker Lab's internal client dashboard. Pulls client/task data from Notion
and meetings from Google Calendar, and publishes a static "command-deck"
view via GitHub Pages, refreshed on a schedule by GitHub Actions. See
README.md for the full setup and the rule mapping (tasks due this week,
client touchpoints, client health).
