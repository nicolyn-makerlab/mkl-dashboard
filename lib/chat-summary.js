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

// Google's Chat API doesn't expose a real display name for a message
// sender to this app - confirmed even with the memberships.readonly
// scope, most likely a Workspace privacy default rather than something
// fixable from this repo. Maps a sender's opaque "users/123..." ID to a
// first name instead, filled in manually as Nicolyn recognizes people
// from message content over time. Anyone not in here yet shows as "TBC"
// - never guessed at.
const SENDER_NAMES = {
  "users/111255985668797164777": "Marcus", // Talent at STB
};

const LOOKBACK_DAYS = 14;
const MAX_MESSAGES_PER_COMPANY = 400; // keeps the prompt a reasonable size

// Deliberately asks for abstracted topics, not quotes - this is public
// dashboard content, so the summary itself needs to avoid carrying over
// the same sensitive specifics (pricing, exact figures) that kept
// Granola off the dashboard entirely. Per Nicolyn's explicit call
// (2026-09-11): first names are allowed anywhere, not just
// "deliveredBy" - part of her role is knowing about talent
// renewals/exits, so that content isn't filtered out, just kept to
// first names rather than full names.
//
// No cap on the number of topics for now - Nicolyn wants to see how the
// info actually flows before deciding on a limit.
const SUMMARY_PROMPT = `You're reviewing internal Google Chat messages about a marketing agency client account, for an "Executive Summary" panel on an internal dashboard used by the account's Client Director.

Each message below is labeled with who sent it, e.g. "[Sarah]: message text". Some senders show as "[TBC]" because who they are isn't known yet - always copy a sender's label exactly as given; never invent or guess a name that doesn't appear in a label.

Identify the distinct topics or discussions happening - a single discussion can span multiple messages, not necessarily consecutive ones. For each one, produce an object with exactly these keys:
- "title": a short description of what the topic is (under 12 words)
- "outcome": the outcome, decision, or next step reached - if it's still unresolved, describe what's pending instead (under 20 words)
- "deliveredBy": exactly the label (e.g. "Sarah" or "TBC") of whoever posted the message carrying that outcome/next step

Rules:
- Never include dollar amounts or exact numbers (e.g. rates, budgets, headcounts).
- First names are fine anywhere, including in "title" and "outcome" - but never a full name (first + last) anywhere, even if the transcript includes one.
- Skip trivial exchanges (acknowledgements, pure scheduling logistics, emoji reactions).
- If nothing substantive was discussed, return an empty array.
- Output ONLY a JSON array of objects with exactly the three keys above, nothing else.`;

function resolveSenderLabel(senderName) {
  return SENDER_NAMES[senderName] || "TBC";
}

// Business/product terms that happen to look like "Firstname Lastname" to
// the regex below (two Title Case words in a row) but aren't a person's
// name - grow this list as real topics surface more false positives.
// Company names from COMPANY_SPACES are included automatically.
const SAFE_TITLE_CASE_PAIRS = new Set([
  ...Object.keys(COMPANY_SPACES),
  "Client Director",
  "Creative Scorecard",
]);

// First names known to come up in this account's chats - used below to
// spot a "Firstname Lastname" pair. Seeded from real topics seen so far;
// grows over time like SENDER_NAMES/COMPANY_SPACES. Deliberately not
// "any capitalized word" - an earlier version matched any two Title Case
// words in a row and it caught real full names, but also mangled
// ordinary sentence-initial phrasing like "Pending Fabian's approval"
// into "Pending's approval". Restricting the first word to a known first
// name avoids that without losing the case that mattered.
const KNOWN_FIRST_NAMES = new Set([
  "Marcus", "Emma", "Fabian", "Shawn", "Michael", "Dani", "Caren",
  "Kenneth", "Adrian", "Claudia", "Reema", "Joshua", "Nicholas", "Chandni",
  ...Object.values(SENDER_NAMES),
]);

// The prompt tells the model never to write a full name (first + last),
// but a real run on 2026-09-11 proved that instruction alone isn't
// reliable ("Nicholas Wong" appeared in a title despite it). Since
// deliveredBy has a hard whitelist (knownLabels below) but title/outcome
// are free text with no such list to check against, this is a heuristic
// backstop: when a known first name is immediately followed by another
// Title Case word, the second word gets dropped, on the assumption it's
// more likely a surname than not. This can still over-redact a
// legitimate two-word phrase that happens to start with a known first
// name (add it to SAFE_TITLE_CASE_PAIRS if that happens) - that's the
// intended failure direction, since over-redacting is safe and leaking a
// surname isn't. A full name whose first name isn't in the list yet
// won't be caught - add it here once it's been seen.
function scrubFullNames(text) {
  return text.replace(/\b([A-Z][a-z]+) ([A-Z][a-z]+)\b/g, (match, first) => {
    if (!KNOWN_FIRST_NAMES.has(first)) return match;
    return SAFE_TITLE_CASE_PAIRS.has(match) ? match : first;
  });
}

async function summarizeCompany(anthropic, messages) {
  if (!messages.length) return [];

  // Oldest first, so the transcript reads in the order the conversation
  // actually happened.
  const sorted = [...messages].sort((a, b) => (a.createTime < b.createTime ? -1 : 1));
  const transcript = sorted
    .slice(-MAX_MESSAGES_PER_COMPANY)
    .map((m) => `[${resolveSenderLabel(m.senderName)}]: ${m.text}`)
    .join("\n");

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    system: SUMMARY_PROMPT,
    messages: [{ role: "user", content: transcript }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  // Claude sometimes wraps its answer in a markdown code fence
  // (```json ... ```) despite being told to output only JSON - strip
  // that before parsing rather than discarding a good response.
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced ? fenced[1] : text.trim();

  // Names Claude is actually allowed to have used, since it was given
  // them in the transcript labels - anything else is treated as a
  // hallucinated name and forced back to "TBC" rather than trusted.
  const knownLabels = new Set([...Object.values(SENDER_NAMES), "TBC"]);

  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => t && typeof t.title === "string" && typeof t.outcome === "string")
      .map((t) => ({
        title: scrubFullNames(t.title),
        outcome: scrubFullNames(t.outcome),
        deliveredBy: knownLabels.has(t.deliveredBy) ? t.deliveredBy : "TBC",
      }));
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
