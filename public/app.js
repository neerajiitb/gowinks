import { mountConnect, stopConnect } from "./connect.js";
import { badges, syncActivity } from "./shop-activity.js";
import { createShopMotion } from "./motion.js";
import { darkToken, darkProduct, mountDark, inDark, leaveDark, stopDarkFilms } from "./after-dark.js";
import { mountExperiences } from "./experiences.js";
import { activityCheckout, activityGift, ownedPassInfo, receivedPassCard } from "./activity-passes.js";
import { watchShop, mountReels } from "./reels.js";
import { settings as defaults } from "./catalog.js";
import { icon } from "./icons.js";
import { manage } from "./manage.js";
import { renderInvitations } from "./invitations.js";
const $ = (s) => document.querySelector(s);
export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (v) => "₹" + Number(v).toLocaleString("en-IN");
const read = (key, def) => {
  try {
    return JSON.parse(localStorage.getItem("gw." + key)) ?? def;
  } catch {
    return def;
  }
};
const save = (key, obj) =>
  localStorage.setItem("gw." + key, JSON.stringify(obj));
let state = {
    settings: defaults,
    products: [],
    user: null,
    hosted: false,
    paymentsReady: false,
  },
  bag = read("bag", {}),
  guestWishlist = read("wishlist", []),
  coupon = read("coupon", ""),
  giftNote = read("note", ""),
  quantity = 1,
  accountTab = "profile",
  filters = { sort: "featured", range: "all", stock: false },
  adminTab = "products",
  returnAfterAuth = "",
  loadFailed = false;
const cats = () => state.settings.categories,
  product = (id) => state.products.find((p) => p.id === id) || (inDark() && darkProduct(id)),
  category = (id) => cats().find((c) => c.id === id),
  wishlist = () => (state.user ? state.user.wishlist || [] : guestWishlist),
  bagCount = () =>
    Object.entries(bag).reduce((n, [id, q]) => n + (product(id) ? q : 0), 0);
export async function api(url, data, access = inDark() ? darkToken() : "") {
  const res = await fetch(url, {
    method: data === undefined ? "GET" : "POST",
    headers: { ...(data === undefined ? {} : { "content-type": "application/json" }),
      ...(access ? { "x-gw-after-dark": access } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  let result;
  try {
    result = await res.json();
  } catch {
    throw Error("The store is temporarily unavailable.");
  }
  if (!res.ok) throw Error(result.error || "Request could not be completed.");
  return result;
}
async function refresh() {
  const data = await api("/api/store");
  state = data;
  loadFailed = false;
  header();
  footer();
}
let timer;
function toast(msg) {
  $("#toast").textContent = msg;
  $("#toast").classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(() => $("#toast").classList.remove("show"), 2600);
}
const link = (route, text, cls = "") =>
  `<a class="${cls}" href="#${esc(route)}">${text}</a>`;
const brand = () =>
  link(
    "/",
    '<img class="gw-sigil" src="/monogram.svg" alt=""><img class="gw-wordmark" src="/wordmark.svg" alt="Go Winks">',
    "gw-brand",
  );
const hash = () => location.hash.slice(1) || "/",
  goto = (r) => {
    close();
    if (hash() === r) render();
    else location.hash = r;
  };
const toolButton = (act, label, glyph, extra = "") =>
  `<button type="button" class="shop-tool" data-act="${act}" aria-label="${esc(label)}"><span class="tool-icon">${icon(glyph)}${extra}</span><span>${esc(label)}</span></button>`;
const editList = () => state.settings.edits || [];
const groupLinks = (c) =>
  state.products
    .filter((p) => p.category === c.id)
    .slice(0, 5)
    .map((p) => link("/product/" + p.id, esc(p.name)))
    .join("");
const experiencePages = ["experiences", "invite", "invites", "activity-gift", "activity-checkout"];
function moduleNav(page) {
  const current = experiencePages.includes(page) ? "experiences" :
    ["manage", "account"].includes(page) ? null : page === "connect" ? "connect" : "shop";
  const destinations = [
    ["shop", "/", "Shop", "gift"],
    ["experiences", "/experiences", "Experiences", "spark"],
    ["connect", "/connect", "Winks Connect", "heart"],
  ];
  return '<nav class="module-nav" aria-label="Go Winks destinations">' +
    destinations.map(([id, route, label, glyph]) =>
      `<a href="#${route}"${id === current ? ' aria-current="location"' : ""}>${icon(glyph)}${label}</a>`
    ).join("") + '</nav>';
}
function header() {
  const n = bagCount(),
    badge = n ? '<span class="cart-dot">' + n + "</span>" : "";

  document.body.classList.toggle("ad-mode", inDark());
  document.querySelector('meta[name="theme-color"]').content = inDark() ? "#35104b" : "#5d385a";
  const page = hash().split("?")[0].split("/")[1];
  if (inDark()) {
    $("#header").innerHTML = moduleNav(page) + `<nav class="ad-bar" aria-label="After Dark navigation"><a class="ad-brand" href="#/after-dark"><img src="/monogram.svg" alt="">Go Winks</a><a class="ad-normal" href="#/">☀ Normal mode</a>${darkToken() ? '<button data-act="bag">Bag (' + n + ')</button>' : ''}</nav>`;
    return;
  }
  const menu = (label, route, items, img) =>
    `<div class="nav-group">${link(route, esc(label), "nav-parent")}<div class="nav-panel"><div><strong>${esc(label)}</strong>${items}${link(route, "Shop all", "panel-all")}</div><img src="${esc(img)}" alt=""></div></div>`;
  $("#header").innerHTML =
    '<div class="destination-bar">' + moduleNav(page) + `<a class="ad-entry" href="#/after-dark">☾ After Dark <span>18+</span></a></div><div class="shop-mast">${brand()}<div class="quick-search"><form id="mast-search"><button aria-label="Submit search">${icon("search")}</button><input type="search" id="mast-query" placeholder="Search for chocolates, gifts..." aria-label="Search the boutique" autocomplete="off"></form><div class="suggestions" id="mast-results" hidden></div></div><div class="shop-tools">${toolButton("recent", "Recently viewed", "clock")}${toolButton("orders", "My orders", "order")}${toolButton("gift", "Gifting guide", "gift")}${toolButton("wishlist", "Wishlist", "heart")}${toolButton("bag", "Cart", "bag", badge)}${toolButton("account", "Profile", "user")}${toolButton("menu", "More", "more")}</div><div class="phone-actions">${toolButton("search", "Search", "search")}${toolButton("wishlist", "Wishlist", "heart")}</div></div>
 <nav class="shop-nav" aria-label="Shop categories"><div class="nav-in"><a class="nav-monogram" href="#/" aria-label="Go Winks home"><img src="/monogram.svg" alt=""></a>${menu(
   "All Products",
   "/shop",
   cats()
     .map((c) => link("/shop/" + c.id, esc(c.name)))
     .join(""),
   state.settings.heroImage,
 )}${cats()
   .map((c) => menu(c.name, "/shop/" + c.id, groupLinks(c), c.image))
   .join("")}<div class="nav-right">${link("/experiences", "GoWinks Experience", "nav-parent")}${menu(
   "Gifts",
   "/gifting",
   editList()
     .map((e) => link("/edit/" + e.id, esc(e.name)))
     .join(""),
   editList()[1]?.image || state.settings.heroImage,
 )}${link("/offers", "Offers", "nav-parent")}</div></div></nav>`;
  let dock = $("#mobile-dock");
  if (!dock) {
    dock = document.createElement("nav");
    dock.id = "mobile-dock";
    dock.setAttribute("aria-label", "Mobile shop navigation");
    document.body.append(dock);
  }
  dock.innerHTML = `<button class="dock-emblem" data-act="dock" aria-label="Open shopping menu"><img src="/monogram.svg" alt=""></button><div class="dock-tools">${toolButton("menu", "More", "menu")}${toolButton("search", "Search", "search")}${toolButton("bag", "Cart", "bag", badge)}${toolButton("account", "Profile", "user")}</div>`;
  updateChrome();
}
function footer() {
  $("#footer").innerHTML =
    `<div class="retail-foot"><div><h4>ABOUT GO WINKS</h4>${link("/connect","Winks Connect")}${link("/experiences", "GoWinks Experience")}${link("/info/story", "Our story")}${link("/info/contact", "Contact us")}${link("/manage", "Store management")}</div><div><h4>CUSTOMER CARE</h4><button data-act="orders">My orders</button><button data-act="account">My account</button>${link("/info/shipping", "Shipping & delivery")}</div><div><h4>SHOP WITH CONFIDENCE</h4>${link("/info/returns", "Returns & exchanges")}${link("/offers", "Offers")}${link("/gifting", "Gifting guide")}</div><div><h4>SHOP BY CATEGORY</h4>${cats()
      .map((c) => link("/shop/" + c.id, esc(c.name)))
      .join(
        "",
      )}</div></div><div class="retail-credit">${brand()}<em class="garden-signoff">For every way you love.</em><span>© Go Winks · India · INR</span></div>`;
}

function open(title, body) {
  const d = $("#dialog");
  $("#dialog-title").textContent = title;
  $("#dialog-body").innerHTML = body;
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}
function close() {
  if ($("#dialog").open) $("#dialog").close();
}
$("#dialog .close").onclick = close;
$("#dialog").addEventListener("click", (e) => {
  if (
    e.target === $("#dialog") &&
    e.clientX < $("#dialog").getBoundingClientRect().left
  )
    close();
});

function gardenHero(s) {
  return `<section class="garden-hero" aria-labelledby="garden-title">
    <img class="garden-art" src="${esc(s.gardenImage)}" alt="" fetchpriority="high" width="1536" height="1024">
    <div class="garden-copy"><p class="garden-label">The couples’ boutique</p>
      <h1 id="garden-title">${esc(s.gardenHeadline)} <em>${esc(s.gardenScript)}</em></h1>
      <p class="garden-tagline">${esc(s.gardenTagline)}</p>
      <div class="garden-actions">${link(s.heroLink || "/gifting", "Shop the gift edit", "garden-shop")}${link("/experiences", "Explore experiences", "garden-explore")}</div>
    </div>
  </section>`;
}
function campaignFilm() {
  const s = state.settings;
  return `<section class="film" aria-label="Go Winks romantic gift collection"><a href="#${esc(s.heroLink || "/gifting")}" aria-label="Shop the romantic gift collection">${s.heroVideo ? `<video playsinline loop muted preload="metadata" poster="${esc(s.heroImage)}" aria-label="Go Winks chocolates and gifts on red satin"><source src="${esc(s.heroVideo)}" type="video/mp4"></video>` : `<img src="${esc(s.heroImage)}" alt="Go Winks gift collection">`}</a>${s.heroVideo ? `<button class="film-control" data-act="film" aria-label="Pause campaign film">${icon("pause")}</button>` : ""}</section>`;
}
const head = (sub, title, route, label) =>
  `<div class="section-head"><h2>${title}</h2>${route ? link(route, label, "text-link") : ""}</div>`;
const tile = (route, name, image) =>
  `<a class="retail-tile" href="#${esc(route)}"><img loading="lazy" src="${esc(image)}" alt=""><span>${esc(name)}</span></a>`;
const catCard = (c) => tile("/shop/" + c.id, c.name, c.image);
const card = (p) =>
  `<article class="product"><a class="pimage" href="#/product/${esc(p.id)}"><img loading="lazy" src="${esc(p.image)}" alt="${esc(p.name)}"><span class="card-view">VIEW DETAILS</span></a><button class="heart-btn ${wishlist().includes(p.id) ? "selected" : ""}" data-heart="${esc(p.id)}" aria-pressed="${wishlist().includes(p.id)}" aria-label="Save ${esc(p.name)}">${icon("heart")}</button>${badges(p, esc)}<h3>${link("/product/" + p.id, esc(p.name))}</h3><div class="price">${fmt(p.price)}</div></article>`;
const crumbs = (label) =>
  `<div class="crumb">${link("/", "Home")} &nbsp;/&nbsp; ${esc(label)}</div>`;
const intro = (sub, t, p = "") =>
  `<div class="intro"><h1>${esc(t)}</h1>${p ? "<p>" + esc(p) + "</p>" : ""}</div>`;
const empty = (t, p) =>
  `<div class="empty"><h3>${esc(t)}</h3><p>${esc(p)}</p>${link("/shop", "Explore the boutique", "btn")}</div>`;
let recFilter = "",
  recStock = false,
  recSort = "featured",
  campaignIndex = 0,
  deckTimer = 0,
  filmPaused = false;
function recommendations() {
  let list = state.products.filter(
    (p) =>
      (!recFilter || p.category === recFilter) &&
      (!recStock || p.available > 0),
  );
  if (recSort === "low") list.sort((a, b) => a.price - b.price);
  if (recSort === "high") list.sort((a, b) => b.price - a.price);
  return `<h2>Recommended for you</h2><div class="rec-tools"><button class="rec-filter" data-act="rec-filter" aria-label="Filter recommended products">${icon("filter")}</button><div class="rec-scroll"><button class="${recFilter ? "" : "chosen"}" data-rec="">All</button>${cats()
    .map(
      (c) =>
        `<button data-rec="${esc(c.id)}" class="${c.id === recFilter ? "chosen" : ""}"><img src="${esc(c.image)}" alt="">${esc(c.short || c.name)}</button>`,
    )
    .join(
      "",
    )}</div></div><div class="product-grid">${list.map(card).join("") || "<p>No matching products.</p>"}</div>`;
}
function home() {
  const s = state.settings,
    edits = editList(),
    tiles = [
      ...cats().map(catCard),
      ...edits.map((e) => tile("/edit/" + e.id, e.name, e.image)),
    ];
  const picks = edits.length
    ? edits.map((e) => ({ r: "/edit/" + e.id, n: e.name, i: e.image }))
    : cats().map((c) => ({ r: "/shop/" + c.id, n: c.name, i: c.image }));
  return (
    '<div class="shop-live" data-live-note="store" hidden></div>' + gardenHero(s) +
    `<section class="category-stage"><h2>Shop by category</h2><div class="mosaic">${tiles.join("")}</div></section>
 ${watchShop(s, state.products, esc)}
 ${campaignFilm()}
 ${s.heroSlides.length ? `<section class="campaign-rail" aria-label="Featured campaigns"><div class="campaign-track">${s.heroSlides.map((h, i) => `<a class="campaign-panel" href="#/shop/${esc(h.category)}" aria-label="${esc(h.cta)}"><img src="${esc(h.image)}" alt="" loading="lazy"><div class="campaign-copy"><small>${esc(h.eyebrow)}</small><h2>${esc(h.headline)} <i>${esc(h.italic)}</i></h2><span>${esc(h.cta)}</span></div></a>`).join("")}</div><button class="deck-prev" data-deck="-1" aria-label="Previous campaign">${icon("left")}</button><button class="deck-next" data-deck="1" aria-label="Next campaign">${icon("right")}</button></section>` : ""}
 <a class="wc-home" href="#/connect"><img src="/images/winks-connect.webp" alt="" loading="lazy"><div><span>Winks Connect</span><h2>Meet your people.</h2><p>Explore social events in your city <b aria-hidden="true">↗</b></p></div></a><section class="picked" id="picked"><h2>Handpicked For You</h2><div class="pick-grid">${picks
   .slice(0, 4)
   .map((v) => tile(v.r, v.n, v.i))
   .join(
     "",
   )}</div><div class="marquee" aria-label="More collections"><div class="marquee-track">${[0, 1].map((_, i) => `<div class="marquee-group" ${i ? 'aria-hidden="true" inert' : ""}>${picks.map((v) => tile(v.r, v.n, v.i)).join("")}</div>`).join("")}</div></div></section><section class="recommend" id="recommend">${recommendations()}</section>`
  );
}
function setCampaign(index) {
  const rail = $(".campaign-track");
  if (!rail || !rail.children.length) return;
  campaignIndex = (index + rail.children.length) % rail.children.length;
  rail.style.transform = "translateX(-" + 100 * campaignIndex + "%)";
  [...rail.children].forEach((el, i) => (el.inert = i !== campaignIndex));
}
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const motion = createShopMotion(reduced);
function syncFilm() {
  const film = $(".film video"),
    control = $(".film-control");
  if (!film || !control) return;
  const play = !filmPaused && !reduced.matches && !document.hidden;
  if (play)
    film.play().catch(() => {
      if (film.isConnected) {
        control.innerHTML = icon("play");
        control.setAttribute("aria-label", "Play campaign film");
      }
    });
  else film.pause();
  control.innerHTML = icon(play ? "pause" : "play");
  control.setAttribute(
    "aria-label",
    play ? "Pause campaign film" : "Play campaign film",
  );
}
let unmountReels;
function syncHome() {
  unmountReels?.();
  unmountReels = mountReels($(".watch-shop"), reduced);
  clearInterval(deckTimer);
  const film = $(".film video");
  if (film) syncFilm();
  if ($(".campaign-track")) {
    setCampaign(campaignIndex);
    if (!reduced.matches)
      deckTimer = setInterval(() => {
        if (
          !document.hidden &&
          !$("#dialog").open &&
          !$(".campaign-rail")?.matches(":hover,:focus-within")
        )
          setCampaign(campaignIndex + 1);
      }, 3500);
  }
  updateChrome();
}
let lastY = 0,
  scrollFrame = 0;
function updateChrome() {
  const head = $("#header"),
    dock = $("#mobile-dock");
  if (!head) return;
  const y = window.scrollY;
  head.classList.toggle("scrolled", y > 68);
  head.classList.toggle("reveal", y > 68 && y < lastY);
  lastY = y;
  if (!dock) return;
  const hand = $("#picked"),
    rec = $("#recommend");
  let mode =
    hand && hand.getBoundingClientRect().top <= innerHeight
      ? "compact"
      : "expanded";
  if (rec && rec.getBoundingClientRect().top <= innerHeight) mode = "bar";
  if (
    mode === "compact" &&
    dock.dataset.mode === "expanded" &&
    window.innerWidth < 970 &&
    !reduced.matches &&
    typeof Element.prototype.animate === "function"
  ) {
    const origin = head.querySelector(".gw-sigil").getBoundingClientRect(),
      size = 52;
    const logo = document.createElement("img");
    logo.src = "/monogram.svg";
    logo.alt = "";
    logo.className = "flying-sigil";
    document.body.append(logo);
    const startX = origin.left,
      startY = Math.max(-size, origin.top),
      endX = innerWidth - 44 - size / 2,
      endY = innerHeight - 44 - size / 2;
    const flight = logo.animate(
      [
        {
          transform: `translate(${startX}px,${startY}px) scale(.65)`,
          opacity: 0.85,
        },
        {
          transform: `translate(${startX + (endX - startX) * 0.75}px,${startY + (endY - startY) * 0.42}px) scale(1.05)`,
          opacity: 1,
          offset: 0.55,
        },
        { transform: `translate(${endX}px,${endY}px) scale(1)`, opacity: 1 },
      ],
      { duration: 1400, easing: "cubic-bezier(.06,.82,.14,1)" },
    );
    flight.finished.catch(() => {}).finally(() => logo.remove());
  }
  dock.dataset.mode = mode;
  if (mode !== "compact") dock.classList.remove("opened");
}
window.addEventListener(
  "scroll",
  () => {
    if (!scrollFrame)
      scrollFrame = requestAnimationFrame(() => {
        updateChrome();
        scrollFrame = 0;
      });
  },
  { passive: true },
);
reduced.addEventListener("change", syncHome);
document.addEventListener("visibilitychange", syncFilm);

function shop(route) {
  const c = category(route[2]),
    query = new URLSearchParams(hash().split("?")[1]).get("q") || "";
  const source = state.products.filter(
    (p) =>
      (!c || p.category === c.id) &&
      (!query ||
        (p.name + " " + p.detail + " " + category(p.category)?.name)
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const matches = source.filter(
    (p) =>
      (!filters.stock || p.available > 0) &&
      (filters.range === "all" ||
        (filters.range === "under" ? p.price < 1500 : p.price >= 1500)),
  );
  if (filters.sort === "low") matches.sort((a, b) => a.price - b.price);
  if (filters.sort === "high") matches.sort((a, b) => b.price - a.price);
  if (filters.sort === "name")
    matches.sort((a, b) => a.name.localeCompare(b.name));
  const title = query
    ? "Results for “" + query + "”"
    : c?.name || "All products";
  const options = (key, text) =>
    `<option value="${key}" ${filters.sort === key ? "selected" : ""}>${text}</option>`;
  const ranges = [
    ["all", "All prices", source.length],
    ["under", "Below ₹1,500", source.filter((p) => p.price < 1500).length],
    ["over", "₹1,500 and above", source.filter((p) => p.price >= 1500).length],
  ];
  return `<section class="plp">${crumbs(c?.name || "All products")}<a class="plp-banner" href="#/gifting"><img src="${esc(state.settings.heroImage)}" alt=""><span>The Romantic Gift Edit</span><b>SHOP NOW</b></a><div class="plp-title"><h1>${esc(title)}</h1><span>${matches.length} products</span></div><div class="plp-tools"><button data-plp-stock="all" class="${!filters.stock ? "active" : ""}">ALL</button><button data-plp-stock="in" class="${filters.stock ? "active" : ""}">IN STOCK</button><button data-act="listing-filters" class="plp-mobile-filter">${icon("filter")} FILTERS</button><select aria-label="Sort by" id="sort">${options("featured", "POPULAR")}${options("low", "PRICE: LOW TO HIGH")}${options("high", "PRICE: HIGH TO LOW")}${options("name", "NAME: A TO Z")}</select></div><div class="filter-chips"><span>FILTERED BY</span>${c ? link("/shop", esc(c.name) + " &nbsp; ×") : "<b>All products</b>"}${filters.range !== "all" ? '<button data-plp-range="all">' + (filters.range === "under" ? "Below ₹1,500" : "₹1,500 and above") + " &nbsp; ×</button>" : ""}${filters.stock ? '<button data-plp-stock="all">In stock &nbsp; ×</button>' : ""}</div><div class="plp-body"><aside class="plp-side"><h2>FILTERS</h2><section><h3>Price</h3>${ranges.map(([k, l, n]) => `<button class="filter-check ${filters.range === k ? "checked" : ""}" data-plp-range="${k}">${esc(l)} (${n})</button>`).join("")}</section><section><h3>Category</h3>${cats()
    .map((cat) =>
      link(
        "/shop/" + cat.id,
        esc(cat.name) +
          " (" +
          state.products.filter((p) => p.category === cat.id).length +
          ")",
        "filter-check " + (cat.id === c?.id ? "checked" : ""),
      ),
    )
    .join(
      "",
    )}</section></aside><div class="plp-products">${matches.map(card).join("") || empty("No matching products", "Try another collection or price range.")}</div></div></section>`;
}
const stepper = (id, n) =>
  `<div class="quantity"><button data-step="-1" data-id="${esc(id)}" aria-label="Decrease quantity">−</button><b>${n}</b><button data-step="1" data-id="${esc(id)}" aria-label="Increase quantity">+</button></div>`;
let galleryIndex = 0;
function detail(id) {
  const p = product(id);
  if (!p)
    return (
      '<div class="inside">' +
      empty("Product unavailable", "Explore the rest of the collection.") +
      "</div>"
    );
  const c = category(p.category),
    context = editList().find((e) => e.items.includes(id)),
    gallery = [
      { src: p.image, label: "Product image" },
      { src: p.image, label: "Close-up", zoom: true },
      ...(context
        ? [{ src: context.image, label: context.name + " collection" }]
        : []),
    ],
    g = gallery[galleryIndex] || gallery[0];
  return `<div class="pdp">${crumbs((c?.name || "Products") + " / " + p.name)}<div class="pdp-body"><div class="pdp-gallery"><div class="pd-main ${g.zoom ? "zoomed" : ""}"><img src="${esc(g.src)}" alt="${esc(p.name + " · " + g.label)}"><button class="heart-btn ${wishlist().includes(id) ? "selected" : ""}" data-heart="${esc(id)}" aria-pressed="${wishlist().includes(id)}" aria-label="Save ${esc(p.name)}">${icon("heart")}</button></div><div class="thumbs">${gallery.map((v, i) => `<button data-gallery="${i}" class="${i === galleryIndex ? "chosen" : ""} ${v.zoom ? "zoomed" : ""}" aria-label="${esc(v.label)}" aria-pressed="${i === galleryIndex}"><img src="${esc(v.src)}" alt=""></button>`).join("")}</div></div><div class="pdp-info"><h1>${esc(p.name)}</h1>${badges(p,esc)}<div class="shop-live" data-live-note="product" hidden></div><p>From ${link("/shop/" + p.category, esc(c?.name || "Go Winks"))}</p><div class="pd-prices"><div><strong>${fmt(p.price)}</strong><small>MRP inclusive of all taxes</small></div><div><b>${p.available ? "In stock" : "Sold out"}</b><small>${esc(c?.short || "Go Winks")}</small></div></div><div class="delivery-panel"><b>${icon("truck")} Delivery information</b><p>${esc(state.settings.announcement)}</p><details><summary>Shipping & packaging</summary><p>${esc(state.settings.shipping)}</p></details></div><p class="pd-description">${esc(p.detail)}</p><details class="pd-spec"><summary>Product details</summary><p>${esc(p.spec)}</p></details><details class="pd-spec"><summary>Returns & exchanges</summary><p>${esc(state.settings.returns)}</p></details><div class="pd-quantity"><span>Quantity</span>${stepper("detail", quantity)}</div><div class="pd-buy"><button data-buy="${esc(id)}" ${p.available ? "" : "disabled"}>BUY NOW</button><button data-add="${esc(id)}" ${p.available ? "" : "disabled"}>ADD TO BAG</button></div><div class="pd-service">${[
    ["box", "Discreet packaging"],
    ["gift", "Gift notes"],
    ["lock", "Secure checkout"],
  ]
    .map(([i, n]) => `<div>${icon(i)}${n}</div>`)
    .join(
      "",
    )}</div></div></div><section class="pd-related">${head("", "You may also like")}<div class="product-grid">${state.products
    .filter((v) => v.id !== id)
    .slice(0, 4)
    .map(card)
    .join("")}</div></section></div>`;
}
function bagItems() {
  return Object.entries(bag)
    .map(([id, qty]) => ({ p: product(id), qty }))
    .filter((i) => i.p && i.qty > 0);
}
function totals() {
  const s = state.settings,
    subtotal = bagItems().reduce((a, i) => a + i.p.price * i.qty, 0),
    discount =
      coupon && coupon === s.coupon
        ? Math.round((subtotal * s.discount) / 100)
        : 0,
    shipping = subtotal && subtotal < s.shippingThreshold ? s.shippingFee : 0;
  return {
    subtotal,
    discount,
    shipping,
    total: subtotal - discount + shipping,
  };
}
function sum() {
  const t = totals();
  return `<div class="summary"><div><span>Subtotal</span><span>${fmt(t.subtotal)}</span></div>${t.discount ? "<div><span>Offer discount</span><span>−" + fmt(t.discount) + "</span></div>" : ""}<div><span>Shipping</span><span>${t.shipping ? fmt(t.shipping) : "Complimentary"}</span></div><div class="total"><span>Total</span><span>${fmt(t.total)}</span></div></div>`;
}
function showBag() {
  const list = bagItems();
  open(
    "Your bag",
    list.length
      ? `${list.map(({ p, qty }) => `<div class="row-item"><a href="#/${p.afterDark ? "after-dark" : "product"}/${esc(p.id)}"><img src="${esc(p.image)}" alt="${esc(p.name)}"></a><div><h3>${esc(p.name)}</h3><span class="price">${fmt(p.price)}</span><br>${stepper(p.id, qty)}</div><button class="icon" data-remove="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">${icon("x")}</button></div>`).join("")}<form id="coupon-form" class="action-row"><input name="code" aria-label="Offer code" placeholder="Offer code" maxlength="32" style="flex:1" value="${esc(coupon)}"><button class="btn ghost">Apply</button></form><div class="feedback" role="status" id="coupon-feedback"></div><label class="stack">Gift note (optional)<textarea id="gift-note" maxlength="240" placeholder="A little note for them…">${esc(giftNote)}</textarea></label>${sum()}<button class="btn wide" data-act="checkout">Continue to checkout</button>`
      : empty("Your bag is waiting", "Find something to enjoy together."),
  );
}
function changeBag(id, q) {
  const p = product(id);
  if (!p) return;
  if (q > Math.min(10, p.available)) {
    toast("Maximum available quantity reached.");
    return;
  }
  if (q > 0) bag[id] = q;
  else delete bag[id];
  save("bag", bag);
  sessionStorage.removeItem("gw.checkout");
  header();
  showBag();
}
async function toggleHeart(button) {
  const id = button.dataset.heart;
  const current = wishlist(),
    next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
  try {
    if (state.user) {
      await api("/api/profile", { wishlist: next });
      state.user.wishlist = next;
    } else {
      guestWishlist = next;
      save("wishlist", next);
    }
    const saved = next.includes(id);
    if (!saved && hash() === "/wishlist") render();
    else {
      for (const heart of document.querySelectorAll("[data-heart]")) {
        if (heart.dataset.heart !== id) continue;
        heart.classList.toggle("selected", saved);
        heart.setAttribute("aria-pressed", String(saved));
        heart.classList.toggle("saved-pulse", saved && heart === button);
      }
    }
    toast(saved ? "Saved to your wishlist" : "Removed from wishlist");
  } catch (e) {
    toast(e.message);
  }
}
function searchResults(query) {
  const q = query.trim().toLowerCase(),
    items = state.products.filter((p) =>
      (p.name + " " + category(p.category)?.name + " " + p.detail)
        .toLowerCase()
        .includes(q),
    );
  return `<div class="minor" style="margin:20px 0 7px">${q ? "Matching products" : "Explore products"}</div>${
    items
      .slice(0, 6)
      .map((p) =>
        link(
          "/product/" + p.id,
          `<img src="${esc(p.image)}" alt=""><div><strong>${esc(p.name)}</strong><div class="minor">${fmt(p.price)}</div></div>`,
          "search-result",
        ),
      )
      .join("") || "<p>No products found. Try “candle” or “chocolate”.</p>"
  }${items.length && q ? link("/shop?q=" + encodeURIComponent(query), "See all results", "text-link") : ""}`;
}
function search() {
  open(
    "Search the boutique",
    `<form id="search-form" class="search-box">${icon("search")}<input id="search-input" placeholder="Search chocolates, gifts, candles…" autocomplete="off" aria-label="Search products"></form><div id="results">${searchResults("")}</div>`,
  );
  $("#search-input").focus();
}
const field = (key, label, val = "", opts = "") =>
  `<label>${esc(label)}<input name="${key}" value="${esc(val)}" ${opts}></label>`;
function auth(register = false) {
  if (state.hosted) {
    open(
      "Your account",
      `<p>Sign in to save your profile, wishlist and orders.</p><a class="btn" target="_top" href="/signin-with-chatgpt?return_to=${encodeURIComponent("/#" + (returnAfterAuth || "/account"))}">Sign in with ChatGPT</a>`,
    );
    return;
  }
  open(
    register ? "Create your account" : "Welcome back",
    `<form id="auth-form" data-mode="${register ? "register" : "login"}" class="stack">${register ? field("name", "Your name", "", "required autocomplete=name") : ""}${field("email", "Email address", "", "type=email required autocomplete=email")}${field("password", "Password", "", "type=password required minlength=10 maxlength=256 autocomplete=" + (register ? "new-password" : "current-password"))}<small>${register ? "Choose a password with at least 10 characters." : ""}</small><div class="feedback" role="alert"></div><button class="btn">${register ? "Create account" : "Sign in"}</button></form><p><button class="text-link" data-act="${register ? "login" : "register"}">${register ? "Already registered? Sign in" : "New to Go Winks? Create an account"}</button></p>`,
  );
}
const addressFields = (v, required = true) =>
  `<div class="form-grid">${field("name", "Full name", v.name, required ? "required autocomplete=name" : "autocomplete=name")}${field("phone", "Mobile number", v.phone, 'type="tel" inputmode="numeric" pattern="[0-9]{10}" autocomplete=tel ' + (required ? "required" : ""))}<label class="full">Delivery address<textarea name="address" autocomplete="street-address" ${required ? "required minlength=5" : ""}>${esc(v.address)}</textarea></label>${field("city", "City", v.city, (required ? "required " : "") + "autocomplete=address-level2")}${field("state", "State / union territory", v.state, (required ? "required " : "") + "autocomplete=address-level1")}${field("pin", "PIN code", v.pin, 'inputmode="numeric" pattern="[0-9]{6}" autocomplete=postal-code ' + (required ? "required" : ""))}</div>`;
function checkout() {
  if (!bagItems().length) {
    showBag();
    return;
  }
  if (!state.user) {
    returnAfterAuth = inDark() ? "/after-dark/checkout" : "/checkout";
    auth();
    return;
  }
  open(
    "Checkout",
    `<p>Delivering within India. All orders ship in discreet packaging.</p><form id="checkout-form" class="stack">${addressFields(state.user)}${sum()}${state.paymentsReady ? "" : '<div class="notice">Online payments are awaiting merchant activation. Your bag is saved.</div>'}<div class="feedback" role="alert"></div><button class="btn" ${state.paymentsReady ? "" : "disabled"}>Pay ${fmt(totals().total)} with Razorpay</button></form>`,
  );
}
async function pay(form) {
  if (!state.paymentsReady) return;
  const b = Object.fromEntries(new FormData(form)),
    items = bagItems().map(({ p, qty }) => ({ id: p.id, qty })),
    fingerprint = JSON.stringify([items, b, coupon, giftNote]);
  let checkpoint;
  try {
    checkpoint = JSON.parse(sessionStorage.getItem("gw.checkout"));
  } catch {}
  if (!checkpoint || checkpoint.fingerprint !== fingerprint) {
    checkpoint = { fingerprint, id: crypto.randomUUID() };
    sessionStorage.setItem("gw.checkout", JSON.stringify(checkpoint));
  }
  const result = await api("/api/checkout", {
    requestId: checkpoint.id,
    address: b,
    items,
    coupon,
    note: giftNote,
  });
  await launchPayment(result.order, result.key);
}
async function launchPayment(order, key) {
  if (!window.Razorpay) {
    await new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = "https://checkout.razorpay.com/v1/checkout.js";
      el.onload = resolve;
      el.onerror = () =>
        reject(
          Error("Checkout could not load. Retry from your order history."),
        );
      document.head.append(el);
    });
  }
  close();
  new window.Razorpay({
    key,
    order_id: order.provider,
    amount: order.total * 100,
    currency: "INR",
    name: "Go Winks",
    image: new URL("/go-winks-touch.png", location.origin).href,
    description: order.id,
    prefill: {
      name: order.address.name,
      email: order.email,
      contact: order.address.phone,
    },
    theme: { color: getComputedStyle(document.body).getPropertyValue("--wine").trim() },
    modal: {
      ondismiss: () => {
        accountTab = "orders";
        goto("/account");
      },
    },
    handler: async (response) => {
      try {
        await api("/api/verify", {
          id: order.id,
          payment: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        });
        if (order.fulfillment === "event") {
          await refresh(); goto("/connect/me"); toast("Your event ticket is confirmed."); return;
        }
        if (order.fulfillment === "activity") {
          sessionStorage.removeItem("gw.activityCheckout");
        } else {
          bag = {};
          coupon = "";
          giftNote = "";
          save("bag", bag);
          save("coupon", "");
          save("note", "");
          sessionStorage.removeItem("gw.checkout");
        }
        await refresh();
        accountTab = "orders";
        goto("/account");
        toast("Payment confirmed. Your order is saved.");
      } catch (e) {
        accountTab = "orders";
        goto("/account");
        toast(e.message);
      }
    },
  }).open();
}
const orderCard = (o) =>
  `<article class="order"><div class="between"><strong>${esc(o.id)}</strong><span class="chip">${esc(o.status)}</span></div><small>${esc(new Date(o.created).toLocaleDateString("en-IN"))}</small>${o.items.map((i) => `<p>${esc(i.name)} × ${i.qty}</p>`).join("")}<p><b>${fmt(o.total)}</b></p>${ownedPassInfo(o, state.user, esc)}${o.tracking ? "<p>Tracking: " + esc(o.tracking.courier) + " " + esc(o.tracking.awb) + " · " + esc(o.tracking.status) + "</p>" : ""}${o.status === "Awaiting payment" && o.userId === state.user?.id ? (o.items.some(i => i.afterDark) ? link("/after-dark/resume/" + o.id, "Resume in After Dark", "text-link") : '<button class="text-link" data-resume="' + esc(o.id) + '">Resume payment</button>') : ""}${o.note ? "<p>Gift note: " + esc(o.note) + "</p>" : ""}</article>`;
function account() {
  const u = state.user;
  if (!u)
    return (
      '<div class="inside">' +
      intro(
        "YOUR ACCOUNT",
        "My account",
        "Sign in to manage your profile, saved address and orders.",
      ) +
      '<button class="btn" data-act="login">Sign in or create an account</button></div>'
    );
  const tabs = [
    ["profile", "Profile"],
    ["orders", "Orders"],
    ["help", "Contact the store"],
  ];
  return `<div class="inside">${crumbs("My account")}${intro("YOUR ACCOUNT", u.name ? "Hello, " + u.name.split(" ")[0] : "My account", u.email)}<div class="account-tabs">${link("/connect/me", "My Connect profile & tickets", "text-link")}${link("/invites", "My invitations", "text-link")}${tabs.map(([v, l]) => `<button data-account-tab="${v}" class="${v === accountTab ? "current" : ""}">${l}</button>`).join("")}${["admin", "manager"].includes(u.role) ? link("/manage", "Store management", "text-link") : ""}<button data-act="logout">Sign out</button></div><div class="account-box">${accountTab === "profile" ? `<form id="profile-form" class="stack"><h3>Profile & saved address</h3>${addressFields(u, false)}<small>Account ID: ${esc(u.id)}</small><div class="feedback" role="status"></div><button class="btn">Save profile</button></form>` : accountTab === "help" ? '<form id="help-form" class="stack"><h3>Send a message</h3><label>How can we help?<textarea required maxlength="2000" name="message"></textarea></label><div class="feedback" role="status"></div><button class="btn">Send to the Go Winks team</button></form>' : '<div id="orders" role="status">Loading orders…</div>'}</div></div>`;
}
function render() {
  if (hash().split("?")[0] === "/portal") history.replaceState(history.state, "", "#/");
  const route = hash().split("?")[0].split("/"),
    page = route[1],
    main = $("#main"),
    s = state.settings;
  stopConnect();
  stopDarkFilms();
  if (page !== "after-dark" && darkToken()) leaveDark(api);
  header();
  if (page === "after-dark") mountDark(main, route[2], { api, esc, fmt, render, checkout, ready: !!state.experiences, close,
    resume: () => {
      if (!route[3]) return;
      open("Resume payment", '<button class="btn" data-resume="' + esc(route[3]) + '">Continue to payment</button>');
    },
  });
  else if (page === "connect") mountConnect({main,route,state,api,esc,fmt,launchPayment,
    login: () => { returnAfterAuth=hash(); auth(); }});
  else if (!page) main.innerHTML = home();
  else if (experiencePages.includes(page) && !state.experiences)
    main.innerHTML = '<section class="xp-shell xp-empty" role="status">' +
      (loadFailed ? 'Could not load experiences. Refresh to try again.' : 'Loading GoWinks Experience…') + '</section>';
  else if (page === "activity-checkout" || page === "activity-gift") {
    const ctx = { state, main, esc, fmt, field, api, launchPayment,
      login: () => { returnAfterAuth = hash(); auth(); },
    };
    if (page === "activity-gift") activityGift(ctx, route[2] || "");
    else activityCheckout(ctx, route[2], route[3] === "gift");
  }
  else if (page === "experiences") mountExperiences(main, state.experiences || [], route[2], { esc, fmt });
  else if (page === "invite" || page === "invites") {
    renderInvitations({ main, route, state, esc, api, signIn: () => {
      returnAfterAuth = hash();
      auth();
    } });
  }
  else if (page === "shop") main.innerHTML = shop(route);
  else if (page === "edit") {
    const e = editList().find((e) => e.id === route[2]);
    main.innerHTML = e
      ? `<div class="inside">${crumbs(e.name)}${intro("", e.name)}<div class="product-grid">${e.items.map(product).filter(Boolean).map(card).join("")}</div></div>`
      : '<div class="inside">' +
        empty("Collection unavailable", "Discover the rest of the boutique.") +
        "</div>";
  } else if (page === "product") {
    main.innerHTML = detail(route[2]);
    if (product(route[2]))
      save(
        "recent",
        [route[2], ...read("recent", []).filter((id) => id !== route[2])].slice(
          0,
          16,
        ),
      );
  } else if (page === "wishlist") {
    const saved = state.products.filter((p) => wishlist().includes(p.id));
    main.innerHTML = `<div class="inside">${crumbs("Wishlist")}${intro("SAVED FOR LATER", "Your wishlist")}${saved.length ? '<div class="product-grid">' + saved.map(card).join("") + "</div>" : empty("No saved favourites yet", "Tap the heart on a product to keep it here.")}</div>`;
  } else if (page === "account" || page === "checkout") {
    main.innerHTML = account();
    if (accountTab === "orders" && state.user) {
      const container = $("#orders");
      Promise.all([api("/api/orders"), api("/api/activity-gifts")])
        .then(([orders, gifts]) => {
          if (!container.isConnected) return;
          const received = gifts.length
            ? "<h3>Gifts received</h3>" + gifts.map(p => receivedPassCard(p, esc)).join("") : "";
          container.innerHTML = orders.map(orderCard).join("") + received ||
            empty("No orders yet", "Your purchases and delivery updates will appear here.");
        })
        .catch((e) => { container.textContent = e.message; });
    }
    if (page === "checkout") checkout();
  } else if (page === "gifting")
    main.innerHTML = `<div class="inside">${crumbs("Gifting guide")}${intro("FOR SOMEONE SPECIAL", "The gifting guide", "Choose a gift for their favourite kind of evening.")}<div class="category-grid">${cats().map(catCard).join("")}</div><section class="cross-section">${head("CURATED GIFTS", "Made for <em>two</em>")}<div class="product-grid">${state.products
      .filter((p) => p.category === "gifts")
      .map(card)
      .join("")}</div></section></div>`;
  else if (page === "offers")
    main.innerHTML = `<div class="inside">${crumbs("Offers")}${intro("THE BOUTIQUE", "Offers")}${s.coupon ? `<h3>${esc(s.discount)}% off your order</h3><p>Enter <b>${esc(s.coupon)}</b> in your bag.</p>` : "<p>There are no current promotions.</p>"}<p class="action-row">${link("/shop", "Shop the collection", "btn")}</p></div>`;
  else if (page === "info") {
    const titles = {
        shipping: "Shipping & delivery",
        returns: "Returns & exchanges",
        story: "Our story",
        contact: "Contact us",
      },
      k = route[2];
    main.innerHTML = `<div class="inside">${crumbs(titles[k] || "Store information")}${intro("GO WINKS", titles[k] || "Store information")}<p class="policy">${esc(titles[k] ? s[k] : "")}</p>${k === "contact" ? '<button class="btn action-row" data-act="help">Message the store</button>' : ""}</div>`;
  } else if (page === "manage") {
    manage({
      state,
      api,
      esc,
      fmt,
      main,
      intro,
      crumbs,
      open,
      close,
      refresh,
      toast,
      tab: adminTab,
      setTab: (t) => {
        adminTab = t;
        render();
      },
      render,
      orderCard,
      field,
    });
  } else
    main.innerHTML =
      '<div class="inside">' +
      empty("Page not found", "Browse the boutique to continue.") +
      "</div>";
  const viewed = page === "product" || page === "after-dark" ? product(route[2]) : null;
  syncActivity(state, page, viewed?.id || "", !!darkToken(), api);
  syncHome();
  document.title =
    (page === "product"
      ? product(route[2])?.name
      : page === "shop"
        ? category(route[2])?.name || "Shop all"
        : {
            connect: "Winks Connect",
            "after-dark": "After Dark",
            experiences: state.experiences?.find(item => item.id === route[2])?.name || "GoWinks Experience",
            invite: "Experience invitation",
            invites: "My invitations",
            wishlist: "Wishlist",
            manage: "Store management",
            account: "My account",
            gifting: "Gifting guide",
          }[page] || "The Couples’ Boutique") + " | Go Winks";
}
window.addEventListener("hashchange", () => {
  close();
  quantity = 1;
  galleryIndex = 0;
  render();
  scrollTo(0, 0);
  $("#main").focus({ preventScroll: true });
  motion.enter($("#main"), location.hash);
});
document.addEventListener("click", async (e) => {
  const el = e.target.closest("button,a");
  if (!el) return;
  if (el.matches(".skip")) {
    e.preventDefault();
    $("#main").focus();
    return;
  }
  if (el.tagName === "A" && el.getAttribute("href")?.startsWith("#")) {
    motion.rememberProduct(el, e);
    if (el.getAttribute("href") === "#" + hash()) close();
    return;
  }
  if (el.hasAttribute("data-gallery")) {
    if (galleryIndex === Number(el.dataset.gallery)) return;
    galleryIndex = Number(el.dataset.gallery);
    render();
    motion.changePhoto($(".pd-main img"));
    return;
  }
  if (el.hasAttribute("data-plp-range")) {
    filters.range = el.dataset.plpRange;
    close();
    render();
    return;
  }
  if (el.hasAttribute("data-plp-stock")) {
    filters.stock = el.dataset.plpStock === "in";
    render();
    return;
  }
  if (el.dataset.buy) {
    const p = product(el.dataset.buy);
    if (!p || !p.available) return;
    const q = (bag[p.id] || 0) + quantity;
    if (q > Math.min(p.available, 10)) {
      toast("Maximum available quantity reached.");
      return;
    }
    changeBag(p.id, q);
    checkout();
    return;
  }
  if (el.hasAttribute("data-deck")) {
    setCampaign(campaignIndex + Number(el.dataset.deck));
    return;
  }
  if (el.hasAttribute("data-rec")) {
    recFilter = el.dataset.rec;
    $("#recommend").innerHTML = recommendations();
    return;
  }
  if (el.dataset.heart) {
    await toggleHeart(el);
    return;
  }
  if (el.dataset.resume) {
    try {
      const r = await api("/api/resume", { id: el.dataset.resume });
      await launchPayment(r.order, r.key);
    } catch (e) {
      toast(e.message);
    }
    return;
  }
  if (el.dataset.add) {
    changeBag(el.dataset.add, (bag[el.dataset.add] || 0) + quantity);
    return;
  }
  if (el.dataset.remove) {
    changeBag(el.dataset.remove, 0);
    return;
  }
  if (el.dataset.step) {
    const n = Number(el.dataset.step),
      id = el.dataset.id;
    if (id === "detail") {
      quantity = Math.max(
        1,
        Math.min(
          quantity + n,
          Math.min(10, product(hash().split("/")[2])?.available || 1),
        ),
      );
      render();
    } else changeBag(id, (bag[id] || 0) + n);
    return;
  }
  if (el.dataset.accountTab) {
    accountTab = el.dataset.accountTab;
    render();
    return;
  }
  switch (el.dataset.act) {
    case "listing-filters":
      open(
        "Filters",
        document
          .querySelector(".plp-side")
          .innerHTML.replace("<h2>FILTERS</h2>", ""),
      );
      return;
    case "film": {
      const v = $(".film video");
      if (!v) return;
      filmPaused = !v.paused;
      if (v.paused) {
        v.play()
          .then(() => {
            el.innerHTML = icon("pause");
            el.setAttribute("aria-label", "Pause campaign film");
          })
          .catch(() => toast("The film could not play."));
      } else {
        v.pause();
        el.innerHTML = icon("play");
        el.setAttribute("aria-label", "Play campaign film");
      }
      return;
    }
    case "dock":
      $("#mobile-dock").classList.toggle("opened");
      return;
    case "rec-filter":
      open(
        "Filter products",
        `<form class="stack" id="rec-form"><label>Sort by<select name="sort"><option value="featured">Featured</option><option value="low" ${recSort === "low" ? "selected" : ""}>Price: low to high</option><option value="high" ${recSort === "high" ? "selected" : ""}>Price: high to low</option></select></label><label class="check-row"><input type="checkbox" name="stock" ${recStock ? "checked" : ""}>In stock only</label><button class="btn">Apply filters</button></form>`,
      );
      return;
    case "recent": {
      const items = read("recent", []).map(product).filter(Boolean);
      open(
        "Recently viewed",
        items.length
          ? items
              .map((p) =>
                link(
                  "/product/" + p.id,
                  '<img src="' +
                    esc(p.image) +
                    '" alt=""><div>' +
                    esc(p.name) +
                    '<div class="price">' +
                    fmt(p.price) +
                    "</div></div>",
                  "search-result",
                ),
              )
              .join("")
          : empty(
              "No recently viewed products",
              "The products you open will appear here.",
            ),
      );
      return;
    }
    case "gift":
      goto("/gifting");
      return;
    case "orders":
      accountTab = "orders";
      if (state.user) goto("/account");
      else {
        returnAfterAuth = "/account";
        auth();
      }
      return;
    case "menu":
      open(
        "Explore Go Winks",
        link("/shop", "Shop all", "menu-link") +
          cats()
            .map((c) => link("/shop/" + c.id, esc(c.name), "menu-link"))
            .join("") +
          link("/connect", "Winks Connect", "menu-link") +
          link("/experiences", "GoWinks Experience", "menu-link") +
          link("/gifting", "Gifting guide", "menu-link") +
          link("/account", "My account", "menu-link") +
          link("/offers", "Offers", "menu-link"),
      );
      break;
    case "search":
      search();
      break;
    case "bag":
      showBag();
      break;
    case "wishlist":
      goto("/wishlist");
      break;
    case "checkout":
      checkout();
      break;
    case "account":
      state.user ? goto("/account") : auth();
      break;
    case "login":
      auth();
      break;
    case "register":
      auth(true);
      break;
    case "help":
      accountTab = "help";
      if (state.user) goto("/account");
      else {
        returnAfterAuth = "/account";
        auth();
      }
      break;
    case "logout":
      if (state.hosted) {
        window.top.location.href = "/signout-with-chatgpt?return_to=/";
        return;
      }
      await api("/api/auth/logout", {});
      await refresh();
      goto("/");
      toast("Signed out");
      break;
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "mast-query") {
    const box = $("#mast-results");
    box.innerHTML = searchResults(e.target.value);
    box.hidden = false;
  }
  if (e.target.id === "search-input")
    $("#results").innerHTML = searchResults(e.target.value);
  if (e.target.id === "gift-note") {
    giftNote = e.target.value;
    save("note", giftNote);
  }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.id === "collection-filter")
    goto("/shop" + (el.value ? "/" + el.value : ""));
  if (el.id === "price-filter") {
    filters.range = el.value;
    render();
  }
  if (el.id === "sort") {
    filters.sort = el.value;
    render();
  }
  if (el.id === "stock-filter") {
    filters.stock = el.checked;
    render();
  }
});
document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (
    ![
      "search-form",
      "coupon-form",
      "auth-form",
      "profile-form",
      "help-form",
      "checkout-form",
    ].includes(f.id)
  )
    return;
  e.preventDefault();
  const values = Object.fromEntries(new FormData(f)),
    btn = f.querySelector('button:not([type="button"])'),
    feedback = f.querySelector(".feedback");
  if (btn) btn.disabled = true;
  if (feedback) feedback.textContent = "";
  try {
    if (f.id === "search-form") {
      goto("/shop?q=" + encodeURIComponent($("#search-input").value.trim()));
      return;
    }
    if (f.id === "coupon-form") {
      const c = values.code.trim().toUpperCase();
      if (c && c !== state.settings.coupon) {
        $("#coupon-feedback").textContent = "This offer code is not valid.";
        return;
      }
      coupon = c;
      save("coupon", c);
      sessionStorage.removeItem("gw.checkout");
      showBag();
      $("#coupon-feedback").textContent = c
        ? "Offer applied."
        : "Offer removed.";
      return;
    }
    if (f.id === "auth-form") {
      await api("/api/auth/" + f.dataset.mode, values);
      await refresh();
      if (guestWishlist.length) {
        const next = [...new Set([...state.user.wishlist, ...guestWishlist])];
        await api("/api/profile", { wishlist: next });
        state.user.wishlist = next;
        guestWishlist = [];
        save("wishlist", []);
      }
      const dest = returnAfterAuth || "/account";
      returnAfterAuth = "";
      goto(dest);
      return;
    }
    if (f.id === "profile-form") {
      const u = await api("/api/profile", values);
      state.user = { ...state.user, ...u };
      feedback.textContent = "Your profile has been saved.";
      return;
    }
    if (f.id === "help-form") {
      await api("/api/contact", values);
      f.reset();
      feedback.textContent = "Your message has been sent to the store team.";
      return;
    }
    if (f.id === "checkout-form") await pay(f);
  } catch (err) {
    if (feedback) feedback.textContent = err.message;
    else toast(err.message);
  } finally {
    if (btn && btn.isConnected) btn.disabled = false;
  }
});
header();
footer();
render();
refresh()
  .then(() => {
    if (inDark() && $("#main [data-confirm-age]")) return;
    render();
  })
  .catch(() => {
    loadFailed = true;
    render();
    toast("Live stock is unavailable. Please refresh before checking out.");
  });

document.addEventListener("focusin", (e) => {
  if (e.target.id === "mast-query") {
    const box = $("#mast-results");
    box.innerHTML = searchResults(e.target.value);
    box.hidden = false;
  } else if (!e.target.closest(".quick-search") && $("#mast-results"))
    $("#mast-results").hidden = true;
});
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest(".quick-search") && $("#mast-results"))
    $("#mast-results").hidden = true;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#mast-results"))
    $("#mast-results").hidden = true;
});
document.addEventListener("submit", (e) => {
  if (e.target.id === "mast-search") {
    e.preventDefault();
    goto("/shop?q=" + encodeURIComponent($("#mast-query").value.trim()));
  }
  if (e.target.id === "rec-form") {
    e.preventDefault();
    const d = new FormData(e.target);
    recSort = d.get("sort");
    recStock = d.has("stock");
    close();
    $("#recommend").innerHTML = recommendations();
  }
});

let slideGesture = null,
  ignoreCampaignClick = 0;
document.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".campaign-track"))
    slideGesture = { x: e.clientX, y: e.clientY, id: e.pointerId };
});
document.addEventListener("pointerup", (e) => {
  if (!slideGesture || e.pointerId !== slideGesture.id) return;
  const dx = e.clientX - slideGesture.x,
    dy = e.clientY - slideGesture.y;
  slideGesture = null;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
    ignoreCampaignClick = performance.now() + 400;
    setCampaign(campaignIndex + (dx < 0 ? 1 : -1));
  }
});
document.addEventListener("pointercancel", () => (slideGesture = null));
document.addEventListener(
  "click",
  (e) => {
    if (
      e.target.closest(".campaign-track") &&
      performance.now() < ignoreCampaignClick
    ) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  true,
);
