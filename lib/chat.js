const { google } = require("googleapis");
const { getAuthedClient } = require("./google-auth");

// First diagnostic step for Google Chat: just list the spaces (DMs and
// named spaces) the authenticated user can see. This is the safest call
// to prove the OAuth scopes and Workspace access actually work before
// building anything that reads message content.
async function listSpaces() {
  const auth = getAuthedClient();
  const chat = google.chat({ version: "v1", auth });

  const spaces = [];
  let pageToken;
  do {
    const res = await chat.spaces.list({
      pageSize: 100,
      pageToken,
      // DIRECT_MESSAGE covers 1:1 and group DMs, SPACE covers named
      // Chat spaces. Listing both since Nicolyn asked for "all DMs".
      filter: "spaceType = \"DIRECT_MESSAGE\" OR spaceType = \"SPACE\"",
    });
    spaces.push(...(res.data.spaces || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return spaces.map((s) => ({
    name: s.name,
    displayName: s.displayName || null,
    type: s.spaceType,
  }));
}

module.exports = { listSpaces };
