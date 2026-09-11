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

function parseDMY(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s || "").trim());
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}
function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || "").trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function monthsBetween(start, end) {
  if (!start || !end) return null;
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}
function formatLength(months) {
  if (months === null || months < 0) return null;
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years} yr` : `${years} yr ${rest} mo`;
}
function toISODate(d) {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// The roster tab with Start Date isn't one of the spreadsheet's indexed
// tabs (renamed or added later), so its title can't be hardcoded reliably.
// Find it by header shape instead: Employee ID, Name, Client, Team, Start
// Date as the first five columns. Only ever reads those five columns - the
// same tab also holds salary figures further to the right, which this
// dashboard has no reason to touch.
//
// Checks tabs one at a time rather than in a single batchGet: a
// spreadsheet can have a tab whose name or layout (e.g. a cover/title tab
// with no real grid) Google's API refuses to parse as a range, and a
// batchGet fails entirely if even one of its ranges is invalid - which
// silently broke talent data for every company, not just the bad tab.
async function findRosterSheetTitle(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const titles = (meta.data.sheets || []).map((s) => s.properties.title);
  for (const title of titles) {
    let header;
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${title.replace(/'/g, "''")}'!A1:E1`,
      });
      header = (res.data.values && res.data.values[0]) || [];
    } catch (err) {
      continue; // this tab can't be read as a range - not a candidate, skip it
    }
    if (header[0] === "Employee ID" && header[1] === "Name" && header[4] === "Start Date") {
      return title;
    }
  }
  return null;
}

// Reads the "Client Contracts" tab (one row per current talent assignment)
// plus the Employee ID -> Start Date lookup above, and returns both:
// - counts: { "Company Name": number } - current (non-terminated) headcount
// - rosters: { "Company Name": [{ name, role, started, contractLength, contractedTo }] }
// A company with no rows in the sheet at all (not tracked here, e.g.
// Marriott, Warner Music) simply won't be a key in either object - callers
// should treat a missing key as "0 / no roster", not an error.
async function fetchTalentData() {
  const spreadsheetId = process.env.GOOGLE_TALENT_SHEET_ID;
  if (!spreadsheetId) {
    throw new Error("GOOGLE_TALENT_SHEET_ID is not set");
  }
  const auth = getAuthedClient();
  const sheets = google.sheets({ version: "v4", auth });

  const [contractsRes, rosterTitle] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId, range: "Client Contracts!A:Q" }),
    findRosterSheetTitle(sheets, spreadsheetId),
  ]);

  const startByEmployeeId = {};
  if (rosterTitle) {
    const rosterRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${rosterTitle.replace(/'/g, "''")}'!A:E`,
    });
    const rows = rosterRes.data.values || [];
    const header = rows[0] || [];
    const idIdx = header.indexOf("Employee ID");
    const startIdx = header.indexOf("Start Date");
    for (const row of rows.slice(1)) {
      const id = (row[idIdx] || "").trim();
      if (id) startByEmployeeId[id] = (row[startIdx] || "").trim();
    }
  }

  const rows = contractsRes.data.values || [];
  const header = rows[0] || [];
  const clientIdx = header.indexOf("Client");
  const nameIdx = header.indexOf("Name");
  const roleIdx = header.indexOf("MKL Banding");
  const sowExpiryIdx = header.indexOf("SOW Expiry");
  const empEndIdx = header.indexOf("Employment Contract End Date");
  const empIdIdx = header.indexOf("Employee ID");
  const terminatedIdx = header.indexOf("Terminated");
  if (clientIdx === -1 || terminatedIdx === -1) {
    throw new Error(
      `"Client Contracts" tab is missing a Client or Terminated column - check it hasn't been renamed. Header row found: ${JSON.stringify(header)}`
    );
  }

  const counts = {};
  const rosters = {};
  for (const row of rows.slice(1)) {
    const rawClient = (row[clientIdx] || "").trim();
    if (!rawClient || CLIENT_NAME_EXCLUDE.has(rawClient)) continue;
    if ((row[terminatedIdx] || "").trim()) continue; // terminated - not current headcount
    const client = CLIENT_NAME_MAP[rawClient] || rawClient;
    counts[client] = (counts[client] || 0) + 1;

    const empId = (row[empIdIdx] || "").trim();
    const started = startByEmployeeId[empId] || null;
    const endStr = (row[empEndIdx] || "").trim() || (row[sowExpiryIdx] || "").trim();
    const endDate = parseDMY(endStr);
    const months = monthsBetween(parseISO(started), endDate);
    (rosters[client] ||= []).push({
      name: row[nameIdx] || null,
      role: row[roleIdx] || null,
      started,
      contractLength: formatLength(months),
      contractedTo: toISODate(endDate),
    });
  }

  return { counts, rosters };
}

module.exports = { fetchTalentData };
