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

Confirmed registrations are appended to `data/registrations.jsonl`, one per order with no duplicates. The same details are on each order's notes in the Razorpay Dashboard.

## Deploying

Any Node host works (Render, Railway, a VPS behind nginx). Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and optionally `RAZORPAY_WEBHOOK_SECRET` and `DATA_DIR`. If the host's disk is ephemeral, point `DATA_DIR` at a persistent volume or rely on the Razorpay Dashboard. Use `rzp_test_` keys first, then switch to live keys after Razorpay activates the account.

## Not wired up yet

- **Emails / WhatsApp:** the page says "Instant confirmation by email & WhatsApp", but nothing sends them yet. Razorpay can email a payment receipt (Dashboard → Settings → Email notifications). A pass email would need a mail provider.
- **Copy to confirm** (carried over from the design chat): the session agenda, the MINARAA intro, the health-confirmation wording and the Startup Park LinkedIn URL were all written or guessed by the design assistant.
