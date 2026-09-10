function renderHamburgerNav(companies) {
  return `
    <div class="nav-wrap">
      <button class="hamburger-btn" onclick="window.toggleCompanyMenu()" aria-label="Company menu">&#9776;</button>
      <div class="company-menu" id="company-menu">
        ${(companies || [])
          .map((c) => `<a href="company.html?id=${encodeURIComponent(c.id)}">${c.name}</a>`)
          .join("")}
      </div>
    </div>`;
}

window.toggleCompanyMenu = () => {
  const menu = document.getElementById("company-menu");
  if (menu) menu.classList.toggle("open");
};

document.addEventListener("click", (e) => {
  const menu = document.getElementById("company-menu");
  if (!menu || !menu.classList.contains("open")) return;
  const wrap = menu.closest(".nav-wrap");
  if (wrap && wrap.contains(e.target)) return;
  menu.classList.remove("open");
});
