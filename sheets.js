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

function isValidDate(val) {
  if (!val || typeof val !== "string") return false;
  // Check if it starts with digits and has date characters
  if (!/^\d{4}/.test(val.trim())) return false;
  const d = new Date(val);
  return !isNaN(d.getTime());
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function countByField(items, key, fallback = "General") {
  const counts = {};
  for (const item of items) {
    const val = (item[key] || fallback).toString().trim() || fallback;
    counts[val] = (counts[val] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([k, n]) => ({ key: k, n }))
    .sort((a, b) => b.n - a.n);
}

function countByDayLast30(items) {
  const cutoff = daysAgoISO(30);
  const counts = {};
  for (const item of items) {
    if (!item.created_at) continue;
    const d = new Date(item.created_at);
    if (isNaN(d.getTime())) continue;
    const day = d.toISOString().slice(0, 10);
    if (day < cutoff) continue;
    counts[day] = (counts[day] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([day, n]) => ({ day, n }))
    .sort((a, b) => (a.day > b.day ? 1 : -1));
}

// 1. Parser for Volunteers
// Can be: [Timestamp, Name, Email, Phone, Area, Availability]
// OR:     [Empty, Name, Email, Phone, Area, Availability]
// OR:     [Name, Email, Phone, Area, Availability]
function parseVolunteerRow(row) {
  if (!row || row.length === 0) return null;
  let timestamp, name, email, phone, area, availability;

  if (isValidDate(row[0])) {
    timestamp = row[0];
    name = row[1];
    email = row[2];
    phone = row[3];
    area = row[4];
    availability = row[5];
  } else if (!row[0] && row[1]) {
    // Column A is blank
    timestamp = new Date().toISOString();
    name = row[1];
    email = row[2];
    phone = row[3];
    area = row[4];
    availability = row[5];
  } else {
    // Column A is Name (shifted left)
    timestamp = new Date().toISOString();
    name = row[0];
    email = row[1];
    phone = row[2];
    area = row[3];
    availability = row[4];
  }

  if (!name && !email) return null;

  return {
    name: name || "Anonymous",
    email: email || "",
    phone: phone || "",
    interest_area: area || "WASH",
    availability: availability || "",
    created_at: timestamp,
  };
}

// 2. Parser for DonorInquiries
// In your sheet: Col A: Name, Col B: Email, Col C: Category, Col D: Amount, Col E: Currency
function parseDonorRow(row) {
  if (!row || row.length === 0) return null;
  let timestamp, name, email, category, amount, currency;

  if (isValidDate(row[0])) {
    timestamp = row[0];
    name = row[1];
    email = row[2];
    amount = row[3];
    currency = row[4];
    category = row[5];
  } else if (!row[0] && row[1]) {
    timestamp = new Date().toISOString();
    name = row[1];
    email = row[2];
    category = row[3];
    amount = row[4];
    currency = row[5];
  } else {
    // Row 0 is Name (as in your actual screenshot!)
    timestamp = new Date().toISOString();
    name = row[0];
    email = row[1];
    category = row[2];
    amount = row[3];
    currency = row[4];
  }

  if (!name && !email) return null;

  return {
    name: name || "Anonymous",
    email: email || "",
    category: category || "General Support",
    amount: amount || "",
    currency: currency || "",
    created_at: timestamp,
  };
}

// 3. Parser for Feedback
// In your sheet: Col A: Blank, Col B: Name, Col C: Email, Col D: ProgramArea, Col E: Message
function parseFeedbackRow(row) {
  if (!row || row.length === 0) return null;
  let timestamp, name, email, programArea, message;

  if (isValidDate(row[0])) {
    timestamp = row[0];
    name = row[1];
    email = row[2];
    programArea = row[3];
    message = row[4];
  } else if (!row[0] && row[1]) {
    // Blank Column A (matches your screenshot)
    timestamp = new Date().toISOString();
    name = row[1];
    email = row[2];
    programArea = row[3];
    message = row[4];
  } else {
    timestamp = new Date().toISOString();
    name = row[0];
    email = row[1];
    programArea = row[2];
    message = row[3];
  }

  if (!name && !message) return null;

  return {
    name: name || "Anonymous",
    email: email || "",
    program_area: programArea || "General",
    message: message || "—",
    created_at: timestamp,
  };
}

async function fetchParsedData() {
  const [rawVolunteers, rawDonors, rawFeedback] = await Promise.all([
    getRows("Volunteers"),
    getRows("DonorInquiries"),
    getRows("Feedback"),
  ]);

  const volunteers = rawVolunteers.map(parseVolunteerRow).filter(Boolean);
  const donors = rawDonors.map(parseDonorRow).filter(Boolean);
  const feedback = rawFeedback.map(parseFeedbackRow).filter(Boolean);

  return { volunteers, donors, feedback };
}

// Public API
async function getPublicStats() {
  const { volunteers, donors, feedback } = await fetchParsedData();

  const volunteersByArea = countByField(volunteers, "interest_area").map(r => ({ area: r.key, n: r.n }));
  const donationsByCategory = countByField(donors, "category").map(r => ({ category: r.key, n: r.n }));

  return {
    totals: {
      volunteers: volunteers.length,
      donor_inquiries: donors.length,
      feedback: feedback.length,
    },
    volunteers_by_area: volunteersByArea,
    donations_by_category: donationsByCategory,
    signups_last_30_days: countByDayLast30(volunteers),
    donations_last_30_days: countByDayLast30(donors),
  };
}

// Admin API
async function getAdminStats() {
  const { volunteers, donors, feedback } = await fetchParsedData();
  const publicStats = await getPublicStats();

  return {
    ...publicStats,
    recent_volunteers: volunteers.slice(-20).reverse(),
    recent_donor_inquiries: donors.slice(-20).reverse(),
    recent_feedback: feedback.slice(-20).reverse(),
  };
}

module.exports = { getPublicStats, getAdminStats };
