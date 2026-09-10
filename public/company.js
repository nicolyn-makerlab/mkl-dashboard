function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function renderTasks(tasks) {
  if (!tasks.length) return `<div class="empty-note">No open tasks for this company.</div>`;
  return `
    <div class="table-scroll">
      <table class="task-table task-table-wide">
        <colgroup>
          <col style="width:100px"><col style="width:240px"><col><col style="width:100px"><col style="width:100px">
        </colgroup>
        <tr><th>Due Date</th><th>Task</th><th>Description</th><th>Owner</th><th>Status</th></tr>
        ${tasks
          .map(
            (t) =>
              `<tr><td>${t.dueDate ? fmtDate(t.dueDate) : "No due date"}</td><td>${t.name}</td><td class="wrap-cell">${t.description || ""}</td><td>${t.owner || ""}</td><td>${t.status || ""}</td></tr>`
          )
          .join("")}
      </table>
    </div>`;
}

function gmailComposeUrl(email) {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`;
}

function renderContacts(contacts) {
  if (!contacts.length) return `<div class="empty-note">No contacts logged for this company yet.</div>`;
  return `
    <table class="task-table">
      <tr><th>Name</th><th>Email</th><th>Title</th></tr>
      ${contacts
        .map(
          (ct) =>
            `<tr><td>${ct.name || "Unnamed contact"}</td><td>${ct.email ? `<a href="${gmailComposeUrl(ct.email)}" target="_blank" rel="noopener" class="email-link">${ct.email}</a>` : ""}</td><td>${ct.title || ""}</td></tr>`
        )
        .join("")}
    </table>`;
}

function render(deck, company, allCompanies) {
  deck.innerHTML = `
    <div class="logo-wrap"><img src="logo.jpg" alt="Maker Lab" /></div>
    <div class="deck-header">
      <div class="header-left">
        ${renderHamburgerNav(allCompanies)}
        <div>
          <div class="eyebrow"><a href="index.html" class="back-link">&larr; Back to dashboard</a></div>
          <div class="company-title">${company.name}</div>
        </div>
      </div>
    </div>
    <div class="stat-row">
      <div class="stat-card"><div class="stat-num">${company.talentCount === null || company.talentCount === undefined ? "TBC" : company.talentCount}</div><div class="stat-label">number of talent</div></div>
      <div class="stat-card"><div class="stat-num">TBC</div><div class="stat-label">next scheduled quarterly review</div></div>
      <div class="stat-card"><div class="stat-num">TBC</div><div class="stat-label">&nbsp;</div></div>
    </div>
    <div class="panel">
      <div class="panel-title">Team pulse</div>
      <div class="empty-note">Coming soon &mdash; a summary of team pulse based on talent conversations. Source not decided yet.</div>
    </div>
    <div class="panel">
      <div class="panel-title">Tasks</div>
      ${renderTasks(company.tasks || [])}
    </div>
    <div class="panel">
      <div class="panel-title">Last five company topics</div>
      <div class="empty-note">Coming soon &mdash; pulled from Google Spaces. Needs a Google Chat connector, which isn't set up yet.</div>
    </div>
    <div class="panel">
      <div class="panel-title">Granola executive summary (last 4 weeks)</div>
      <div class="empty-note">Coming soon &mdash; on hold pending a decision on how to handle sensitive meeting content on a public dashboard.</div>
    </div>
    <div class="panel">
      <div class="panel-title">Clients</div>
      ${renderContacts(company.contacts || [])}
      <div class="empty-note" style="margin-top:8px">Personality descriptions coming soon &mdash; same pending decision as above.</div>
    </div>
  `;
}

async function load() {
  const deck = document.getElementById("deck");
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const res = await fetch("dashboard-data.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Couldn't load dashboard data");
    const data = await res.json();
    const company = (data.companies || []).find((c) => c.id === id);
    if (!company) {
      deck.innerHTML = `<div class="loading">Company not found. <a href="index.html" style="color:var(--ml-lime)">Back to dashboard</a></div>`;
      return;
    }
    render(deck, company, data.companies || []);
  } catch (err) {
    deck.innerHTML = `<div class="loading">Couldn't load company data: ${err.message}</div>`;
  }
}

load();
