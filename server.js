import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { createApp } from './lib/app.js';
import { createMailer } from './lib/mailer.js';
import { createRazorpay } from './lib/razorpay.js';
import { createRegistrationStore } from './lib/registrations.js';
import { createSheets } from './lib/sheets.js';

// Entry point for `npm start` and for Vercel, which imports the default export.
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* no .env file — use the real environment */ }
}

const env = process.env;
const razorpay = createRazorpay({ keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET });
// Vercel's filesystem is read-only apart from /tmp, which is per-instance and temporary.
const store = createRegistrationStore(env.DATA_DIR ? path.resolve(ROOT, env.DATA_DIR) : env.VERCEL ? '/tmp/data' : path.join(ROOT, 'data'));
const sheets = createSheets({ url: env.SHEETS_WEBHOOK_URL, secret: env.SHEETS_SECRET });
const mailer = createMailer({
  host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER, pass: env.SMTP_PASS,
  from: env.MAIL_FROM, replyTo: env.MAIL_REPLY_TO,
});
if (!razorpay.configured) console.warn('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set — checkout will be unavailable.');
if (!sheets.configured) console.warn('SHEETS_WEBHOOK_URL / SHEETS_SECRET are not set — leads will not be sent to Google Sheets.');
if (!mailer.configured) console.warn('SMTP_HOST / MAIL_FROM are not set — pass emails will not be sent.');

const app = express();
app.disable('x-powered-by');
app.use(createApp({ razorpay, store, sheets, mailer }));
export default app;

if (isMain) {
  const port = Number(env.PORT) || 3000;
  app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
}
