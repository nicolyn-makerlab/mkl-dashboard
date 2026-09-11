// Run with: npm run chat-thread-check
// Standalone diagnostic - confirms whether Google Chat gives us usable
// thread grouping and sender display names before building the real
// per-thread, per-outcome summarization on top of it. Message text is
// redacted to its length; only structure (thread/sender/time) is shown.
require("dotenv").config();
const { listRecentMessages, listMembers } = require("./chat");

// One real mapped space (STB's main space) - just needs any space with
// recent activity, not tied to which company ends up being checked.
const SPACE = process.argv[2] || "spaces/AAQAyLkpX4s";
const LOOKBACK_DAYS = 30;

listMembers(SPACE)
  .then((members) => {
    console.log(`Space members (${members.length}):\n`);
    for (const m of members) {
      console.log(`- ${m.memberName} | type=${m.type} | displayName=${m.displayName || "(missing)"}`);
    }
    console.log("");
  })
  .catch((err) => {
    console.error("Couldn't list members:", err.message, "\n");
  })
  .then(() => listRecentMessages(SPACE, new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()))
  .then((messages) => {
    if (!messages.length) {
      console.log(`Connected, but no messages found in ${SPACE} in the last ${LOOKBACK_DAYS} days.`);
      return;
    }
    console.log(`Found ${messages.length} message(s) in ${SPACE}:\n`);

    const byThread = new Map();
    for (const m of messages) {
      const key = m.threadName || "(no thread)";
      if (!byThread.has(key)) byThread.set(key, []);
      byThread.get(key).push(m);
    }

    console.log(`Grouped into ${byThread.size} thread(s):\n`);
    for (const [thread, msgs] of byThread) {
      console.log(`- ${thread}: ${msgs.length} message(s)`);
      for (const m of msgs.slice(0, 3)) {
        console.log(
          `    ${m.createTime} | sender.name=${m.senderName} | sender.displayName=${m.senderDisplayName || "(missing)"} | text: <${m.text.length} chars>`
        );
      }
    }

    // Since Google won't give us a real name for each sender ID, showing
    // one actual message per sender (longest available, for the best
    // chance of being recognizable) lets a human match ID -> person by
    // content instead. Only doing this because it was explicitly asked
    // for - the other diagnostics deliberately redact message text.
    const bySender = new Map();
    for (const m of messages) {
      if (!bySender.has(m.senderName) || m.text.length > bySender.get(m.senderName).text.length) {
        bySender.set(m.senderName, m);
      }
    }
    console.log(`\nOne sample message per sender, for identifying who's who:\n`);
    for (const [sender, m] of bySender) {
      console.log(`- ${sender}:\n    "${m.text.slice(0, 200)}"\n`);
    }
  })
  .catch((err) => {
    console.error("\nChat thread check failed:", err.message);
    process.exit(1);
  });
