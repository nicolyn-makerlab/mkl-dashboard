const { google } = require("googleapis");
const { getAuthedClient } = require("./google-auth");

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

  return (res.data.items || [])
    // All-day events (out-of-office notices, leave blocks) aren't real
    // meetings, even when they happen to list a client contact as an
    // attendee (e.g. an OOO invite that reused a client thread's invite
    // list). A real touchpoint always has a specific start time.
    .filter((e) => e.start && e.start.dateTime)
    .map((e) => ({
      id: e.id,
      summary: e.summary || "(no title)",
      start: e.start.dateTime,
      attendeeEmails: (e.attendees || []).map((a) => (a.email || "").toLowerCase()),
      location: e.location || null,
      meetingType: classifyMeetingType(e),
    }));
}

module.exports = { fetchUpcomingEvents };
