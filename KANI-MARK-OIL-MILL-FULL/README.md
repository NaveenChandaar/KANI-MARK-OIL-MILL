# KANI MARK OIL MILL — Razorpay (Test Mode) v2

Prices (per 1 L): Coconut ₹440 · Groundnut ₹300 · Sesame ₹400 · Gingelly ₹400.
To change a price, edit the `PRODUCTS` list at the top of `server.js` (the only place prices live).

## Run
1. `npm install`
2. Copy `.env.example` to `.env` and fill in your Razorpay **TEST** Key ID and Secret. (No need to edit any HTML — the Key ID is served from `.env`.)
3. `npm start` → open http://localhost:5000

Test payment: card `4111 1111 1111 1111`, any future expiry, any CVV — or UPI `success@razorpay`.

## What's included
- Prices calculated on the server; the browser only sends product ID + quantity
- Customer name, email, mobile and delivery address validated and saved with each order in `data/orders.json`
- Payment signature verification (timing-safe) and orders marked `paid`
- Webhook `/api/webhook` so payments are recorded even if the customer closes the tab
- Failed/cancelled payment handling, rate limiting, security headers
- Owner order list: `curl -H "x-admin-token: YOUR_ADMIN_TOKEN" http://localhost:5000/api/admin/orders`

## Webhook setup (optional, recommended)
Razorpay Dashboard → Settings → Webhooks → add `https://YOUR-DOMAIN/api/webhook`, choose events `payment.captured`, `order.paid`, `payment.failed`, and set the same secret as `RAZORPAY_WEBHOOK_SECRET`. For local testing use a tunnel such as ngrok. Make sure payment auto-capture is on in your Razorpay settings.

## Before going live
Use HTTPS, switch to live keys in `.env`, move orders to a real database if volume grows, and set `TRUST_PROXY=true` if behind a proxy (so rate limiting sees real IPs).
