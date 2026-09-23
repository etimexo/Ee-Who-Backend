// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const { getPublicStats, getAdminStats } = require("./sheets");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());

// Configure iframe permissions so ethanaeworld.org can embed the widget
app.use((req, res, next) => {
  res.removeHeader("X-Frame-Options");
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://www.ethanaeworld.org https://ethanaeworld.org http://localhost:* http://127.0.0.1:*"
  );
  next();
});

// Serve static assets from both root and /public folders
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, "public")));

// Basic Authentication Middleware for Admin portal & Admin API
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Ee\'who Admin Portal"');
    return res.status(401).send("Authentication required.");
  }

  const encoded = authHeader.split(" ")[1];
  if (!encoded) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Ee\'who Admin Portal"');
    return res.status(401).send("Authentication required.");
  }

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

// ---------------------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------------------

// 1. Public API (Used by dashboard.html / widget)
app.get("/api/stats", async (req, res) => {
  try {
    const stats = await getPublicStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    console.error("Public stats error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Admin API (Used by admin.html)
app.get("/api/admin/stats", requireAdminAuth, async (req, res) => {
  try {
    const stats = await getAdminStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------
// HTML PAGE ROUTES
// ---------------------------------------------------------------------

// Helper function to serve HTML file whether it sits in root or /public
function sendSafeFile(res, fileName) {
  const rootPath = path.join(__dirname, fileName);
  const publicPath = path.join(__dirname, "public", fileName);

  if (fs.existsSync(rootPath)) {
    return res.sendFile(rootPath);
  } else if (fs.existsSync(publicPath)) {
    return res.sendFile(publicPath);
  } else {
    return res.status(404).send(`File not found: ${fileName}`);
  }
}

// Admin portal page
app.get("/admin", requireAdminAuth, (req, res) => {
  sendSafeFile(res, "admin.html");
});

// Public dashboard page
app.get("/dashboard", (req, res) => {
  sendSafeFile(res, "dashboard.html");
});

app.get("/dashboard.html", (req, res) => {
  sendSafeFile(res, "dashboard.html");
});

// Root default route
app.get("/", (req, res) => {
  sendSafeFile(res, "dashboard.html");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
