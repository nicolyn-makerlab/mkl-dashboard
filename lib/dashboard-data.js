const fs = require("fs");
const path = require("path");
const { fetchCompanies, fetchClientsCRM, fetchTasks } = require("./notion");
const { fetchUpcomingEvents } = require("./calendar");

function readRoutineStatus() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", "routine-status.json"), "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return [];
  }
}

function daysBetween(dateStr, from = new Date()) {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  return Math.floor((from - then) / (1000 * 60 * 60 * 24));
}

function withinNextNDays(dateStr, n) {
  if (!dateStr) return false;
  const d = daysBetween(dateStr, new Date()) * -1; // days from now, positive = future
  return d >= -0.001 && d <= n;
}

async function buildDashboard() {
  let calendarError = null;
  const [companies, contacts, tasks, events] = await Promise.all([
    fetchCompanies(),
    fetchClientsCRM(),
    fetchTasks(),
    fetchUpcomingEvents(Number(process.env.MEETING_LOOKAHEAD_DAYS || 14)).catch((err) => {
      console.warn("Calendar unavailable:", err.message);
      calendarError = err.message;
      return [];
    }),
  ]);

  const excluded = (process.env.EXCLUDE_COMPANIES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const clientCompanies = companies.filter((c) => !excluded.includes(c.name));
  const companyById = Object.fromEntries(clientCompanies.map((c) => [c.id, c]));

  // --- Tasks due this week, owned by me ---
  // TASK_OWNER_NAME left blank/unset = show tasks for everyone on the team.
  // Set it to a specific name (e.g. "Me") to filter back down to just yours.
  const owner = process.env.TASK_OWNER_NAME || "";
  const lookahead = Number(process.env.TASK_LOOKAHEAD_DAYS || 7);
  const myTasks = tasks
    .filter((t) => (owner ? t.owner === owner : true) && t.status !== "Done")
    .filter((t) => t.dueDate && withinNextNDays(t.dueDate, lookahead))
    .map((t) => {
      const companyId = (t.companyIds || [])[0];
      const company = companyById[companyId];
      return company
        ? { ...t, companyName: company.name }
        : null; // drop tasks tied to excluded/unknown companies
    })
    .filter(Boolean)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1) || a.companyName.localeCompare(b.companyName));

  // --- Client contact lookup by email, for matching calendar attendees ---
  const contactByEmail = {};
  for (const c of contacts) {
    if (c.email) contactByEmail[c.email.toLowerCase()] = c;
  }

  // --- Next touchpoints: one entry per calendar event, even when it
  // involves multiple clients, so a joint meeting counts once, not once
  // per attendee. ---
  const touchpoints = [];
  for (const ev of events) {
    const attendees = [];
    const seenContactIds = new Set();
    for (const email of ev.attendeeEmails) {
      const contact = contactByEmail[email];
      if (!contact || seenContactIds.has(contact.id)) continue;
      const companyId = (contact.companyIds || [])[0];
      const company = companyById[companyId];
      if (!company) continue;
      seenContactIds.add(contact.id);
      attendees.push({ contactName: contact.name, companyName: company.name });
    }
    if (attendees.length) {
      touchpoints.push({ start: ev.start, meetingType: ev.meetingType, attendees });
    }
  }
  touchpoints.sort((a, b) => (a.start < b.start ? -1 : 1));

  // --- Client health, per contact ---
  const yellowDays = Number(process.env.LAST_CONTACT_YELLOW_DAYS || 14);
  const redDays = Number(process.env.LAST_CONTACT_RED_DAYS || 30);
  const health = contacts
    .map((c) => {
      const companyId = (c.companyIds || [])[0];
      const company = companyById[companyId];
      if (!company) return null;
      const age = daysBetween(c.lastContact);
      let flag = "green";
      if (age === null) flag = "unlogged";
      else if (age > redDays) flag = "red";
      else if (age > yellowDays) flag = "yellow";
      return { contactName: c.name, companyName: company.name, lastContact: c.lastContact, daysSince: age, flag };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const order = { red: 0, yellow: 1, unlogged: 2, green: 3 };
      return order[a.flag] - order[b.flag];
    });

  return {
    generatedAt: new Date().toISOString(),
    tasks: myTasks,
    touchpoints,
    health,
    calendarError,
    routines: readRoutineStatus(),
  };
}

module.exports = { buildDashboard };