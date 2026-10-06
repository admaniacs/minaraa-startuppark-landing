# Founders, Reset Your Energy — MINARAA × Startup Park

Landing page for the 10 October wellness session at iQue Startup Park, Bengaluru. It has a registration form and Razorpay checkout.
It's built from the Claude Design handoff in `project/` (`Event Landing v2.dc.html`, Arch hero). See `project/HANDOFF.md` and `chats/`.

## Run it

```bash
npm install
cp .env.example .env   # add your Razorpay keys
npm start              # http://localhost:3000
npm test               # server tests (Razorpay API is mocked)
```

Needs Node 20.12+. The page is static (`public/`); the Node server serves it and the three payment endpoints. Without keys the page still loads, but "Pay" shows "Payments are not configured yet".

## How payment works

1. **Details form** is validated in the browser and again on the server. It collects name, email, +91 mobile, company, role, 1–4 passes and the cold-plunge health confirmation.
2. **`POST /api/orders`**: the server sets the price (₹1,299 × passes, GST inclusive) and ignores any amount the browser sends. It creates a Razorpay Order with the attendee's details in `notes`, plus a booking ID (`MNR-1010-XXXXXX`).
3. **Razorpay Checkout** opens with name, email and phone prefilled. The UPI / Card / Net banking / Wallets tab picked on the page is preselected. Card and bank details are entered only in Razorpay's window, never on this site.
4. **`POST /api/payments/verify`** checks the `razorpay_signature` HMAC, confirms the payment is captured or authorized for that order, and records the registration. It returns the pass with a QR code of the booking ID.
5. **`POST /api/razorpay/webhook`** (optional, recommended) records the registration even if the buyer closes the tab before step 4. Add it in Razorpay Dashboard → Webhooks with the events `payment.captured` and `order.paid`, and put the secret in `RAZORPAY_WEBHOOK_SECRET`.

After a confirmed payment the buyer is **emailed their pass**: the same blue pass as on the page, with a QR code of the booking ID and a calendar (.ics) attachment. It's sent once per order, whichever of steps 4 and 5 happens first.

Confirmed registrations are appended to `data/registrations.jsonl`, one per order with no duplicates. The same details are on each order's notes in the Razorpay Dashboard.

## Pass email

Set the `SMTP_*` and `MAIL_FROM` variables (see `.env.example` for Gmail, Zoho, Brevo and SES settings). For Gmail, use an App Password, not your normal password. If the variables are missing, payments still work. The confirmation screen then asks the buyer to save the pass, and the sheet shows "Not configured" in the Pass email column.

Send from an address on your own domain, with the provider's SPF/DKIM set up, so passes don't land in spam.

## Leads in Google Sheets

Every visitor who completes the details step becomes a row in the sheet, even if they never pay. Each row's Status moves **Lead → Checkout started → Paid**. Paid rows also get the booking ID, Razorpay order and payment IDs, the payment method, and whether the pass email was sent.

1. Create a Google Sheet → Extensions → Apps Script, and paste in `integrations/google-sheets.gs`.
2. Change `SECRET` in the script to a long random string.
3. Deploy → New deployment → Web app, with Execute as **Me** and access set to **Anyone**. Copy the `/exec` URL.
4. Set `SHEETS_WEBHOOK_URL` (the URL) and `SHEETS_SECRET` (the same string) on the server, then restart it.

Writes to the sheet happen in the background, so a slow or unreachable sheet never blocks registration or payment; failures are logged. `data/registrations.jsonl` and the Razorpay Dashboard remain the record of who paid.

## Deploying

### Vercel

`server.js` default-exports the Express app, so Vercel's Express support runs it as one function, and `public/` is served from Vercel's CDN. Import the GitHub repo in Vercel (framework preset: Express; no build command) and add the environment variables from `.env.example` under Project → Settings → Environment Variables.

On Vercel the filesystem is temporary, so `data/registrations.jsonl` (written to `/tmp`) doesn't persist between requests. Use the Google Sheet and the Razorpay Dashboard as the record of who paid. Each instance deduplicates the pass email on its own, so if the webhook and the browser confirmation hit two different instances at the same moment, a buyer can rarely get two copies. Moving the registration store to a database (such as Upstash Redis or Neon from the Vercel Marketplace) removes both caveats.

### Any other Node host

Render, Railway, a VPS behind nginx: run `npm start` with the same variables. Set `DATA_DIR` to a persistent disk to keep the registrations log.

Use `rzp_test_` keys first, then switch to live keys after Razorpay activates the account. Then point the Razorpay webhook at `https://<your-domain>/api/razorpay/webhook`.

## Not wired up yet

- **WhatsApp:** the page says "Instant confirmation by email & WhatsApp". Email is done; WhatsApp would need a WhatsApp Business API provider (for example Interakt, AiSensy or Gupshup).
- **Copy to confirm** (carried over from the design chat): the session agenda, the MINARAA intro, the health-confirmation wording and the Startup Park LinkedIn URL were all written or guessed by the design assistant.
