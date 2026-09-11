// Run on its own schedule by .github/workflows/refresh-granola-summaries.yml
// (NOT the main 30-min dashboard refresh), same reasoning as
// chat-summary.js - the Anthropic call has a real per-run cost. Writes
// granola-summary-cache.json, which lib/dashboard-data.js reads on every
// regular build without re-fetching or re-summarizing anything.
//
// This is the feature the README flagged as "deliberately left out for
// now": Granola meeting notes can contain overdue invoices, salary/rate
// details, and contract-renewal risk, and this dashboard is a public
// GitHub Pages site. Unlike chat-summary.js (which Nicolyn explicitly
// allowed first names in, since knowing about talent renewals/exits is
// part of her role), this hasn't had that conversation - so the rules
// here start deliberately stricter: no individual names at all (not
// even first names), no exact figures of any kind, no invoice/payment
// status, no contract-renewal specifics. It's a single evergreen "what
// is this account about" paragraph, not an attributed feed like Latest
// Topics.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { listRecentNotes, getNote } = require("./granola");
const { fetchCompanies, fetchClientsCRM } = require("./notion");

const LOOKBACK_DAYS = 45;
const MAX_NOTES_PER_COMPANY = 8;

// Company names that are too generic to safely title-match against a
// meeting title - domain matching still works fine for these, this only
// disables the weaker title-fallback tier for them. "Google" would
// false-positive on "Google Sheets"/"Google Calendar"/"Google Chat"
// mentions unrelated to the client; "Workday" would false-positive on
// the internal HR/payroll tool of the same name - confirmed by a real
// note titled "Workday download / Nicolyn" with zero workday.com
// attendees, caught by the mock test for this file before this list
// existed.
const TITLE_FALLBACK_EXCLUDE = new Set(["Google", "Workday"]);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function domainOf(email) {
  const m = /@([^@]+)$/.exec((email || "").trim().toLowerCase());
  return m ? m[1] : null;
}

async function buildCompanyMatchers() {
  const [companies, contacts] = await Promise.all([fetchCompanies(), fetchClientsCRM()]);
  const excluded = (process.env.EXCLUDE_COMPANIES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const clientCompanies = companies.filter((c) => !excluded.includes(c.name) && !/mkl/i.test(c.name));
  const companyById = Object.fromEntries(clientCompanies.map((c) => [c.id, c]));

  const domainToCompany = {};
  for (const contact of contacts) {
    const domain = domainOf(contact.email);
    if (!domain) continue;
    const companyId = (contact.companyIds || [])[0];
    const company = companyById[companyId];
    if (company) domainToCompany[domain] = company.name;
  }

  const titlePatterns = clientCompanies
    .filter((c) => !TITLE_FALLBACK_EXCLUDE.has(c.name))
    .map((c) => ({ name: c.name, re: new RegExp(`\\b${escapeRegex(c.name)}\\b`, "i") }));

  return { clientCompanies, domainToCompany, titlePatterns };
}

// Domain match (an attendee's email domain is a known client domain) is
// the confident signal - it's objective. Title match (the company name
// appears in the meeting title) is a weaker fallback for internal
// planning calls with no external attendee at all, which are common and
// legitimate (e.g. an internal KPI-framework working session for a
// client, with only Maker Lab people on the call). A note with zero
// external attendees and a title that happens to share a word with a
// client name unrelated to that client (confirmed to happen: an
// internal HR-tool download meeting called "Workday download" has no
// workday.com attendee) is exactly why domain match takes priority and
// title match is left for the summarization prompt to sanity-check
// rather than trusted blindly.
function matchCompanyForNote(note, domainToCompany, titlePatterns) {
  for (const attendee of note.attendees || []) {
    const domain = domainOf(attendee.email);
    if (domain && domain !== "wearemakerlab.com" && domainToCompany[domain]) {
      return { company: domainToCompany[domain], confidence: "domain" };
    }
  }
  const titleHits = titlePatterns.filter((p) => p.re.test(note.title || ""));
  if (titleHits.length === 1) {
    return { company: titleHits[0].name, confidence: "title" };
  }
  return null;
}

function extractNameTokens(fullName) {
  return (fullName || "").split(/\s+/).filter((t) => t.length > 1);
}

function buildKnownNameSet(notes) {
  const names = new Set();
  for (const note of notes) {
    for (const person of [...(note.attendees || []), note.owner].filter(Boolean)) {
      for (const tok of extractNameTokens(person.name)) names.add(tok);
    }
  }
  return names;
}

// Backstop for "no individual names" - built per-company from the actual
// attendees/owners of the notes being summarized (not a hardcoded
// roster), so it stays accurate without manual upkeep as new people show
// up in notes. Same principle as chat-summary.js's scrubFullNames: the
// prompt is the primary defense, this catches what slips through.
function scrubNames(text, knownNames) {
  if (!knownNames.size) return text;
  const pattern = new RegExp(`\\b(${[...knownNames].map(escapeRegex).join("|")})\\b`, "g");
  return text.replace(pattern, "[name]");
}

// Backstop for "no exact figures" - currency amounts and percentages.
function scrubFigures(text) {
  return text
    .replace(/(?:US\$|S\$|SGD|USD)\s?\d[\d,]*(?:\.\d+)?(?:\s?[kKmM])?\b/g, "[figure]")
    .replace(/\$\s?\d[\d,]*(?:\.\d+)?(?:\s?[kKmM])?\b/g, "[figure]")
    .replace(/\b\d+(?:\.\d+)?%/g, "[figure]");
}

const SUMMARY_PROMPT = `You're reviewing internal Granola meeting notes about a marketing agency client account, to write a short "Executive Summary" panel for an internal dashboard used by the account's Client Director.

Some notes given to you may only be tentatively linked to this client (matched by a meeting title, not a confirmed client attendee) - if a note's content is clearly not actually about this client (e.g. it's about an internal tool that happens to share a name with the client), ignore that note.

Write ONE short paragraph (3-5 sentences) giving an evergreen overview of the account: what the engagement covers, the current focus areas or themes of the work, and the general tenor of the relationship (e.g. steady, positive momentum, needs attention) if that's apparent. This is a standing profile of the account, not a recap of individual meetings - don't write "in the most recent meeting..." or list notes one by one.

Rules:
- Never mention any person's name, first or last, from either side - refer to "the client team" or "the account team" instead.
- Never include dollar amounts, rates, budgets, headcounts, or any other exact figures or percentages.
- Never state invoice or payment status.
- Never assess contract-renewal risk or give exact contract/renewal dates - if renewal is a live topic, at most say renewal terms are under discussion, nothing more specific.
- If the notes don't have enough substantive content to say anything meaningful, respond with exactly: NOT_ENOUGH_CONTENT
- Output ONLY the summary paragraph (or NOT_ENOUGH_CONTENT), nothing else - no headers, no markdown, no preamble.`;

async function summarizeCompany(anthropic, notes) {
  const sorted = [...notes].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const recent = sorted.slice(0, MAX_NOTES_PER_COMPANY);
  const knownNames = buildKnownNameSet(recent);

  const transcript = recent
    .map((n) => `Note: "${n.title}" (${n.createdAt.slice(0, 10)})\n${(n.summaryText || "").slice(0, 1500)}`)
    .join("\n\n---\n\n");

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: SUMMARY_PROMPT,
    messages: [{ role: "user", content: transcript }],
  });
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  if (!text || text === "NOT_ENOUGH_CONTENT") return null;
  return scrubFigures(scrubNames(text, knownNames));
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY - skipping this run, leaving any existing cache as-is.");
    return;
  }
  if (!process.env.GRANOLA_API_KEY) {
    console.error("Missing GRANOLA_API_KEY - skipping this run, leaving any existing cache as-is.");
    return;
  }
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { clientCompanies, domainToCompany, titlePatterns } = await buildCompanyMatchers();

  const sinceISO = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const noteStubs = await listRecentNotes(sinceISO);

  const notesByCompany = {};
  for (const stub of noteStubs) {
    let detail;
    try {
      detail = await getNote(stub.id);
    } catch (err) {
      console.warn(`Couldn't fetch note ${stub.id}:`, err.message);
      continue;
    }
    const match = matchCompanyForNote(detail, domainToCompany, titlePatterns);
    if (!match) continue;
    const note = {
      title: detail.title,
      createdAt: detail.created_at,
      attendees: detail.attendees || [],
      owner: detail.owner,
      summaryText: detail.summary_text || detail.summary_markdown || "",
    };
    (notesByCompany[match.company] = notesByCompany[match.company] || []).push(note);
  }

  const summaryByCompany = {};
  for (const company of clientCompanies) {
    const notes = notesByCompany[company.name] || [];
    if (!notes.length) {
      summaryByCompany[company.name] = null;
      continue;
    }
    summaryByCompany[company.name] = await summarizeCompany(anthropic, notes);
    console.log(`${company.name}: ${notes.length} note(s) -> ${summaryByCompany[company.name] ? "summarized" : "not enough content"}`);
  }

  const outPath = path.join(__dirname, "..", "granola-summary-cache.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), summaryByCompany }, null, 2)
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error("Granola summary failed:", err.message);
  process.exit(1);
});
