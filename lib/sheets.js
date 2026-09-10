const { google } = require("googleapis");
const { getAuthedClient } = require("./google-auth");

// The talent tracker spells some client names differently than the Notion
// Companies database - map sheet name -> Notion company name here.
const CLIENT_NAME_MAP = {
  Airwallex: "AirWallex",
  "Singapore Tourism Board": "STB",
};

// Tracked in the sheet but not a company in its own right on this dashboard.
const CLIENT_NAME_EXCLUDE = new Set(["YouTube"]);

// Reads the "Client Contracts" tab: one row per current talent assignment,
// with a Client column and a Terminated column (blank = still active).
// Returns { "Company Name": count }. A company with no rows in the sheet
// (not tracked here at all, e.g. Marriott, Warner Music) simply won't be a
// key in the returned object - callers should treat a missing key as 0.
async function fetchTalentCounts() {
  const spreadsheetId = process.env.GOOGLE_TALENT_SHEET_ID;
  if (!spreadsheetId) {
    throw new Error("GOOGLE_TALENT_SHEET_ID is not set");
  }
  const auth = getAuthedClient();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Client Contracts!A:Q",
  });

  const rows = res.data.values || [];
  const header = rows[0] || [];
  const clientIdx = header.indexOf("Client");
  const terminatedIdx = header.indexOf("Terminated");
  if (clientIdx === -1 || terminatedIdx === -1) {
    throw new Error('"Client Contracts" tab is missing a Client or Terminated column - check it hasn\'t been renamed');
  }

  const counts = {};
  for (const row of rows.slice(1)) {
    const rawClient = (row[clientIdx] || "").trim();
    if (!rawClient || CLIENT_NAME_EXCLUDE.has(rawClient)) continue;
    if ((row[terminatedIdx] || "").trim()) continue; // terminated - not current headcount
    const client = CLIENT_NAME_MAP[rawClient] || rawClient;
    counts[client] = (counts[client] || 0) + 1;
  }
  return counts;
}

module.exports = { fetchTalentCounts };
