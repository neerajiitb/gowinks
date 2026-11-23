export function badges(p, esc) {
  if (!p.badges?.length) return "";
  return '<div class="shop-badges">' + p.badges.map(label => '<span>' + esc(label) + '</span>').join("") + '</div>';
}

let visitor, tab, routeKey, timer, revision = 0, last, context;
function browserId() {
  if (visitor) return visitor;
  const day = new Date().toISOString().slice(0,10);
  try {
    const previous = JSON.parse(localStorage.getItem("gw.visit"));
    if (previous?.day === day) visitor = previous.id;
  } catch {}
  if (!visitor) {
    visitor = crypto.randomUUID();
    try { localStorage.setItem("gw.visit", JSON.stringify({day,id:visitor})); } catch {}
  }
  return visitor;
}

function paint(data) {
  const node = document.querySelector("[data-live-note]");
  if (!node) return;
  const messages = [];
  if (data) {
    const count = node.dataset.liveNote === "product" ? data.looking : data.others;
    if (count > 0) {
      const people = count === 1 ? "other shopper" : "other shoppers";
      const place = node.dataset.liveNote === "product" ? "viewed this piece" :
        (data.local ? "in your region browsed Go Winks" : "browsed Go Winks");
      messages.push(`${count} ${people} ${place} in the past ${data.minutes} min`);
    }
    if (node.dataset.liveNote === "store" && data.visitors && count === 0)
      messages.push(`1 shopper active in the past ${data.minutes} min · you`);
    if (node.dataset.liveNote === "store" && data.recent > 0)
      messages.push(`${data.recent} paid ${data.recent === 1 ? "order" : "orders"} placed in the past ${data.orderMinutes} min`);
  }
  node.replaceChildren(...messages.map(text => {
    const item = document.createElement("span"); item.textContent = text; return item;
  }));
  node.hidden = !messages.length;
}

async function pulse() {
  clearTimeout(timer);
  if (!context || document.hidden) return;
  const version = ++revision;
  try {
    tab ||= crypto.randomUUID();
    const result = await context.api("/api/activity/pulse", {
      visitor: browserId(), tab, room:context.room, product:context.product,
    });
    if (version !== revision) return;
    last = result;
  } catch {
    if (version !== revision) return;
    last = null;
  }
  paint(last);
  if (!document.hidden) timer = setTimeout(pulse, 45000);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { revision++; clearTimeout(timer); }
  else pulse();
});

const whatsappIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M20.8 11.7a8.8 8.8 0 0 1-13 7.8L3 21l1.4-4.7a8.8 8.8 0 1 1 16.4-4.6Z"/><path fill="currentColor" stroke="none" d="M8.1 6.9c.3-.2.8-.2 1 .2l1 2c.1.3-.1.6-.6 1.2-.2.2-.2.3 0 .6.7 1.3 1.9 2.4 3.5 3 .3.1.4.1.6-.1l.9-1.1c.2-.2.4-.2.7-.1l1.9.9c.3.2.3.4.2.8-.2 1.4-1.5 2.2-2.8 1.9-3.4-.7-6.5-3.6-7.4-6.3-.3-1.1 0-2.3 1-3Z"/></svg>';
function support(cfg, page) {
  let a = document.querySelector("#wa-support");
  const show = cfg?.whatsapp && /^[1-9]\d{7,14}$/.test(cfg.phone) && page !== "manage";
  if (!show) { a?.remove(); return; }
  if (!a) {
    a = document.createElement("a"); a.id = "wa-support";
    a.target = "_blank"; a.rel = "noopener noreferrer"; a.setAttribute("aria-label","Chat with Go Winks support on WhatsApp");
    a.innerHTML = whatsappIcon + '<span>Chat with us</span>'; document.body.append(a);
  }
  a.href = "https://wa.me/" + cfg.phone + "?text=" + encodeURIComponent(cfg.greeting);
}

export function syncActivity(state, page, product, dark, api) {
  const cfg = state.activity;
  support(cfg,page);
  const room = page === "after-dark" ? "after-dark" : "boutique";
  const shopping = ["","shop","edit","product","gifting","offers","experiences","after-dark"].includes(page || "") &&
    (page !== "after-dark" || dark);
  const key = cfg && shopping && (cfg.visitors || cfg.viewers || (cfg.orders && !product)) ?
    JSON.stringify([page,room,product,cfg.visitors,cfg.regional,cfg.viewers,cfg.orders,cfg.minutes,cfg.orderMinutes]) : "";
  if (routeKey === key) { paint(last); return; }
  routeKey = key; revision++; clearTimeout(timer); last = null; paint(null);
  context = key ? {api,room,product} : null;
  if (context) pulse();
}
