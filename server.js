// server.js
const express = require("express");
const path = require("path");
const cors = require("cors");
const { getPublicStats, getAdminStats } = require("./sheets");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());

// Allow iframe embedding across domains
app.use((req, res, next) => {
  res.removeHeader("X-Frame-Options");
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://www.ethanaeworld.org https://ethanaeworld.org"
  );
  next();
});

// Serve static frontend assets
app.use(express.static(path.join(__dirname, "public")));

// Basic Authentication Middleware for Admin routes
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Ee\'who Admin Portal"');
    return res.status(401).send("Authentication required.");
  }

  const encoded = authHeader.split(" ")[1];
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const [username, password] = decoded.split(":");

  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPass = process.env.ADMIN_PASSWORD || "EthanaImpact2026";

  if (username === adminUser && password === adminPass) {
    return next();
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="Ee\'who Admin Portal"');
  return res.status(401).send("Invalid credentials.");
}

// PUBLIC ENDPOINTS
app.get("/api/stats", async (req, res) => {
  try {
    const stats = await getPublicStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    console.error("Public stats error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ADMIN ENDPOINTS (Protected)
app.get("/api/admin/stats", requireAdminAuth, async (req, res) => {
  try {
    const stats = await getAdminStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/admin", requireAdminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
