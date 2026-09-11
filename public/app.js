function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const hasTime = iso.includes("T");
  return hasTime
    ? d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : fmtDate(iso);
}

function singaporeGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Singapore" }).format(new Date())
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function meetingIcon(type) {
  if (type === "call") return "&#128222;";
  if (type === "face_to_face") return "&#129309;";
  return "&#8226;";
}

function flagLabel(flag) {
  return { red: "no contact 30+ days", yellow: "no contact 14+ days", green: "recently contacted", unlogged: "no last-contact logged" }[flag];
}

function firstName(fullName) {
  return (fullName || "").split(" ")[0];
}

async function fetchDashboardData(forceRefresh) {
  // On the published static site there's no live API - "refresh" just
  // re-fetches this file (cache: "no-store" means it's never stale).
  // /api/dashboard only exists when running the local dev server
  // (server.js), and is used purely as a fallback for that case, e.g.
  // before the static file has ever been built locally.
  try {
    const res = await fetch("dashboard-data.json", { cache: "no-store" });
    if (res.ok) return res.json();
  } catch (_) {}
  const res = await fetch(`/api/dashboard${forceRefresh ? "?refresh=1" : ""}`);
  return res.json();
}

function buildCompanyIndex(data) {
  const byName = {};
  for (const c of data.companies || []) byName[c.name] = c.id;
  return byName;
}

function companyLink(name, companyIndex) {
  const id = companyIndex[name];
  return id ? `<a href="company.html?id=${encodeURIComponent(id)}" class="company-link">${name}</a>` : name;
}

async function load(forceRefresh) {
  const deck = document.getElementById("deck");
  try {
    const data = await fetchDashboardData(forceRefresh);
    if (data.error) throw new Error(data.error);
    render(deck, data);
  } catch (err) {
    deck.innerHTML = `<div class="loading">Couldn't load dashboard data: ${err.message}</div>`;
  }
}
window.refreshDashboard = () => load(true);

function render(deck, data) {
  const companyIndex = buildCompanyIndex(data);
  const totalTouchpoints = data.touchpoints.length;
  const companiesWithTouchpoints = new Set(data.touchpoints.flatMap((t) => t.attendees.map((a) => a.companyName))).size;
  const unlogged = data.health.filter((h) => h.flag === "unlogged").length;
  const attention = data.health.filter((h) => h.flag === "red" || h.flag === "yellow");

  const taskRows = data.tasks.length
    ? data.tasks.map((t) => `<tr><td>${fmtDate(t.dueDate)}</td><td>${companyLink(t.companyName, companyIndex)}</td><td>${t.name}</td><td class="center-cell">${t.owner}</td><td>${t.status}</td></tr>`).join("")
    : `<tr><td colspan="5" class="empty-note">Nothing due this week. Good spot to be in.</td></tr>`;

  function groupByCompany(attendees) {
    const byCompany = new Map();
    for (const a of attendees) {
      if (!byCompany.has(a.companyName)) byCompany.set(a.companyName, []);
      byCompany.get(a.companyName).push(firstName(a.contactName));
    }
    return [...byCompany.entries()]
      .map(([company, names]) => `${companyLink(company, companyIndex)} &mdash; ${names.join(", ")}`)
      .join("; ");
  }

  const touchpointHtml = data.calendarError
    ? `<div class="empty-note" style="color:#E24B4A">Calendar error: ${data.calendarError}</div>`
    : data.touchpoints.length
    ? data.touchpoints
        .map((t) => {
          const grouped = groupByCompany(t.attendees);
          return `<div class="touchpoint-row"><span class="icon">${meetingIcon(t.meetingType)}</span>${fmtDateTime(t.start)} &mdash; ${grouped}</div>`;
        })
        .join("")
    : `<div class="empty-note">No client meetings matched on your calendar in the lookahead window.</div>`;

  const healthHtml = attention.length
    ? attention
        .map(
          (h) =>
            `<div class="health-line"><span class="flag-dot flag-${h.flag}"></span>${h.contactName}, <b>${companyLink(h.companyName, companyIndex)}</b> &mdash; ${flagLabel(h.flag)}</div>`
        )
        .join("")
    : `<div class="empty-note">No contacts are overdue for a check-in.</div>`;

  deck.innerHTML = `
    <div class="logo-wrap"><img src="logo.jpg" alt="Maker Lab" /></div>
    <div class="deck-header">
      <div class="header-left">
        ${renderHamburgerNav(data.companies)}
        <div>
          <div class="eyebrow">${new Date(data.generatedAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
          <div class="headline">${singaporeGreeting()}</div>
        </div>
      </div>
      <button class="refresh-btn" onclick="window.refreshDashboard()" aria-label="Refresh">&#8635;</button>
    </div>
    <div class="stat-row">
      <div class="stat-card"><div class="stat-num">${data.tasks.length}</div><div class="stat-label">tasks due this week</div></div>
      <div class="stat-card"><div class="stat-num">${totalTouchpoints}</div><div class="stat-label">meetings scheduled, ${companiesWithTouchpoints} client${companiesWithTouchpoints === 1 ? "" : "s"}</div></div>
      <div class="stat-card"><div class="stat-num">${unlogged}</div><div class="stat-label">contacts with no last-contact logged</div></div>
    </div>
    <div class="panel">
      <div class="panel-title">Executive summary</div>
      <div class="empty-note">Coming soon &mdash; top 3 points across clients (Company, Client when relevant, and the key point), pulled from Granola and Chats. Source setup pending.</div>
    </div>
    <div class="panel">
      <div class="panel-title">Tasks due this week</div>
      <table class="task-table">
        <tr><th>Date</th><th>Client</th><th>Task</th><th class="center-cell">Owner</th><th>Status</th></tr>
        ${taskRows}
      </table>
    </div>
    <div class="two-col">
      <div class="panel">
        <div class="panel-title">Next client touchpoints</div>
        ${touchpointHtml}
      </div>
      <div class="panel">
        <div class="panel-title">Client health</div>
        ${healthHtml}
      </div>
    </div>
  `;
}

load();
