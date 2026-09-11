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

// Recent messages in one space, newest first. Keeps enough structure
// (thread, sender, text) to group by thread and attribute an outcome to
// whoever posted it - used as raw input to summarization, never rendered
// verbatim on the dashboard.
async function listRecentMessages(spaceName, sinceISO) {
  const auth = getAuthedClient();
  const chat = google.chat({ version: "v1", auth });

  const messages = [];
  let pageToken;
  do {
    const res = await chat.spaces.messages.list({
      parent: spaceName,
      pageSize: 100,
      pageToken,
      filter: `createTime > "${sinceISO}"`,
      orderBy: "createTime desc",
    });
    messages.push(...(res.data.messages || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return messages
    .filter((m) => (m.text || "").trim())
    .map((m) => ({
      text: m.text.trim(),
      createTime: m.createTime,
      threadName: m.thread && m.thread.name,
      senderName: m.sender && m.sender.name,
      senderDisplayName: m.sender && m.sender.displayName,
    }));
}

// Membership list for one space - tested as a way to resolve the opaque
// "users/123..." sender IDs on messages into actual names, since message
// responses aren't returning sender.displayName directly.
async function listMembers(spaceName) {
  const auth = getAuthedClient();
  const chat = google.chat({ version: "v1", auth });

  const members = [];
  let pageToken;
  do {
    const res = await chat.spaces.members.list({
      parent: spaceName,
      pageSize: 100,
      pageToken,
    });
    members.push(...(res.data.memberships || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return members.map((m) => ({
    memberName: m.member && m.member.name,
    displayName: m.member && m.member.displayName,
    type: m.member && m.member.type,
  }));
}

module.exports = { listSpaces, listRecentMessages, listMembers };
