// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const statsRoutes = require("./routes/stats");

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Serves public/dashboard.html and public/embed-widget.js
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok", time: new Date().toISOString() });
});

app.use("/api/stats", statsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Ee'who dashboard backend running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard.html`);
});
