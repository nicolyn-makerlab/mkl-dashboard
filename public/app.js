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
  try {
    if (!forceRefresh) {
      const res = await fetch("dashboard-data.json", { cache: "no-store" });
      if (res.ok) return res.json();
    }
  } catch (_) {}
  const res = await fetch(`/api/dashboard${forceRefresh ? "?refresh=1" : ""}`);
  return res.json();
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
  const totalTouchpoints = data.touchpoints.length;
  const companiesWithTouchpoints = new Set(data.touchpoints.flatMap((t) => t.attendees.map((a) => a.companyName))).size;
  const unlogged = data.health.filter((h) => h.flag === "unlogged").length;
  const attention = data.health.filter((h) => h.flag === "red" || h.flag === "yellow");

  const taskRows = data.tasks.length
    ? data.tasks.map((t) => `<tr><td>${fmtDate(t.dueDate)}</td><td>${t.companyName}</td><td>${t.name}</td><td>${t.owner}</td><td>${t.status}</td></tr>`).join("")
    : `<tr><td colspan="5" class="empty-note">Nothing due this week. Good spot to be in.</td></tr>`;

  const touchpointHtml = data.calendarError
    ? `<div class="empty-note" style="color:#E24B4A">Calendar error: ${data.calendarError}</div>`
    : data.touchpoints.length
    ? data.touchpoints
        .map((t) => {
          const names = t.attendees.map((a) => `${firstName(a.contactName)} (${a.companyName})`).join(", ");
          return `<div class="touchpoint-row"><span class="icon">${meetingIcon(t.meetingType)}</span>${fmtDateTime(t.start)} &mdash; ${names}</div>`;
        })
        .join("")
    : `<div class="empty-note">No client meetings matched on your calendar in the lookahead window.</div>`;

  const healthHtml = attention.length
    ? attention
        .map(
          (h) =>
            `<div class="health-line"><span class="flag-dot flag-${h.flag}"></span>${h.contactName}, <b>${h.companyName}</b> &mdash; ${flagLabel(h.flag)}</div>`
        )
        .join("")
    : `<div class="empty-note">No contacts are overdue for a check-in.</div>`;

  deck.innerHTML = `
    <div class="logo-wrap"><img src="logo.jpg" alt="Maker Lab" /></div>
    <div class="deck-header">
      <div>
        <div class="eyebrow">${new Date(data.generatedAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
        <div class="headline">${singaporeGreeting()}</div>
      </div>
      <button onclick="window.refreshDashboard()" style="background:#151515;color:#CFFF3D;border:1px solid #333;border-radius:8px;padding:8px 14px;font-size:12px;cursor:pointer">&#8635; Refresh</button>
    </div>
    <div class="stat-row">
      <div class="stat-card"><div class="stat-num" style="color:var(--ml-lime)">${data.tasks.length}</div><div class="stat-label">tasks due this week</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--ml-blue-bright)">${totalTouchpoints}</div><div class="stat-label">meetings scheduled, ${companiesWithTouchpoints} client${companiesWithTouchpoints === 1 ? "" : "s"}</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--ml-gray-text)">${unlogged}</div><div class="stat-label">contacts with no last-contact logged</div></div>
    </div>
    <div class="panel">
      <div class="panel-title">Tasks due this week</div>
      <table class="task-table">
        <tr><th>Date</th><th>Client</th><th>Task</th><th>Owner</th><th>Status</th></tr>
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
