# Ee'who Live Dashboard (Google Sheets edition)

This replaces the database entirely. Botpress writes volunteer/donor/feedback
data straight into a Google Sheet using its own native Google Sheets
integration (no more custom HTTP tools to debug). This small backend does
one job: read that same Sheet and serve it as a live dashboard, embeddable
anywhere via the included widget.

Tested: server boot, health check, and graceful failure on bad credentials
all confirmed working. The actual live Google Sheets read needs your real
credentials (Part 4 below) to fully verify — googleapis is a very
well-established library, but I couldn't hit Google's real API from my
sandbox to test the live read itself.

## Part 1 — Google Sheet (see main chat reply for exact tab/column layout)

Create the sheet with 3 tabs — `Volunteers`, `DonorInquiries`, `Feedback` —
with header rows exactly as specified. Column order matters: `sheets.js`
reads columns by position, not by header name.

## Part 2 — Botpress's native Google Sheets integration

Connect it under Tools → Integrations → Google Sheets, then use its
"Add Row" / "Get Rows" actions in your playbooks instead of the old custom
HTTP tools. This is a first-party integration, so it should be far more
reliable than hand-built HTTP calls.

## Part 3 — Deploy this backend to Render

1. Push all these files to a repo (can reuse `Ee-Who-Backend` — replace
   everything, or make a new repo, your call)
2. Render → Manual Deploy → Clear build cache & deploy
3. No `DATABASE_URL` needed anymore — this version has no database at all

## Part 4 — Create a Google service account (for reading the Sheet)

This is separate from Botpress's own Google connection — this one is just
for your backend to read the Sheet.

1. Go to https://console.cloud.google.com → create a new project (any name)
2. In the search bar, find and enable **"Google Sheets API"**
3. Go to **IAM & Admin → Service Accounts → Create Service Account**
   (any name, e.g. `eewho-dashboard-reader`)
4. Once created, click into it → **Keys tab → Add Key → Create new key → JSON**
   — this downloads a `.json` file. Keep it safe, don't commit it to GitHub.
5. Open that JSON file. You need two values from it:
   - `client_email` → this is your `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → this is your `GOOGLE_PRIVATE_KEY` (long string starting
     with `-----BEGIN PRIVATE KEY-----`)
6. **Share your Google Sheet with that `client_email` address** — open the
   Sheet → Share → paste the service account email → give it **Viewer**
   access. This step is easy to miss and is the #1 cause of "permission
   denied" errors.

## Part 5 — Set Render's environment variables

| Key | Value |
|---|---|
| `GOOGLE_SHEET_ID` | the long ID in your Sheet's URL between `/d/` and `/edit` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the JSON key |
| `GOOGLE_PRIVATE_KEY` | `private_key` from the JSON key — paste the whole thing including `-----BEGIN...` and `-----END...` lines |

When pasting `GOOGLE_PRIVATE_KEY` into Render's dashboard, paste it exactly
as it appears in the JSON file (with literal `\n` characters) — the code
already handles converting those into real newlines.

## Part 6 — Test it

- `https://<your-render-url>/api/health` → should return success
- `https://<your-render-url>/api/stats` → should return real numbers once
  there's at least one row in your Sheet
- `https://<your-render-url>/dashboard.html` → should show live charts

## Part 7 — Embed the collapsible widget on ethanaeworld.org

1. Open `public/embed-widget.html` in this project
2. Replace the `data-src` value with your actual Render dashboard URL
3. Give this whole file's contents to whoever manages the site, to paste
   into any embeddable HTML/widget area (footer, a custom HTML block, etc.)
4. It renders as a small floating "📊 Impact Dashboard" button in the
   bottom-right corner of the site. Clicking it slides open a panel with
   the live dashboard inside; clicking again collapses it. Nothing else on
   the page is touched — it's fully self-contained and only loads the
   dashboard (and starts its 30-second auto-refresh) once someone actually
   opens it.

## On losing confirmation emails
Since Botpress now writes directly to the Sheet instead of calling your
backend, the automatic confirmation emails I built earlier no longer fire —
nothing triggers them. Cheapest fix, if you want it back: a small Google
Apps Script (Extensions → Apps Script, inside the Sheet itself) with an
`onFormSubmit`-style trigger... except Sheets doesn't have that built in for
plain row additions, so the real free option is an **installable "on edit"
trigger** in Apps Script that checks if a new row was added and sends an
email via `MailApp.sendEmail(...)`. It's maybe 20 lines of script, entirely
free, and lives inside the Sheet itself. Say the word if you want this
built out — it's a separate, self-contained piece from everything here.
