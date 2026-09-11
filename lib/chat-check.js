// Run with: npm run chat-check
// Standalone diagnostic - lists what Google Chat spaces/DMs the connected
// account can see, without touching the dashboard build. Meant to answer
// "does the Chat connection actually work" before building the real
// dashboard feature on top of it.
require("dotenv").config();
const { listSpaces } = require("./chat");

listSpaces()
  .then((spaces) => {
    if (!spaces.length) {
      console.log("Connected, but no spaces/DMs were returned.");
      return;
    }
    console.log(`Found ${spaces.length} space(s):\n`);
    for (const s of spaces) {
      console.log(`- [${s.type}] ${s.displayName || "(direct message, no name)"} (${s.name})`);
    }
  })
  .catch((err) => {
    console.error("\nChat check failed:", err.message);
    if (err.message && err.message.includes("Google not connected")) {
      console.error("Run \"npm run auth\" first.");
    } else {
      console.error(
        "\nIf this mentions the API not being enabled, the account being blocked, or an admin\n" +
          "restriction, that's a Google Cloud Console / Workspace admin setting, not a code bug -\n" +
          "see README.md for the Chat setup checklist."
      );
    }
    process.exit(1);
  });
