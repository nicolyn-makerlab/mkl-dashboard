const BASE_URL = "https://public-api.granola.ai/v1";
// The API rejects a page_size above 30.
const MAX_PAGE_SIZE = 30;

async function granolaFetch(path, searchParams = {}) {
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.GRANOLA_API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Granola API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// Lightweight rows only (id, title, timestamps) - no attendees or summary
// text. Call getNote() per note for full detail.
async function listRecentNotes(sinceISO) {
  const notes = [];
  let cursor = undefined;
  do {
    const page = await granolaFetch("/notes", {
      page_size: MAX_PAGE_SIZE,
      cursor,
      created_after: sinceISO,
    });
    notes.push(...(page.notes || page.data || []));
    cursor = page.next_cursor || undefined;
  } while (cursor);
  return notes;
}

async function getNote(noteId) {
  return granolaFetch(`/notes/${noteId}`);
}

module.exports = { listRecentNotes, getNote };
