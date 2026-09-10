// Run twice a day by .github/workflows/refresh-chat-summaries.yml (NOT the
// main 30-min dashboard refresh) - the AI summarization call has a real
// cost per run, so it's deliberately decoupled from the frequent build.
// Writes chat-summary-cache.json, which lib/dashboard-data.js reads on
// every regular build without re-fetching or re-summarizing anything.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { listRecentMessages } = require("./chat");

// Which Chat spaces feed each company's topic summary. Confirmed by
// Nicolyn against the full chat-check space list on 2026-09-10 - space
// names don't reliably match Notion company names, so this is a manual
// map, not an auto-match. Update it if spaces get renamed or added.
const COMPANY_SPACES = {
  STB: ["spaces/AAQAyLkpX4s", "spaces/AAQAWxpEiG4", "spaces/AAQAEercdYk"],
  "Trade Desk": ["spaces/AAQAIsjAcN8"],
  KFC: ["spaces/AAQAKO_bXjo", "spaces/AAQAXZB_ZjA"],
  Grab: ["spaces/AAQA8L9ThAk"],
  Workday: ["spaces/AAQAEYS-3Fg"],
  Google: ["spaces/AAQAYGYpNqo"],
  AirWallex: ["spaces/AAQAroOdwLg"],
};

const LOOKBACK_DAYS = 7;
const MAX_TOPICS = 5;

// Deliberately asks for abstracted topics, not quotes - this is public
// dashboard content, so the summary itself needs to avoid carrying over
// the same sensitive specifics (pricing, personal/health detail, named
// individual issues) that kept Granola off the dashboard entirely.
const SUMMARY_PROMPT = `You're summarizing internal Google Chat messages about a marketing agency client account, for a short status panel on an internal dashboard. Read the messages below and produce up to ${MAX_TOPICS} short bullet points (each under 15 words) naming the general topics being discussed.

Rules:
- Topics only, not quotes or details. E.g. "Campaign timeline discussion", not what anyone actually said.
- Never include dollar amounts, exact numbers, names of specific people, health/personal information, or anything that reads as a direct quote.
- If nothing substantive was discussed, return an empty list.
- Output ONLY a JSON array of strings, nothing else.`;

async function summarizeCompany(anthropic, messages) {
  if (!messages.length) return [];
  const joined = messages.slice(0, 200).join("\n---\n");
  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: SUMMARY_PROMPT,
    messages: [{ role: "user", content: joined }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  try {
    const parsed = JSON.parse(text);
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
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const sinceISO = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const topicsByCompany = {};
  for (const [company, spaces] of Object.entries(COMPANY_SPACES)) {
    let messages = [];
    for (const space of spaces) {
      try {
        messages.push(...(await listRecentMessages(space, sinceISO)));
      } catch (err) {
        console.warn(`Couldn't read ${space} for ${company}:`, err.message);
      }
    }
    topicsByCompany[company] = await summarizeCompany(anthropic, messages);
    console.log(`${company}: ${topicsByCompany[company].length} topic(s)`);
  }

  const outPath = path.join(__dirname, "..", "chat-summary-cache.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), topicsByCompany }, null, 2)
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error("Chat summary failed:", err.message);
  process.exit(1);
});
