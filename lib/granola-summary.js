// Run twice a day by .github/workflows/refresh-granola-summaries.yml (NOT
// the main 30-min dashboard refresh) - the AI summarization call has a
// real cost per run, same reasoning as lib/chat-summary.js.
// Writes granola-summary-cache.json, which lib/dashboard-data.js reads on
// every regular build without re-fetching or re-summarizing anything.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { listRecentNotes, getNote } = require("./granola");
const { fetchCompanies, fetchClientsCRM } = require("./notion");

const LOOKBACK_DAYS = 30;
const MAX_NOTES_PER_COMPANY = 3;
const MAX_TOPICS = 5;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Deliberately stricter than Chat's prompt: Granola notes are meeting
// summaries, which routinely include invoice status, rates, and contract
// terms - all off-limits for a page anyone with the URL can view.
const SUMMARY_PROMPT = `You're summarizing internal Granola meeting notes about a marketing agency client account, for a short "Executive Summary" panel on an internal dashboard. Read the notes below and produce up to ${MAX_TOPICS} short bullet points (each under 15 words) naming the general topics discussed.

Rules:
- Topics only, not quotes or details. E.g. "Website rebuild scope discussion", not what anyone actually proposed.
- Never include dollar amounts, invoice or payment status, salary/rate/compensation figures, contract renewal risk assessments or negotiating positions, or names of specific people.
- If nothing substantive was discussed, return an empty list.
- Output ONLY a JSON array of strings, nothing else.`;

async function summarizeCompany(anthropic, texts) {
  if (!texts.length) return [];
  const joined = texts.join("\n---\n").slice(0, 20000);
  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: SUMMARY_PROMPT,
    messages: [{ role: "user", content: joined }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  // Same code-fence-stripping fix as chat-summary.js.
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced ? fenced[1] : text.trim();
  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_TOPICS).filter((t) => typeof t === "string") : [];
  } catch (_) {
    console.warn("Couldn't parse summary response as JSON:", text);
    return [];
  }
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
  const sinceISO = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [companies, contacts, lightNotes] = await Promise.all([
    fetchCompanies(),
    fetchClientsCRM(),
    listRecentNotes(sinceISO),
  ]);

  const realCompanies = companies.filter((c) => !/mkl/i.test(c.name));
  const companyById = Object.fromEntries(companies.map((c) => [c.id, c]));
  const contactByEmail = {};
  for (const c of contacts) {
    if (c.email) contactByEmail[c.email.toLowerCase()] = c;
  }
  // Fallback for notes with no useful attendee data (e.g. not linked to a
  // calendar invite) - checked only when attendee-email matching fails.
  const titlePatterns = realCompanies.map((c) => ({
    name: c.name,
    re: new RegExp(`\\b${escapeRegex(c.name)}\\b`, "i"),
  }));

  const notesByCompany = {};
  for (const light of lightNotes) {
    let detail;
    try {
      detail = await getNote(light.id);
    } catch (err) {
      console.warn(`Couldn't fetch note ${light.id}:`, err.message);
      continue;
    }

    let matchedCompany = null;
    for (const attendee of detail.attendees || []) {
      const contact = attendee.email && contactByEmail[attendee.email.toLowerCase()];
      const company = contact && companyById[(contact.companyIds || [])[0]];
      if (company && !/mkl/i.test(company.name)) {
        matchedCompany = company.name;
        break;
      }
    }
    if (!matchedCompany) {
      const hit = titlePatterns.find((p) => p.re.test(detail.title || ""));
      if (hit) matchedCompany = hit.name;
    }
    if (matchedCompany) (notesByCompany[matchedCompany] ||= []).push(detail);
  }

  const topicsByCompany = {};
  for (const company of realCompanies) {
    const notes = (notesByCompany[company.name] || [])
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, MAX_NOTES_PER_COMPANY);
    const texts = notes.map((n) => n.summary_text || n.summary_markdown || "").filter(Boolean);
    topicsByCompany[company.name] = await summarizeCompany(anthropic, texts);
    console.log(`${company.name}: ${notes.length} note(s), ${topicsByCompany[company.name].length} topic(s)`);
  }

  const outPath = path.join(__dirname, "..", "granola-summary-cache.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), topicsByCompany }, null, 2)
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error("Granola summary failed:", err.message);
  process.exit(1);
});
