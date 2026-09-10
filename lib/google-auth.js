const fs = require("fs");
const { google } = require("googleapis");

// Two ways to authenticate:
// 1. Local dev: reads google-credentials.json + google-token.json from disk
//    (created by "npm run auth").
// 2. CI / GitHub Actions: reads GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
//    GOOGLE_REFRESH_TOKEN from environment secrets - no files needed,
//    since Actions runners are ephemeral and can't hold onto local state.
function getAuthedClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN) {
    const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
    return client;
  }

  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || "./google-credentials.json";
  const tokenPath = process.env.GOOGLE_TOKEN_PATH || "./google-token.json";
  if (!fs.existsSync(credPath) || !fs.existsSync(tokenPath)) {
    throw new Error(
      'Google not connected. Run "npm run auth" locally first, or set ' +
        "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN as secrets in CI."
    );
  }
  const { client_id, client_secret, redirect_uris } = JSON.parse(
    fs.readFileSync(credPath)
  ).installed;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  client.setCredentials(JSON.parse(fs.readFileSync(tokenPath)));
  return client;
}

module.exports = { getAuthedClient };
