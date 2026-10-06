/**
 * Leads sheet for "Founders, Reset Your Energy".
 *
 * Setup (about 3 minutes):
 *   1. Create a Google Sheet. Extensions → Apps Script. Replace Code.gs with this file.
 *   2. Change SECRET below to a long random string. Put the same value in the server's SHEETS_SECRET.
 *   3. Deploy → New deployment → type "Web app". Execute as: Me. Who has access: Anyone.
 *      Authorise when asked, then copy the Web app URL (ends in /exec) into SHEETS_WEBHOOK_URL.
 *   4. After editing this script later, use Deploy → Manage deployments → Edit → Version: New version,
 *      so the same URL keeps working.
 *
 * The server sends one JSON row per change. Rows are matched on Lead ID, so each visitor
 * keeps a single row whose Status moves Lead → Checkout started → Paid.
 */
const SECRET = 'CHANGE-ME-to-a-long-random-string';
const SHEET_NAME = 'Leads';

// [header, key in the JSON row]
const COLUMNS = [
  ['Lead ID', 'leadId'],
  ['Status', 'status'],
  ['Name', 'name'],
  ['Email', 'email'],
  ['Phone', 'phone'],
  ['Company', 'company'],
  ['Role', 'role'],
  ['Passes', 'qty'],
  ['Amount (₹)', 'amount'],
  ['Booking ID', 'bookingId'],
  ['Razorpay order', 'orderId'],
  ['Razorpay payment', 'paymentId'],
  ['Method', 'method'],
  ['Pass email', 'emailStatus'],
  ['Created', 'createdAt'],
  ['Paid at', 'paidAt'],
  ['Updated', 'updatedAt'],
];
// Status never moves backwards, even if two updates arrive out of order.
const STATUS_RANK = { 'Lead': 1, 'Checkout started': 2, 'Paid': 3 };
const WRITE_ONCE = ['createdAt'];

// Health check: open the /exec URL in a browser. You should see {"ok":true,...}.
// A Google "404 / page not found" means the URL is wrong or the deployment was removed;
// a sign-in page means "Who has access" is not set to "Anyone".
function doGet() {
  return reply({ ok: true, sheet: SHEET_NAME, rows: Math.max(getSheet().getLastRow() - 1, 0) });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return reply({ ok: false, error: 'bad json' }); }
  if (!body || body.secret !== SECRET) return reply({ ok: false, error: 'unauthorized' });
  const row = body.row || {};
  if (!row.leadId) return reply({ ok: false, error: 'leadId required' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    upsert(row);
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}

function upsert(row) {
  const sheet = getSheet();
  const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().map(r => String(r[0]));
  const idx = ids.indexOf(String(row.leadId));
  const rowNum = idx === -1 ? sheet.getLastRow() + 1 : idx + 2;
  const current = idx === -1
    ? COLUMNS.map(() => '')
    : sheet.getRange(rowNum, 1, 1, COLUMNS.length).getValues()[0];

  const next = COLUMNS.map(([, key], i) => {
    const incoming = row[key];
    if (incoming === undefined || incoming === null || incoming === '') return current[i];
    if (WRITE_ONCE.indexOf(key) !== -1 && current[i] !== '') return current[i];
    if (key === 'status' && (STATUS_RANK[current[i]] || 0) > (STATUS_RANK[incoming] || 0)) return current[i];
    if (/At$/.test(key)) return new Date(incoming);
    // Keep phone numbers and ids as text so Sheets doesn't turn them into numbers.
    if (key === 'phone' || /Id$/.test(key)) return "'" + incoming;
    return incoming;
  });
  sheet.getRange(rowNum, 1, 1, COLUMNS.length).setValues([next]);
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS.map(c => c[0]));
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
  }
  return sheet;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
