require("dotenv").config();
const express = require("express");
const path = require("path");
const { buildDashboard } = require("./lib/dashboard-data");

const app = express();
const PORT = process.env.PORT || 3000;

let cache = null;

app.get("/api/dashboard", async (req, res) => {
  try {
    if (!cache || req.query.refresh === "1") {
      cache = await buildDashboard();
    }
    res.json(cache);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`MKL client dashboard running at http://localhost:${PORT}`);
});
