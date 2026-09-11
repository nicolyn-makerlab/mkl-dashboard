const BASE_URL = "https://public-api.granola.ai/v1";

// Granola's own API key format (starts with "grn_"), generated from the
// Granola desktop app: Settings > Connectors > API keys. Requires a
// Business (or Enterprise) plan on the workspace - a personal plan can't
// create one. Separate from any Claude/Anthropic key.
async function granolaFetch(path, searchParams) {
  const apiKey = process.env.GRANOLA_API_KEY;
  if (!apiKey) {
    throw new Error("GRANOLA_API_KEY is not set");
  }
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Granola API ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Notes (Granola's term for a meeting + its AI summary) created since a
// given ISO date, newest first, following pagination cursors. A note only
// appears once Granola has generated a summary for it - meetings still
// processing won't show up yet.
async function listRecentNotes(sinceISO) {
  const notes = [];
  let cursor;
  do {
    const page = await granolaFetch("/notes", {
      created_after: sinceISO,
      page_size: 30, // API max - larger values are rejected
      cursor,
    });
    notes.push(...(page.notes || page.data || []));
    cursor = page.next_cursor || page.cursor || null;
  } while (cursor);
  return notes;
}

module.exports = { listRecentNotes };
