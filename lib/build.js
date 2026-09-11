// Run in CI (or locally) to regenerate public/dashboard-data.json.
// Unlike server.js, this does not keep a live process running -
// GitHub Actions runs this on a schedule and publishes the result.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { buildDashboard } = require("./dashboard-data");

// index.html/company.html/talent.html reference styles.css, app.js, etc.
// with no version string, so a browser (or GitHub Pages' CDN in front of
// it) can keep serving an old cached copy of those files indefinitely
// after a deploy - a real design fix can land in the repo and still not
// be visible on the live site. Rewriting each reference with a
// per-deploy version query string forces a fresh fetch every time this
// build runs. Only rewrites public/*.html - never committed back to git,
// since upload-pages-artifact publishes the built `public` dir directly.
function cacheBustHtml(dir, version) {
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".html")) continue;
    const filePath = path.join(dir, file);
    let html = fs.readFileSync(filePath, "utf8");
    html = html.replace(/(href|src)="([\w.-]+\.(?:css|js))"/g, (m, attr, name) => `${attr}="${name}?v=${version}"`);
    fs.writeFileSync(filePath, html);
  }
}

async function main() {
  const data = await buildDashboard();

  // Don't publish contact emails to a public site - the dashboard UI
  // never displays them, they'd just be sitting in the JSON for anyone
  // who opens dev tools.
  if (data.health) {
    data.health = data.health.map(({ contactName, companyName, daysSince, flag }) => ({
      contactName,
      companyName,
      daysSince,
      flag,
    }));
  }

  const outPath = path.join(__dirname, "..", "public", "dashboard-data.json");
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`Wrote ${outPath}`);

  const version = (process.env.GITHUB_SHA || String(Date.now())).slice(0, 12);
  cacheBustHtml(path.join(__dirname, "..", "public"), version);
  console.log(`Cache-busted HTML assets with version ${version}`);
}

main().catch((err) => {
  console.error("Build failed:", err.message);
  process.exit(1);
});
