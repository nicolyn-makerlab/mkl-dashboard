const fs = require("fs");
const path = require("path");
const { fetchCompanies, fetchClientsCRM, fetchTasks } = require("./notion");
const { fetchUpcomingEvents } = require("./calendar");
const { fetchTalentData } = require("./sheets");

function readRoutineStatus() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", "routine-status.json"), "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return [];
  }
}

// Written twice a day by lib/chat-summary.js, not by this build - reading
// it here just picks up whatever was last summarized, no fetching or AI
// calls on every 30-min refresh.
function readChatTopicsByCompany() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", "chat-summary-cache.json"), "utf8");
    return JSON.parse(raw).topicsByCompany || {};
  } catch (_) {
    return {};
  }
}

// Written on its own schedule by lib/granola-summary.js, same pattern as
// the chat cache above - read here, never fetched or summarized as part
// of the regular 30-min build.
function readGranolaSummaryByCompany() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", "granola-summary-cache.json"), "utf8");
    return JSON.parse(raw).summaryByCompany || {};
  } catch (_) {
    return {};
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
  let talentDataError = null;
  const [companies, contacts, tasks, events, talentData] = await Promise.all([
    fetchCompanies(),
    fetchClientsCRM(),
    fetchTasks(),
    fetchUpcomingEvents(Number(process.env.MEETING_LOOKAHEAD_DAYS || 14)).catch((err) => {
      console.warn("Calendar unavailable:", err.message);
      calendarError = err.message;
      return [];
    }),
    fetchTalentData().catch((err) => {
      console.warn("Talent tracker unavailable:", err.message);
      talentDataError = err.message;
      return { counts: {}, rosters: {} };
    }),
  ]);
  const talentCounts = talentData.counts;
  const talentRosters = talentData.rosters;

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

  // --- Open tasks per company, for the company page. Unlike myTasks above,
  // this isn't limited to a lookahead window or a single owner - it's every
  // not-Done task tied to the company. ---
  const openTasksByCompany = {};
  for (const t of tasks) {
    if (t.status === "Done") continue;
    const companyId = (t.companyIds || [])[0];
    if (!companyId) continue;
    if (!openTasksByCompany[companyId]) openTasksByCompany[companyId] = [];
    openTasksByCompany[companyId].push({ name: t.name, status: t.status, owner: t.owner, dueDate: t.dueDate, description: t.description });
  }
  for (const list of Object.values(openTasksByCompany)) {
    list.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    });
  }

  // --- Company directory: full client list + contacts, for the dashboard
  // dropdown and each company's own page. Anything with "MKL" in the name
  // is Maker Lab's own internal entry, never a real client, so it's left
  // out here regardless of what EXCLUDE_COMPANIES is set to. ---
  const chatTopicsByCompany = readChatTopicsByCompany();
  const granolaSummaryByCompany = readGranolaSummaryByCompany();
  const companyDirectory = clientCompanies
    .filter((c) => !/mkl/i.test(c.name))
    .map((c) => ({
      id: c.id,
      name: c.name,
      contacts: contacts
        .filter((ct) => (ct.companyIds || []).includes(c.id))
        .map((ct) => ({ name: ct.name, email: ct.email, title: ct.title, lastContact: ct.lastContact }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
      tasks: openTasksByCompany[c.id] || [],
      // null = couldn't reach the talent tracker at all (show "TBC"); a
      // number, including 0, is a real count for this company.
      talentCount: talentDataError ? null : talentCounts[c.name] || 0,
      talentRoster: talentDataError ? null : talentRosters[c.name] || [],
      // null = this company's Chat space(s) aren't mapped yet (see
      // lib/chat-summary.js); an array, including empty, means it is
      // mapped and this is what the last summarization run found.
      chatTopics: Object.prototype.hasOwnProperty.call(chatTopicsByCompany, c.name)
        ? chatTopicsByCompany[c.name]
        : null,
      // null = no Granola notes matched to this company yet in the last
      // refresh (either no meetings, or the summarizer hasn't run since
      // this company started having them); a string is the last
      // generated summary.
      execSummary: Object.prototype.hasOwnProperty.call(granolaSummaryByCompany, c.name)
        ? granolaSummaryByCompany[c.name]
        : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    generatedAt: new Date().toISOString(),
    tasks: myTasks,
    touchpoints,
    health,
    companies: companyDirectory,
    calendarError,
    routines: readRoutineStatus(),
  };
}

module.exports = { buildDashboard };