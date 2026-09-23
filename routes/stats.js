// routes/stats.js
const express = require("express");
const router = express.Router();
const { getStats } = require("../sheets");

// GET /api/stats
// Used by the dashboard. Reads live from the same Google Sheet Botpress
// writes to — no database involved at all anymore.
router.get("/", async (req, res) => {
  try {
    const stats = await getStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    console.error("stats error:", err.message);
    res.status(500).json({ success: false, error: "Could not read stats from Google Sheets" });
  }
});

module.exports = router;
