const fs = require("fs");
const { google } = require("googleapis");

// Two ways to authenticate:
// 1. Local dev: reads google-credentials.json + google-token.json from disk
//    (created by "npm run auth").
// 2. CI / GitHub Actions: reads GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
//    GOOGLE_REFRESH_TOKEN from environment secrets - no files needed,
//    since Actions runners are ephemeral and can't hold onto local state.
function getAuthedClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN) {
    const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
    return client;
  }

  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || "./google-credentials.json";
  const tokenPath = process.env.GOOGLE_TOKEN_PATH || "./google-token.json";
  if (!fs.existsSync(credPath) || !fs.existsSync(tokenPath)) {
    throw new Error(
      'Google Calendar not connected. Run "npm run auth" locally first, or set ' +
        "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN as secrets in CI."
    );
  }
  const { client_id, client_secret, redirect_uris } = JSON.parse(
    fs.readFileSync(credPath)
  ).installed;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  client.setCredentials(JSON.parse(fs.readFileSync(tokenPath)));
  return client;
}

// Physical location => face to face. A conferencing link (Meet/Zoom/Teams
// or any http(s) location) => call. No location info => unknown.
function classifyMeetingType(event) {
  const hasVideoLink =
    !!event.hangoutLink ||
    !!(event.conferenceData && event.conferenceData.entryPoints) ||
    (event.location || "").match(/https?:\/\//i) ||
    (event.description || "").match(/teams\.microsoft\.com|meet\.google\.com|zoom\.us/i);
  if (hasVideoLink) return "call";
  if (event.location && event.location.trim().length > 0) return "face_to_face";
  return "unknown";
}

async function fetchUpcomingEvents(daysAhead) {
  const auth = getAuthedClient();
  const calendar = google.calendar({ version: "v3", auth });
  const now = new Date();
  const end = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 100,
  });

  return (res.data.items || []).map((e) => ({
    id: e.id,
    summary: e.summary || "(no title)",
    start: e.start && (e.start.dateTime || e.start.date),
    attendeeEmails: (e.attendees || []).map((a) => (a.email || "").toLowerCase()),
    location: e.location || null,
    meetingType: classifyMeetingType(e),
  }));
}

module.exports = { fetchUpcomingEvents };
