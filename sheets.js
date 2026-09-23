// sheets.js
// Reads live data from the Google Sheet that Botpress writes to, using a
// Google Cloud "service account" (a robot Google identity) with read-only
// access. This has nothing to do with Botpress's own Google connection —
// they're two separate credentials, which is normal and fine.

const { google } = require("googleapis");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
// Private keys contain literal "\n" sequences when stored as a single env
// var line — this converts them back into real newlines.
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

if (!SHEET_ID || !SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
  console.error(
    "FATAL: GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_PRIVATE_KEY must all be set."
  );
  process.exit(1);
}

const auth = new google.auth.JWT({
  email: SERVICE_ACCOUNT_EMAIL,
  key: PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

// Pulls all data rows (skipping the header row) from a given tab.
async function getRows(tabName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A2:Z`, // A2 skips the header row
  });
  return res.data.values || [];
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function countByField(rows, fieldIndex, fallback = "Unspecified") {
  const counts = {};
  for (const row of rows) {
    const key = (row[fieldIndex] || fallback).trim() || fallback;
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

    // Skip rows where the date is invalid or unparseable
    if (isNaN(parsedDate.getTime())) {
      console.warn(`Skipping invalid date value: "${raw}"`);
      continue;
    }

    const day = parsedDate.toISOString().slice(0, 10);
    if (day < cutoff) continue;

    counts[day] = (counts[day] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([day, n]) => ({ day, n }))
    .sort((a, b) => (a.day > b.day ? 1 : -1));
}

async function getStats() {
  const [volunteers, donors, feedback] = await Promise.all([
    getRows("Volunteers"),
    getRows("DonorInquiries"),
    getRows("Feedback"),
  ]);

  // Column order per the header rows specified in the setup guide:
  // Volunteers:      Timestamp(0) Name(1) Email(2) Phone(3) InterestArea(4) Availability(5)
  // DonorInquiries:  Timestamp(0) Name(1) Email(2) Amount(3) Currency(4) Category(5) Message(6)
  // Feedback:        Timestamp(0) Name(1) Email(2) ProgramArea(3) Message(4)

  const volunteersByArea = countByField(volunteers, 4).map((r) => ({ area: r.key, n: r.n }));
  const donationsByCategory = countByField(donors, 5).map((r) => ({ category: r.key, n: r.n }));

  const recentVolunteers = volunteers
    .slice(-5)
    .reverse()
    .map((r) => ({ name: r[1], interest_area: r[4], created_at: r[0] }));

  const recentDonorInquiries = donors
    .slice(-5)
    .reverse()
    .map((r) => ({ name: r[1], category: r[5], amount: r[3], currency: r[4], created_at: r[0] }));

  return {
    totals: {
      volunteers: volunteers.length,
      donor_inquiries: donors.length,
      feedback: feedback.length,
    },
    volunteers_by_area: volunteersByArea,
    donations_by_category: donationsByCategory,
    signups_last_30_days: countByDayLast30(volunteers, 0),
    donations_last_30_days: countByDayLast30(donors, 0),
    recent_volunteers: recentVolunteers,
    recent_donor_inquiries: recentDonorInquiries,
  };
}

module.exports = { getStats };
