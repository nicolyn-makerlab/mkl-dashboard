// Run in CI (or locally) to regenerate public/dashboard-data.json.
// Unlike server.js, this does not keep a live process running -
// GitHub Actions runs this on a schedule and publishes the result.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { buildDashboard } = require("./dashboard-data");

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
}

main().catch((err) => {
  console.error("Build failed:", err.message);
  process.exit(1);
});
