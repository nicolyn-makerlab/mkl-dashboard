// Run with: npm run granola-check
// Standalone diagnostic - lists recent Granola notes and prints the raw
// shape of the first one, without touching the real dashboard build.
// Meant to confirm GRANOLA_API_KEY works and reveal the actual field
// names (attendees, summary text, etc.) before wiring real summarization.
require("dotenv").config();
const { listRecentNotes, getNote } = require("./granola");

const LOOKBACK_DAYS = 30;

// Replaces any long text (summary_markdown, transcript, private notes)
// with just its length - this is a diagnostic meant to confirm field
// *names* (attendees especially), not to print actual meeting content.
function redactForDisplay(value) {
  if (typeof value === "string") {
    return value.length > 60 ? `<string, ${value.length} chars>` : value;
  }
  if (Array.isArray(value)) return value.map(redactForDisplay);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactForDisplay(v);
    return out;
  }
  return value;
}

listRecentNotes(new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString())
  .then(async (notes) => {
    if (!notes.length) {
      console.log(`Connected, but no notes found in the last ${LOOKBACK_DAYS} days.`);
      return;
    }
    console.log(`Found ${notes.length} note(s) in the last ${LOOKBACK_DAYS} days:\n`);
    for (const n of notes) {
      console.log(`- ${n.title || "(untitled)"} (${n.created_at || n.created || "no date"})`);
    }
    console.log("\nShape of the first note's full detail (long text fields redacted to their length):\n");
    const detail = await getNote(notes[0].id);
    console.log(JSON.stringify(redactForDisplay(detail), null, 2));
  })
  .catch((err) => {
    console.error("\nGranola check failed:", err.message);
    console.error(
      "\nIf this mentions an invalid or missing key, double check GRANOLA_API_KEY in .env.\n" +
        "If it mentions a plan/access restriction, the workspace may not be on a Business plan - see README.md."
    );
    process.exit(1);
  });
