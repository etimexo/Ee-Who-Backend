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
const fs = require("fs"); // Make sure this is at the top of server.js if it isn't already

app.get("/admin", requireAdminAuth, (req, res) => {
  // Check if admin.html is in the root folder or inside a /public folder
  const rootPath = path.join(__dirname, "admin.html");
  const publicPath = path.join(__dirname, "public", "admin.html");

  if (fs.existsSync(rootPath)) {
    return res.sendFile(rootPath);
  } else if (fs.existsSync(publicPath)) {
    return res.sendFile(publicPath);
  } else {
    // If neither exists, this message will display on screen instead of a blank white page
    res.status(404).send("File error: admin.html was not found in your repository root or public folder.");
  }
});

app.get("/admin", requireAdminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
