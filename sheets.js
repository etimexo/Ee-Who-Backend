// sheets.js
const { google } = require("googleapis");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

if (!SHEET_ID || !SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
  console.error("FATAL: Google credentials missing in environment variables.");
  process.exit(1);
}

const auth = new google.auth.JWT({
  email: SERVICE_ACCOUNT_EMAIL,
  key: PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

async function getRows(tabName) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A2:Z`,
    });
    return res.data.values || [];
  } catch (err) {
    console.error(`Error fetching tab ${tabName}:`, err.message);
    return [];
  }
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function countByField(rows, fieldIndex, fallback = "General") {
  const counts = {};
  for (const row of rows) {
    const key = (row[fieldIndex] || fallback).toString().trim() || fallback;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([key, n]) => ({ key, n }))
    .sort((a, b) => b.n - a.n);
}

function countByDayLast30(rows, timestampIndex) {
  const cutoff = daysAgoISO(30);
  const counts = {};

  for (const row of rows) {
    const raw = row[timestampIndex];
    if (!raw) continue;

    const parsedDate = new Date(raw);
    if (isNaN(parsedDate.getTime())) continue;

    const day = parsedDate.toISOString().slice(0, 10);
    if (day < cutoff) continue;

    counts[day] = (counts[day] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([day, n]) => ({ day, n }))
    .sort((a, b) => (a.day > b.day ? 1 : -1));
}

// Normalizes columns if Botpress skipped writing timestamp to Column A
function normalizeRow(row, defaultCategoryIdx = 4) {
  if (!row || row.length === 0) return null;

  const firstVal = (row[0] || "").trim();
  const parsed = new Date(firstVal);
  const isDate = !isNaN(parsed.getTime()) && firstVal.length > 5 && /\d/.test(firstVal);

  if (!isDate) {
    // Columns shifted left by 1
    return {
      timestamp: new Date().toISOString(),
      name: row[0] || "Anonymous",
      email: row[1] || "",
      phoneOrCat: row[2] || "",
      field1: row[3] || "",
      field2: row[4] || "",
      raw: row,
    };
  }

  return {
    timestamp: row[0],
    name: row[1] || "Anonymous",
    email: row[2] || "",
    phoneOrCat: row[3] || "",
    field1: row[4] || "",
    field2: row[5] || "",
    raw: row,
  };
}

async function fetchAllRaw() {
  const [rawVolunteers, rawDonors, rawFeedback] = await Promise.all([
    getRows("Volunteers"),
    getRows("DonorInquiries"),
    getRows("Feedback"),
  ]);

  return { rawVolunteers, rawDonors, rawFeedback };
}

// PUBLIC: Only totals, momentum, and aggregates
async function getPublicStats() {
  const { rawVolunteers, rawDonors, rawFeedback } = await fetchAllRaw();

  const volunteers = rawVolunteers.map(r => normalizeRow(r)).filter(Boolean);
  const donors = rawDonors.map(r => normalizeRow(r)).filter(Boolean);

  const volunteersByArea = countByField(volunteers.map(r => [r.field1 || r.phoneOrCat]), 0)
    .map(r => ({ area: r.key, n: r.n }));

  const donationsByCategory = countByField(donors.map(r => [r.field1 || r.phoneOrCat]), 0)
    .map(r => ({ category: r.key, n: r.n }));

  return {
    totals: {
      volunteers: rawVolunteers.length,
      donor_inquiries: rawDonors.length,
      feedback: rawFeedback.length,
    },
    volunteers_by_area: volunteersByArea,
    donations_by_category: donationsByCategory,
    signups_last_30_days: countByDayLast30(volunteers.map(r => [r.timestamp]), 0),
    donations_last_30_days: countByDayLast30(donors.map(r => [r.timestamp]), 0),
  };
}

// ADMIN: Full pipeline details including contact info
async function getAdminStats() {
  const publicData = await getPublicStats();
  const { rawVolunteers, rawDonors, rawFeedback } = await fetchAllRaw();

  const volunteers = rawVolunteers.map(r => normalizeRow(r)).filter(Boolean);
  const donors = rawDonors.map(r => normalizeRow(r)).filter(Boolean);
  const feedback = rawFeedback.map(r => normalizeRow(r)).filter(Boolean);

  return {
    ...publicData,
    recent_volunteers: volunteers.slice(-20).reverse().map(r => ({
      name: r.name,
      email: r.email,
      interest_area: r.field1 || r.phoneOrCat || "General",
      created_at: r.timestamp,
    })),
    recent_donor_inquiries: donors.slice(-20).reverse().map(r => ({
      name: r.name,
      email: r.email,
      category: r.phoneOrCat || "General Support",
      amount: r.field1 || "—",
      currency: r.field2 || "",
      created_at: r.timestamp,
    })),
    recent_feedback: feedback.slice(-15).reverse().map(r => ({
      name: r.name,
      email: r.email,
      message: r.field1 || r.phoneOrCat || "—",
      created_at: r.timestamp,
    })),
  };
}

module.exports = { getPublicStats, getAdminStats };
