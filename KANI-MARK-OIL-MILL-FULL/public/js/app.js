const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const wrap = document.getElementById("products");

fetch("/api/products").then(r => r.json()).then(products => {
  wrap.innerHTML = products.map(p => `<article class="card"><div class="emoji">${esc(p.emoji)}</div><h3>${esc(p.name)}</h3><small>${esc(p.tamil)}</small><p>Traditional oil for everyday cooking and familiar South Indian flavours.</p><b>₹${p.price} / 1 L</b><br><br><button onclick="buy('${esc(p.id)}')">Buy Now</button></article>`).join("");
}).catch(() => { wrap.innerHTML = "<p>Could not load products. Please refresh the page.</p>"; });

function buy(id) {
  sessionStorage.setItem("km_cart", JSON.stringify({ productId: id, quantity: 1 }));
  window.location.href = "/checkout.html";
}
