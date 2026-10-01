const $ = id => document.getElementById(id);
let product = null, config = null;
const qty = () => Number($("qty").value) || 1;
const say = (msg, cls) => { $("status").textContent = msg; $("status").className = cls || ""; };

function render() {
  $("summary").innerHTML = "";
  const h = document.createElement("h3");
  h.textContent = `${product.emoji} ${product.name}`;
  const p = document.createElement("p");
  p.textContent = `${product.tamil} · ₹${product.price} per 1 L`;
  const t = document.createElement("h3");
  t.textContent = `Total: ₹${product.price * qty()}`;
  $("summary").append(h, p, t);
}

async function init() {
  try {
    const cart = JSON.parse(sessionStorage.getItem("km_cart") || "null");
    const [products, cfg] = await Promise.all([fetch("/api/products").then(r => r.json()), fetch("/api/config").then(r => r.json())]);
    config = cfg;
    product = cart && products.find(p => p.id === cart.productId);
    if (!product) { $("summary").innerHTML = "<p>No product selected. <a href='/'>Return home</a></p>"; return; }
    for (let i = 1; i <= 10; i++) $("qty").add(new Option(i, i));
    $("qty").value = Math.min(Math.max(parseInt(cart.quantity) || 1, 1), 10);
    $("qty").onchange = render;
    $("form").hidden = false;
    $("testbanner").hidden = cfg.mode !== "test";
    render();
  } catch (e) { say("Could not load checkout. Please refresh.", "err"); }
}

async function pay() {
  const customer = { name: $("name").value, email: $("email").value, mobile: $("mobile").value, address: $("address").value };
  if (typeof Razorpay === "undefined") return say("Payment system could not load. Check your internet and refresh.", "err");
  $("payBtn").disabled = true; say("Creating your order…");
  let data;
  try {
    const r = await fetch("/api/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id, quantity: qty(), customer }) });
    data = await r.json();
    if (!r.ok) { $("payBtn").disabled = false; return say(data.error || "Could not create order.", "err"); }
  } catch (e) { $("payBtn").disabled = false; return say("Network error. Please try again.", "err"); }

  const rzp = new Razorpay({
    key: config.keyId, amount: data.amount, currency: data.currency, name: "KANI MARK OIL MILL",
    description: `${product.name} × ${qty()} (1 L each)`, order_id: data.orderId,
    prefill: { name: customer.name, email: customer.email, contact: customer.mobile },
    theme: { color: "#3F5B32" },
    modal: { ondismiss: () => { $("payBtn").disabled = false; say("Payment cancelled. You can try again."); } },
    handler: async resp => {
      say("Verifying payment…");
      try {
        const vr = await fetch("/api/verify-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resp) });
        const res = await vr.json();
        if (!res.success) return say("Payment could not be verified. If money was deducted, contact us with Order ID " + data.orderId, "err");
        sessionStorage.removeItem("km_cart");
        $("form").hidden = true; $("testbanner").hidden = true;
        say(`✅ Payment successful! Order ID: ${res.order.orderId} · Payment ID: ${res.order.paymentId} · ₹${res.order.amount}. We will contact you on your mobile to arrange delivery.`, "ok");
      } catch (e) {
        say("We could not confirm your payment right now. If money was deducted, it will be reconciled automatically — note Order ID " + data.orderId + " and contact us.", "err");
      }
    }
  });
  rzp.on("payment.failed", r => { $("payBtn").disabled = false; say("Payment failed: " + ((r.error && r.error.description) || "please try again") + ". You can retry.", "err"); });
  rzp.open();
}
init();
