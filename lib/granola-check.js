// Diagnostic only - lists recent Granola notes and prints one note's full
// detail shape (with long text fields redacted to a length, not their
// content) so lib/granola-summary.js can be written against the API's
// actual field names instead of guessed ones. Doesn't call Anthropic,
// doesn't write any cache file.
require("dotenv").config();
const { listRecentNotes, getNote } = require("./granola");

function redactLongStrings(value, maxLen = 40) {
  if (typeof value === "string") {
    return value.length > maxLen ? `<string, ${value.length} chars>` : value;
  }
  if (Array.isArray(value)) return value.map((v) => redactLongStrings(v, maxLen));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactLongStrings(v, maxLen)]));
  }
  return value;
}

async function main() {
  if (!process.env.GRANOLA_API_KEY) {
    console.error("Missing GRANOLA_API_KEY");
    process.exit(1);
  }
  const sinceISO = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const notes = await listRecentNotes(sinceISO);
  console.log(`Found ${notes.length} notes since ${sinceISO}`);
  console.log("First 5 (redacted):", JSON.stringify(redactLongStrings(notes.slice(0, 5)), null, 2));

  if (notes.length) {
    const first = notes[0];
    const id = first.id || first.note_id;
    console.log(`\nFull detail for note ${id} (redacted):`);
    const detail = await getNote(id);
    console.log(JSON.stringify(redactLongStrings(detail, 60), null, 2));
  }
}

main().catch((err) => {
  console.error("granola-check failed:", err.message);
  process.exit(1);
});
