// Run once locally with: npm run auth
// Google's modern OAuth flow for Desktop apps redirects to a local
// loopback address (http://localhost:<some port>) after you approve
// access - it expects something listening there to catch the response,
// rather than the old "copy this code" flow Google retired. This
// script spins up a temporary local server just long enough to catch
// that one redirect, then shuts itself down.
require("dotenv").config();
const fs = require("fs");
const http = require("http");
const { URL } = require("url");
const { google } = require("googleapis");

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

async function main() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || "./google-credentials.json";
  const tokenPath = process.env.GOOGLE_TOKEN_PATH || "./google-token.json";

  if (!fs.existsSync(credPath)) {
    console.error(
      `Missing ${credPath}. Download an OAuth "Desktop app" client from\n` +
        "https://console.cloud.google.com > APIs & Services > Credentials,\n" +
        "enable the Google Calendar API first, then save the JSON here."
    );
    process.exit(1);
  }

  const { client_id, client_secret } = JSON.parse(fs.readFileSync(credPath)).installed;

  const server = http.createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const redirectUri = `http://127.0.0.1:${port}`;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\nOpen this URL and approve access:\n\n" + authUrl + "\n");
  console.log("Waiting for you to finish in the browser...");

  const code = await new Promise((resolve, reject) => {
    server.on("request", (req, res) => {
      const url = new URL(req.url, redirectUri);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.end(
        error
          ? "Something went wrong - you can close this tab and check the terminal."
          : "Success - you can close this tab and go back to the terminal."
      );
      if (error) reject(new Error(error));
      else resolve(code);
    });
  });
  server.close();

  const { tokens } = await oAuth2Client.getToken(code);
  fs.writeFileSync(tokenPath, JSON.stringify(tokens));
  console.log(`\nSaved token to ${tokenPath} for local dev.\n`);
  console.log(
    "For GitHub Actions later, add these as repo Settings > Secrets and variables > Actions > New repository secret:\n"
  );
  console.log(`GOOGLE_CLIENT_ID = ${client_id}`);
  console.log(`GOOGLE_CLIENT_SECRET = ${client_secret}`);
  console.log(
    `GOOGLE_REFRESH_TOKEN = ${tokens.refresh_token || "(none returned - re-run this script; make sure you removed prior app access at https://myaccount.google.com/permissions first)"}`
  );
}

main().catch((err) => {
  console.error("\nAuth failed:", err.message);
  process.exit(1);
});