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

### Vercel (current setup)

Live at https://minaraa-startuppark-landing.vercel.app, deployed automatically from `main` of `admaniacs/minaraa-startuppark-landing` (Vercel team *Admaniacs*, region `bom1`). `server.js` default-exports the Express app; `public/` is served from Vercel's CDN.

Environment variables (Project → Settings → Environment Variables): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `SHEETS_WEBHOOK_URL`, `SHEETS_SECRET`, `PRICE_PAISE`. After changing any of them, redeploy (Deployments → ⋯ → Redeploy).

- **Price:** `PRICE_PAISE` (129900 = ₹1,299). Set `100` for a ₹1 live test; values under 100 are ignored.
- **Webhook:** Razorpay (Live) → Webhooks → `https://minaraa-startuppark-landing.vercel.app/api/razorpay/webhook`, events `payment.captured` and `order.paid`.
- **Records:** Vercel's filesystem is temporary, so `data/registrations.jsonl` lives in `/tmp` and doesn't persist. The Google Sheet and the Razorpay Dashboard are the record of who paid. Moving the store to a database (Upstash Redis / Neon) would make it durable and also rule out a rare duplicate pass email if the webhook and the browser confirm on two instances at once.
- **Caching:** pages, CSS and JS revalidate on every visit; `/assets` are cached 30 days and `/fonts` one year (see `vercel.json`). Bump `?v=` on `styles.css` / `app.js` when they change, and give changed images a new file name.

### Any other Node host

Run `npm start` with the same variables. Set `DATA_DIR` to a persistent disk to keep the registrations log.

## Front-end notes

- Plain HTML/CSS/JS in `public/`, no build step. Fonts (Gloock, Poppins, Geist Mono) are self-hosted in `public/fonts`; images are WebP in `public/assets`. The old PNGs remain only for browsers holding an old cached page.
- Razorpay's `checkout.js` is loaded on demand when the visitor starts the form.
- The registration form opens on page load.
- Policy pages: `terms.html`, `privacy.html`, `refunds.html` (non-refundable, non-transferable; full refund only if the organiser cancels), `contact.html`, all naming iQue Startup Parks Private Limited.

## Troubleshooting

- **Leads not appearing in the Sheet:** open `SHEETS_WEBHOOK_URL` in a browser. It should show `{"ok":true,...}` (with the latest `integrations/google-sheets.gs`). A Google 404 means the URL is wrong or that deployment was removed: Deploy → Manage deployments, copy the current `/exec` URL into Vercel and redeploy. A sign-in page means access isn't set to **Anyone**. Errors show in Vercel → Logs as `sheets push … Sheet responded …`.
- **Pass email not arriving:** the Sheet's "Pass email" column shows `Sent` or the SMTP error.
- **"Payment blocked as website does not match":** the site's address must be approved in Razorpay → Account & Settings → Business website details.

## Not wired up yet

- **WhatsApp confirmations:** would need a WhatsApp Business API provider (for example Interakt, AiSensy or Gupshup). The page only promises email.
- **Sales cutoff:** checkout stays open after the session starts. Close it by removing the Register buttons, or add a server-side cutoff.
- **Copy to confirm** (from the design chat): the session agenda, the MINARAA intro and the Startup Park LinkedIn URL were written or guessed by the design assistant.
