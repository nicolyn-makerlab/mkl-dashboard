function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function renderRoster(roster) {
  if (!roster.length) return `<div class="empty-note">No talent recorded for this company yet.</div>`;
  return `
    <div class="table-scroll">
      <table class="task-table task-table-wide">
        <colgroup>
          <col style="width:160px"><col><col style="width:120px"><col style="width:120px"><col style="width:140px">
        </colgroup>
        <tr><th>Name</th><th>Role</th><th>Started</th><th>Contract Length</th><th>Currently Contracted To</th></tr>
        ${roster
          .map(
            (t) =>
              `<tr><td>${t.name || ""}</td><td class="wrap-cell">${t.role || ""}</td><td>${t.started ? fmtDate(t.started) : ""}</td><td>${t.contractLength || ""}</td><td>${t.contractedTo ? fmtDate(t.contractedTo) : ""}</td></tr>`
          )
          .join("")}
      </table>
    </div>`;
}

function render(deck, company, allCompanies) {
  deck.innerHTML = `
    <div class="logo-wrap"><img src="logo.jpg" alt="Maker Lab" /></div>
    <div class="deck-header">
      <div class="header-left">
        ${renderHamburgerNav(allCompanies)}
        <div>
          <div class="eyebrow"><a href="company.html?id=${encodeURIComponent(company.id)}" class="back-link">&larr; Back to ${company.name}</a></div>
          <div class="company-title">${company.name} talent</div>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title">Talent</div>
      ${company.talentRoster ? renderRoster(company.talentRoster) : `<div class="empty-note">Couldn't load talent data.</div>`}
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
    deck.innerHTML = `<div class="loading">Couldn't load talent data: ${err.message}</div>`;
  }
}

load();
