require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Razorpay = require("razorpay");

const KEY_ID = (process.env.RAZORPAY_KEY_ID || "").trim();
const KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const WEBHOOK_SECRET = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || "").trim();
const PORT = process.env.PORT || 5000;
const DB = process.env.DATA_FILE || path.join(__dirname, "data", "orders.json");

if (!KEY_ID || !KEY_SECRET || KEY_ID.includes("YOUR") || KEY_SECRET.includes("YOUR")) {
  console.error("\n[!] Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env (copy .env.example) and restart.\n");
  process.exit(1);
}
const MODE = KEY_ID.startsWith("rzp_test_") ? "test" : "live";
const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });

// ---- Product catalogue: the ONLY source of prices (₹ per 1 L) ----
const PRODUCTS = [
  { id: "coconut",   name: "Coconut Oil",   tamil: "தேங்காய் எண்ணெய்", emoji: "🥥", price: 440 },
  { id: "groundnut", name: "Groundnut Oil", tamil: "கடலை எண்ணெய்",     emoji: "🥜", price: 300 },
  { id: "sesame",    name: "Sesame Oil",    tamil: "எள்ளெண்ணெய்",      emoji: "🌿", price: 400 },
  { id: "gingelly",  name: "Gingelly Oil",  tamil: "நல்லெண்ணெய்",      emoji: "🌾", price: 400 }
];
const MAX_QTY = 10;

// ---- Order store (JSON file, synchronous writes = no race conditions) ----
let orders = {};
try { orders = JSON.parse(fs.readFileSync(DB, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
function save() {
  fs.mkdirSync(path.dirname(DB), { recursive: true });
  fs.writeFileSync(DB + ".tmp", JSON.stringify(orders, null, 2));
  fs.renameSync(DB + ".tmp", DB);
}
function markPaid(id, paymentId, via) {
  const o = orders[id];
  if (!o) return null;
  if (o.status !== "paid") { Object.assign(o, { status: "paid", paymentId, paidVia: via, paidAt: new Date().toISOString() }); save(); }
  return o;
}
function markFailed(id, reason) {
  const o = orders[id];
  if (o && o.status === "created") { Object.assign(o, { status: "failed", failure: reason }); save(); }
}

// ---- Helpers ----
const sha = d => crypto.createHash("sha256").update(String(d)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const sigOk = (secret, data, sig) =>
  typeof sig === "string" && same(crypto.createHmac("sha256", secret).update(data).digest("hex"), sig);

function limiter(max, windowMs = 60000) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now(); let h = hits.get(req.ip);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(req.ip, h); }
    if (++h.n > max) return res.status(429).json({ error: "Too many requests. Please wait a minute." });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  };
}

function validateCustomer(c = {}) {
  const t = v => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B-\u001F]/g, "").trim() : "");
  const name = t(c.name).replace(/\s+/g, " ");
  const email = t(c.email).toLowerCase();
  let mobile = t(c.mobile).replace(/[\s\-()]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
  const address = t(c.address).replace(/[ \t]+/g, " ");
  if (name.length < 2 || name.length > 80) return { error: "Please enter your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) return { error: "Please enter a valid email." };
  if (!/^[6-9]\d{9}$/.test(mobile)) return { error: "Please enter a valid 10-digit mobile number." };
  if (address.length < 10 || address.length > 300) return { error: "Please enter your full delivery address." };
  return { value: { name, email, mobile, address } };
}

// ---- App ----
const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : process.env.TRUST_PROXY);
app.use((req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin" });
  next();
});

// Webhook needs the RAW body for signature checking, so it is registered before express.json()
app.post("/api/webhook", express.raw({ type: "application/json", limit: "1mb" }), (req, res) => {
  if (!WEBHOOK_SECRET) return res.status(503).json({ error: "Webhook not configured" });
  if (!Buffer.isBuffer(req.body) || !sigOk(WEBHOOK_SECRET, req.body, req.get("x-razorpay-signature")))
    return res.status(400).json({ error: "Invalid signature" });
  try {
    const ev = JSON.parse(req.body.toString("utf8"));
    const p = ev.payload && ev.payload.payment && ev.payload.payment.entity;
    const order = p && orders[p.order_id];
    if (!order) { console.warn("Webhook for unknown order:", ev.event, p && p.order_id); return res.json({ received: true }); }
    if (ev.event === "payment.captured" || ev.event === "order.paid") {
      if (p.amount !== order.amountPaise) console.error("AMOUNT MISMATCH", order.orderId, p.amount, order.amountPaise);
      else markPaid(order.orderId, p.id, "webhook");
    } else if (ev.event === "payment.failed") {
      markFailed(order.orderId, p.error_description || "Payment failed");
    }
    res.json({ received: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Webhook error" }); }
});

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/products", (req, res) => res.json(PRODUCTS));
app.get("/api/config", (req, res) => res.json({ keyId: KEY_ID, mode: MODE }));

app.post("/api/create-order", limiter(20), async (req, res) => {
  const { productId, quantity = 1, customer } = req.body || {};
  const product = PRODUCTS.find(p => p.id === productId);
  const qty = Number(quantity);
  if (!product) return res.status(400).json({ error: "Unknown product." });
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return res.status(400).json({ error: `Quantity must be 1 to ${MAX_QTY}.` });
  const c = validateCustomer(customer);
  if (c.error) return res.status(400).json({ error: c.error });

  const amountRupees = product.price * qty;           // price comes from the server, never the browser
  const receipt = "KM" + Date.now() + crypto.randomBytes(2).toString("hex");
  try {
    const o = await razorpay.orders.create({
      amount: amountRupees * 100, currency: "INR", receipt,
      notes: { business: "KANI MARK OIL MILL", product: product.name, quantity: String(qty) }
    });
    orders[o.id] = {
      orderId: o.id, receipt, productId: product.id, productName: product.name, unitPrice: product.price,
      quantity: qty, amountRupees, amountPaise: o.amount, currency: "INR", customer: c.value,
      status: "created", createdAt: new Date().toISOString()
    };
    save();
    res.json({ orderId: o.id, amount: o.amount, currency: o.currency });
  } catch (e) {
    console.error("Razorpay order error:", (e && e.error) || e);
    res.status(500).json({ error: "Could not start payment. Please try again." });
  }
});

app.post("/api/verify-payment", (req, res) => {
  const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = req.body || {};
  if (![oid, pid, sig].every(v => typeof v === "string" && v)) return res.status(400).json({ success: false, error: "Missing payment details" });
  if (!orders[oid]) return res.status(404).json({ success: false, error: "Order not found" });
  if (!sigOk(KEY_SECRET, oid + "|" + pid, sig)) return res.status(400).json({ success: false, error: "Invalid signature" });
  const o = markPaid(oid, pid, "checkout");
  res.json({ success: true, order: { orderId: o.orderId, product: o.productName, quantity: o.quantity, amount: o.amountRupees, paymentId: o.paymentId } });
});

// Order list for the shop owner:  curl -H "x-admin-token: <ADMIN_TOKEN>" http://localhost:5000/api/admin/orders
app.get("/api/admin/orders", limiter(30), (req, res) => {
  if (!ADMIN_TOKEN) return res.status(404).json({ error: "Not found" });
  if (!same(req.get("x-admin-token") || "", ADMIN_TOKEN)) return res.status(401).json({ error: "Unauthorized" });
  res.json(Object.values(orders).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));
app.get("*", (req, res) =>
  path.extname(req.path) ? res.status(404).end() : res.sendFile(path.join(__dirname, "public", "index.html")));
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON" });
  console.error(err); res.status(500).json({ error: "Something went wrong" });
});

app.listen(PORT, () => {
  console.log(`KANI MARK OIL MILL running at http://localhost:${PORT}  [Razorpay ${MODE.toUpperCase()} mode]`);
  if (!WEBHOOK_SECRET) console.log("Note: RAZORPAY_WEBHOOK_SECRET not set - webhook disabled.");
  if (!ADMIN_TOKEN) console.log("Note: ADMIN_TOKEN not set - admin order list disabled.");
});
