import {
  products as initialProducts,
  experiences as initialExperiences,
  settings as initialSettings,
} from "../public/catalog.js";
import { darkProducts, hasDarkAccess, darkAccessAction } from "./after-dark.mjs";
import { activitySettings, updateActivity, badgeProducts, shopActivity } from "./shop-activity.mjs";
import { connectApi } from "./connect.mjs";
const json = (value, status = 200) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const clean = (v, n = 300) =>
  String(v ?? "")
    .trim()
    .slice(0, n);
const goodId = (v) => /^[a-zA-Z0-9_-]{1,100}$/.test(v || "");
const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args);
const rows = async (db, sql, ...args) =>
  (await stmt(db, sql, ...args).all()).results;
const safeImage = (v) =>
  typeof v === "string" &&
  ((v.startsWith("/images/") && !v.includes("..")) || /^https:\/\//.test(v));
const saveOrder = (db, o) =>
  stmt(
    db,
    "UPDATE orders SET data=? WHERE id=?",
    JSON.stringify(o),
    o.id,
  ).run();
const getOrder = async (db, id) => {
  const r = await stmt(db, "SELECT data FROM orders WHERE id=?", id).first();
  return r ? JSON.parse(r.data) : null;
};
async function catalog(db) {
  const edits = await rows(db, "SELECT * FROM catalog"),
    map = new Map([...initialProducts, ...initialExperiences, ...darkProducts].map((p) => [p.id, { ...p }]));
  for (const r of edits) map.set(r.id, JSON.parse(r.data));
  const usage = await rows(
    db,
    "SELECT product_id,SUM(qty) AS n FROM reservations GROUP BY product_id",
  );
  for (const p of map.values())
    p.available = Math.max(
      0,
      p.stock - (usage.find((r) => r.product_id === p.id)?.n || 0),
    );
  return [...map.values()];
}
function listingUrl(value, field) {
  if (typeof value !== "string" || !value || value.length > 1500 || /[\\\s<>"]/.test(value))
    fail(400, `Enter a valid URL for ${field}.`);
  const isAsset = field === "photo" || field === "video";
  if (isAsset && /^\/images\/[\w./-]+$/.test(value) && !value.includes("..")) return value;
  let url;
  try { url = new URL(value); } catch { fail(400, `Enter a valid URL for ${field}.`); }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    fail(400, `Use a public HTTPS URL for ${field}.`);
  if (field === "Instagram reel" &&
      (!["www.instagram.com", "instagram.com"].includes(url.hostname) ||
       !/^\/reels?\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)))
    fail(400, "Enter the URL of a specific Instagram reel.");
  if (field === "Google Maps" &&
      !(url.hostname === "maps.app.goo.gl" ||
        (["www.google.com", "google.com", "maps.google.com"].includes(url.hostname) &&
         (url.hostname === "maps.google.com" || /^\/maps(?:\/|$)/.test(url.pathname)))))
    fail(400, "Enter a Google Maps place or directions link.");
  return url.href;
}

async function saveExperience(db, b) {
  const original = b.id ? (await catalog(db)).find((p) => p.id === b.id) : null;
  if (b.id && !original?.kind) fail(404, "Experience listing not found.");
  if (!["activity", "property", "spot"].includes(b.kind) || (original && original.kind !== b.kind))
    fail(400, "Choose the listing type when you create the experience.");
  if (typeof b.active !== "boolean" || typeof b.preview !== "boolean")
    fail(400, "Choose the listing visibility and publication status.");
  const isActivity = b.kind === "activity";
  if (!Array.isArray(b.photos) || b.photos.length < 1 || b.photos.length > 12)
    fail(400, "Add one to twelve photo URLs, starting with the cover.");
  const photos = [...new Set(b.photos.map((url) => listingUrl(url, "photo")))];
  const price = isActivity ? Number(b.price) : 0;
  const stock = isActivity ? Number(b.stock) : 0;
  if (!integer(price, isActivity ? 1 : 0, 1000000) || !integer(stock, 0, 100000))
    fail(400, "Check the price per couple and total activity passes.");
  if (original && stock < original.stock - original.available)
    fail(409, "Total passes must cover the existing reservations.");
  const revision = original?.revision || 0;
  if (b.id && b.revision !== revision)
    fail(409, "This listing has changed. Reopen it before editing.");
  const listing = {
    id: original?.id || crypto.randomUUID(),
    kind: b.kind,
    name: clean(b.name, 100),
    city: clean(b.city, 90),
    vibe: clean(b.vibe, 60),
    duration: clean(b.duration, 80),
    location: clean(b.location, 300),
    mapUrl: b.mapUrl ? listingUrl(b.mapUrl, "Google Maps") : "",
    detail: clean(b.detail, 2000),
    photos,
    image: photos[0],
    video: b.video ? listingUrl(b.video, "video") : "",
    reel: b.reel ? listingUrl(b.reel, "Instagram reel") : "",
    price, stock,
    preview: b.preview,
    active: b.active,
    revision: revision + 1,
  };
  if (!listing.name || !listing.city || !listing.detail || !listing.vibe)
    fail(400, "Enter a title, city, vibe and description.");
  const saved = await stmt(db,
    `INSERT INTO catalog (id, data) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data
     WHERE json_extract(catalog.data, '$.revision') = ?
     RETURNING id`,
    listing.id, JSON.stringify(listing), revision).first();
  if (!saved) fail(409, "This listing has changed. Reopen it before editing.");
  return listing;
}

async function settings(db) {
  const r = await stmt(db, "SELECT data FROM config WHERE id='store'").first();
  return { ...initialSettings, ...(r ? JSON.parse(r.data) : {}) };
}
async function profile(db, u) {
  const a = await stmt(
    db,
    "SELECT data FROM profiles WHERE id=?",
    u.id,
  ).first();
  return {
    name: u.name || "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pin: "",
    wishlist: [],
    ...(a ? JSON.parse(a.data) : {}),
    id: u.id,
    email: u.email,
  };
}
async function permissions(env, u) {
  if (!u) return "visitor";
  if (
    env.HOSTED &&
    env.HOSTED_ADMIN_EMAIL &&
    u.email.toLowerCase() === env.HOSTED_ADMIN_EMAIL.toLowerCase()
  )
    return "admin";
  if (
    (env.ADMIN_USER_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .includes(u.id)
  )
    return "admin";
  const r = await stmt(
    env.DB,
    "SELECT role FROM staff WHERE id=?",
    u.id,
  ).first();
  return r?.role || "customer";
}
function validAddress(data) {
  const result = Object.fromEntries(
    ["name", "phone", "address", "city", "state", "pin"].map((k) => [
      k,
      clean(data[k], k === "address" ? 350 : 85),
    ]),
  );
  if (
    !result.name ||
    !/^\d{10}$/.test(result.phone) ||
    result.address.length < 5 ||
    !result.city ||
    !result.state ||
    !/^\d{6}$/.test(result.pin)
  )
    fail(
      400,
      "Enter your name, full delivery address, 10-digit mobile number and 6-digit PIN code.",
    );
  return result;
}
async function gateway(env, path, data) {
  const r = await fetch("https://api.razorpay.com/v1/" + path, {
    method: data ? "POST" : "GET",
    headers: {
      authorization:
        "Basic " + btoa(env.RAZORPAY_KEY_ID + ":" + env.RAZORPAY_KEY_SECRET),
      "content-type": "application/json",
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!r.ok)
    fail(
      502,
      "Razorpay could not complete this request. Please try again or contact the store with your order number.",
    );
  return r.json();
}
async function hmac(key, str) {
  const bytes = new TextEncoder(),
    k = await crypto.subtle.importKey(
      "raw",
      bytes.encode(key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  return [
    ...new Uint8Array(await crypto.subtle.sign("HMAC", k, bytes.encode(str))),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function same(a, b) {
  if (typeof b !== "string" || a.length !== b.length) return false;
  let n = 0;
  for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return n === 0;
}
async function capture(db, o, p) {
  if (
    p.order_id !== o.provider ||
    p.amount !== o.total * 100 ||
    p.currency !== "INR" ||
    p.status !== "captured"
  )
    fail(
      409,
      "Payment has not been confirmed. Check your order history for updates.",
    );
  await stmt(
    db,
    "UPDATE orders SET data=json_set(data,'$.status','Paid','$.payment',?) WHERE id=? AND json_extract(data,'$.status')='Awaiting payment'",
    p.id,
    o.id,
  ).run();
}
async function newOrder(env, u, b, darkAccess) {
  const list = await catalog(env.DB);
  if (!darkAccess && Array.isArray(b.items) && b.items.some(i => list.some(p => p.id === i?.id && p.afterDark)))
    fail(403, "Confirm your age in After Dark before checkout.");
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET)
    fail(
      503,
      "Online payment is awaiting merchant activation. Your bag has been saved.",
    );
  if (
    !goodId(b.requestId) ||
    !Array.isArray(b.items) ||
    !b.items.length ||
    b.items.length > 40
  )
    fail(400, "Check the items in your bag.");
  const db = env.DB,
    old = await stmt(
      db,
      "SELECT data FROM orders WHERE user_id=? AND request_id=?",
      u.id,
      b.requestId,
    ).first();
  if (old) {
    const o = JSON.parse(old.data);
    if (!darkAccess && o.items.some(i => i.afterDark)) fail(403, "Enter After Dark to continue.");
    if (o.status !== "Awaiting payment" || !o.provider)
      fail(409, "This checkout already exists. Review it in your orders.");
    return { order: o, key: env.RAZORPAY_KEY_ID };
  }
  const s = await settings(db),
    seen = new Set(),
    activityOrder = b.fulfillment === "activity";
  if (activityOrder && (b.items.length !== 1 || b.items[0]?.qty !== 1))
    fail(400, "Choose a single activity pass per checkout.");
  const items = b.items.map((i) => {
    const p = list.find((p) => p.active && p.id === i?.id);
    if (!p || seen.has(i.id) || !integer(i.qty, 1, 10) || i.qty > p.available)
      fail(409, "An item in your bag is unavailable in that quantity.");
    if (activityOrder ? p.kind !== "activity" || p.preview : !!p.kind)
      fail(409, "Only a published activity can be purchased through activity checkout.");
    seen.add(i.id);
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      qty: i.qty,
      image: p.image,
      capacity: p.stock,
      ...(p.afterDark ? { afterDark: true } : {}),
      ...(activityOrder ? { city: p.city || "", detail: p.detail || "" } : {}),
    };
  });
  const address = activityOrder
    ? { name: clean(b.address?.name, 85), phone: clean(b.address?.phone, 15) }
    : validAddress(b.address || {});
  if (activityOrder && (!address.name || !/^\d{10}$/.test(address.phone)))
    fail(400, "Enter your name and 10-digit mobile number for the booking.");
  let gift;
  if (b.activityGift) {
    const { name, email, phone, message } = b.activityGift;
    if (!activityOrder || !clean(name) || typeof email !== "string" ||
        email.length > 250 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        (phone && !/^\+[1-9]\d{7,14}$/.test(phone)))
      fail(400, "Enter the recipient’s name, email, and a valid international number if sharing on WhatsApp.");
    gift = {
      name: clean(name, 85), email: email.trim().toLowerCase(), phone: phone || "",
      message: clean(message, 240), token: crypto.randomUUID(),
    };
  }
  const subtotal = items.reduce((a, i) => a + i.qty * i.price, 0),
    coupon = clean(b.coupon, 32).toUpperCase();
  if (coupon && coupon !== s.coupon)
    fail(400, "This offer code is no longer valid.");
  const discount = coupon ? Math.round((subtotal * s.discount) / 100) : 0,
    shipping = activityOrder || subtotal >= s.shippingThreshold ? 0 : s.shippingFee;
  const o = {
    id: "GW-" + crypto.randomUUID().slice(0, 13).toUpperCase(),
    created: new Date().toISOString(),
    email: u.email,
    address,
    items,
    subtotal,
    discount,
    shipping,
    total: subtotal - discount + shipping,
    coupon,
    note: clean(b.note, 240),
    ...(activityOrder ? { fulfillment: "activity" } : {}),
    ...(gift ? { gift } : {}),
    status: "Preparing payment",
    userId: u.id,
  };
  const put = stmt(
    db,
    "INSERT INTO orders VALUES(?,?,?,?)",
    o.id,
    u.id,
    b.requestId,
    JSON.stringify(o),
  );
  try {
    await db.batch([
      put,
      ...items.map((i) =>
        stmt(
          db,
          "INSERT INTO reservations VALUES(?,?,?,?)",
          o.id,
          i.id,
          i.qty,
          i.capacity,
        ),
      ),
    ]);
  } catch {
    fail(
      409,
      "The stock or checkout has changed. Refresh your bag and try again.",
    );
  }
  try {
    const remote = await gateway(env, "orders", {
      amount: o.total * 100,
      currency: "INR",
      receipt: o.id,
    });
    o.provider = remote.id;
    o.status = "Awaiting payment";
    await saveOrder(db, o);
  } catch (e) {
    await db.batch([
      stmt(db, "DELETE FROM reservations WHERE order_id=?", o.id),
      stmt(
        db,
        "UPDATE orders SET data=json_set(data,'$.status','Payment setup failed') WHERE id=?",
        o.id,
      ),
    ]);
    throw e;
  }
  return { order: o, key: env.RAZORPAY_KEY_ID };
}
function activityPass(order) {
  return {
    id: order.id, name: order.items[0].name, city: order.items[0].city,
    image: order.items[0].image, sender: order.address.name, recipient: order.gift.name,
    message: order.gift.message, status: order.status, claimed: !!order.gift.claimedBy,
  };
}
async function ship(env, o, s, action) {
  if (["event","activity"].includes(o.fulfillment)) fail(409, "Tickets and activity passes are fulfilled digitally.");
  if (
    !env.SHIPROCKET_EMAIL ||
    !env.SHIPROCKET_PASSWORD ||
    !env.SHIPROCKET_PICKUP
  )
    fail(
      503,
      "Shiprocket merchant credentials and a pickup location are required.",
    );
  const base = "https://apiv2.shiprocket.in/v1/external/",
    call = async (url, token, data) => {
      const r = await fetch(base + url, {
        method: data ? "POST" : "GET",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: "Bearer " + token } : {}),
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      if (!r.ok)
        fail(
          502,
          "Shiprocket could not complete this request. Check merchant settings and reconcile the order in Shiprocket.",
        );
      return r.json();
    };
  const { token } = await call("auth/login", null, {
    email: env.SHIPROCKET_EMAIL,
    password: env.SHIPROCKET_PASSWORD,
  });
  if (!token) fail(502, "Shiprocket authentication failed.");
  if (action === "track") {
    if (!o.shipment) fail(409, "The shipment has not been booked.");
    const track = await call(
      "courier/track/shipment/" + encodeURIComponent(o.shipment),
      token,
    );
    const t = (Array.isArray(track) ? track[0] : track)?.tracking_data,
      entry = t?.shipment_track?.[0];
    if (!entry) fail(409, "Tracking is pending a carrier update.");
    o.tracking = {
      status: clean(entry.current_status),
      awb: clean(entry.awb_code),
      courier: clean(entry.courier_name),
      at: new Date().toISOString(),
    };
    if (entry.current_status?.toLowerCase() === "delivered")
      o.status = "Delivered";
  } else {
    if (o.status !== "Paid" || o.shipment)
      fail(409, "Only a paid order without a shipment can be booked.");
    const a = o.address,
      [first, ...last] = a.name.split(/\s+/);
    const result = await call("orders/create/adhoc", token, {
      order_id: o.id,
      order_date: o.created.replace("T", " ").slice(0, 16),
      pickup_location: env.SHIPROCKET_PICKUP,
      billing_customer_name: first,
      billing_last_name: last.join(" ") || first,
      billing_address: a.address,
      billing_city: a.city,
      billing_pincode: a.pin,
      billing_state: a.state,
      billing_country: "India",
      billing_email: o.email,
      billing_phone: a.phone,
      shipping_is_billing: true,
      order_items: o.items.map((i) => ({
        name: i.name,
        sku: i.id,
        units: i.qty,
        selling_price: i.price,
      })),
      payment_method: "Prepaid",
      shipping_charges: o.shipping,
      total_discount: o.discount,
      sub_total: o.subtotal,
      length: s.length || 20,
      breadth: s.breadth || 15,
      height: s.height || 8,
      weight: s.weight || 0.5,
    });
    if (!result.shipment_id)
      fail(
        502,
        "Shiprocket has not confirmed booking. Reconcile this order in your merchant dashboard.",
      );
    o.shipment = result.shipment_id;
    o.shiprocketOrder = result.order_id;
    o.status = "Shipment booked";
  }
  await saveOrder(env.DB, o);
  return o;
}
function invitationView(record, user) {
  const sent = record.sender_id === user.id;
  if (!sent && record.recipient_id !== user.id) {
    if (record.recipient_id || record.status !== "pending") fail(404, "Invitation unavailable.");
    return { locked: true };
  }
  return {
    ...JSON.parse(record.details),
    token: record.token,
    listingId: record.listing_id,
    status: record.status,
    direction: sent ? "sent" : "received",
    created: record.created_at,
  };
}
async function invitationPhoneDigest(token, value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/[ ()-]/g, "");
  // Store one salted digest per invitation. A ten-digit local number defaults to India.
  const international = /^\d{10}$/.test(digits) ? "+91" + digits : digits;
  if (!/^\+[1-9]\d{7,14}$/.test(international))
    fail(400, "Enter a ten-digit Indian number or a number starting with its +country code.");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token + ":" + international));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, "0")).join("");
}
async function invitations(req, db, user, path) {
  if (!user) fail(401, "Sign in to view your invitations.");
  if (path === "/api/invitations") {
    if (req.method === "GET") {
      const items = await rows(db, "SELECT * FROM invitations WHERE sender_id=? OR recipient_id=? ORDER BY created_at DESC", user.id, user.id);
      return json(items.map(row => invitationView(row, user)));
    }
    const body = await req.json();
    if (!goodId(body.requestId)) fail(400, "Refresh the form and try again.");
    const previous = () => stmt(db, "SELECT * FROM invitations WHERE sender_id=? AND request_id=?", user.id, body.requestId).first();
    const existing = await previous();
    if (existing) return json(invitationView(existing, user));
    const listing = (await catalog(db)).find(p => p.id === body.listingId && p.active && ["activity", "spot", "property"].includes(p.kind));
    if (!listing) fail(404, "This experience is no longer listed.");
    const details = {
      senderName: clean(body.senderName, 80),
      recipientName: clean(body.recipientName, 80),
      message: clean(body.message, 500),
      listingName: listing.name,
      preview: listing.preview === true,
    };
    if (!details.senderName || !details.recipientName) fail(400, "Enter both names.");
    const token = crypto.randomUUID();
    const digest = await invitationPhoneDigest(token, body.phone);
    await stmt(db, "INSERT INTO invitations(token,sender_id,request_id,listing_id,details,phone_digest,status,created_at) VALUES(?,?,?,?,?,?,'pending',?) ON CONFLICT(sender_id,request_id) DO NOTHING",
      token, user.id, body.requestId, listing.id, JSON.stringify(details), digest, Date.now()).run();
    return json(invitationView(await previous(), user), 201);
  }

  const token = path.slice("/api/invitations/".length);
  if (!/^[\da-f-]{36}$/.test(token)) fail(404, "Invitation unavailable.");
  const load = () => stmt(db, "SELECT * FROM invitations WHERE token=?", token).first();
  const row = await load();
  if (!row) fail(404, "Invitation unavailable.");
  if (req.method === "GET") return json(invitationView(row, user));
  const { action, phone } = await req.json();
  if (action === "withdraw" && row.sender_id === user.id) {
    if (!["pending", "withdrawn"].includes(row.status)) fail(409, "This invitation has already been answered.");
    await stmt(db, "UPDATE invitations SET status='withdrawn' WHERE token=? AND status='pending'", token).run();
  } else if (action === "open" && row.sender_id !== user.id) {
    if (row.recipient_id === user.id) return json(invitationView(row, user));
    if (row.recipient_id || row.status !== "pending") fail(404, "Invitation unavailable.");
    if (row.phone_digest !== await invitationPhoneDigest(token, phone))
      fail(403, "This number does not match the invitation.");
    await stmt(db, "UPDATE invitations SET recipient_id=? WHERE token=? AND recipient_id IS NULL AND status='pending'", user.id, token).run();
  } else if (["accepted", "declined"].includes(action) && row.recipient_id === user.id) {
    if (row.status !== action && row.status !== "pending") fail(409, "This invitation has already been answered or withdrawn.");
    await stmt(db, "UPDATE invitations SET status=? WHERE token=? AND recipient_id=? AND status='pending'", action, token, user.id).run();
  } else fail(403, "This action is unavailable for your account.");
  const latest = await load();
  if ((action === "withdraw" && latest.status !== "withdrawn") ||
      (["accepted", "declined"].includes(action) && action !== latest.status))
    fail(409, "The invitation changed. Refresh to see its current status.");
  return json(invitationView(latest, user));
}
export async function api(req, env, u) {
  try {
    const db = env.DB,
      path = new URL(req.url).pathname,
      method = req.method;
    if (!["GET", "POST"].includes(method)) fail(405, "Unsupported request.");
    if (
      method === "POST" &&
      path !== "/api/webhook" &&
      req.headers.get("origin") &&
      new URL(req.headers.get("origin")).origin !== new URL(req.url).origin
    )
      fail(403, "Cross-site request denied.");
    if (path.startsWith("/api/connect/")) return json(await connectApi(req,env,u,await permissions(env,u),
      body => gateway(env,"orders",body)));
    if (path === "/api/activity/pulse" && method === "POST") {
      const body = await req.json(), cfg = await activitySettings(db);
      const dark = body.room === "after-dark";
      if (dark && !await hasDarkAccess(req, db)) fail(403, "Enter After Dark to continue.");
      let id = "";
      if (goodId(body.product)) {
        const row = await stmt(db, "SELECT data FROM catalog WHERE id=?", body.product).first();
        const p = row ? JSON.parse(row.data) : [...initialProducts, ...darkProducts].find(p => p.id === body.product);
        if (p?.active && !p.kind && !!p.afterDark === dark) id = p.id;
      }
      return json(await shopActivity(req, db, cfg, dark ? "after-dark" : "boutique", id, body));
    }
    if (path === "/api/after-dark/access" && method === "POST") return await darkAccessAction(req, db);
    if (path === "/api/after-dark/catalog" && method === "GET") {
      if (!await hasDarkAccess(req, db)) fail(403, "Confirm you are 18 or older to enter After Dark.");
      return json({ products: await badgeProducts(db, (await catalog(db)).filter(p => p.afterDark && p.active && !p.kind), await activitySettings(db)) });
    }
    if (path === "/api/invitations" || path.startsWith("/api/invitations/"))
      return await invitations(req, db, u, path);
    if (path === "/api/webhook" && method === "POST") {
      if (!env.RAZORPAY_WEBHOOK_SECRET) fail(503, "Webhook inactive.");
      const raw = await req.text();
      if (
        !same(
          await hmac(env.RAZORPAY_WEBHOOK_SECRET, raw),
          req.headers.get("x-razorpay-signature"),
        )
      )
        fail(403, "Invalid signature.");
      const event = JSON.parse(raw);
      if (event.event === "payment.captured") {
        const p = event.payload.payment.entity,
          r = await stmt(
            db,
            "SELECT data FROM orders WHERE json_extract(data,'$.provider')=?",
            p.order_id,
          ).first();
        if (!r) fail(404, "Order pending.");
        await capture(db, JSON.parse(r.data), p);
      }
      return json({ ok: true });
    }
    if (method === "GET" && path === "/api/store") {
      const [s, list, role, activity] = await Promise.all([
        settings(db),
        catalog(db),
        permissions(env, u), activitySettings(db),
      ]);
      const visible = new Set(list.filter(p => p.active && !p.kind && !p.afterDark).map(p => p.id));
      return json({
        settings: { ...s, reels: (s.reels || []).filter(r => visible.has(r.productId)),
          edits: (s.edits || []).map(e => ({ ...e, items: e.items.filter(id => visible.has(id)) })) },
        activity: { ...activity, phone: activity.whatsapp ? activity.phone : "" },
        products: await badgeProducts(db, list.filter(p => visible.has(p.id)), activity),
        experiences: list.filter((p) => p.kind && p.active),
        user: u ? { ...(await profile(db, u)), role } : null,
        hosted: !!env.HOSTED,
        paymentsReady: !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
      });
    }
    if (!u) fail(401, "Sign in to continue.");
    const b = method === "POST" ? await req.json() : {};
    if (path === "/api/profile" && method === "POST") {
      const old = await profile(db, u),
        newProfile = { ...old };
      for (const k of ["name", "phone", "address", "city", "state", "pin"])
        if (k in b) newProfile[k] = clean(b[k], k === "address" ? 350 : 100);
      if ("wishlist" in b)
        newProfile.wishlist = Array.isArray(b.wishlist)
          ? [...new Set(b.wishlist.filter(goodId))].slice(0, 200)
          : [];
      await stmt(
        db,
        "INSERT INTO profiles VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,data=excluded.data",
        u.id,
        u.email,
        JSON.stringify(newProfile),
      ).run();
      return json(newProfile);
    }
    if (path === "/api/activity-gifts" && method === "GET") {
      const received = await rows(db,
        "SELECT data FROM orders WHERE json_extract(data,'$.gift.claimedBy')=? ORDER BY rowid DESC", u.id);
      return json(received.map(r => activityPass(JSON.parse(r.data))));
    }
    const giftMatch = path.match(/^\/api\/activity-gifts\/([a-f0-9-]{36})$/);
    if (giftMatch) {
      const record = await stmt(db,
        "SELECT data FROM orders WHERE json_extract(data,'$.gift.token')=?", giftMatch[1]).first();
      const order = record && JSON.parse(record.data);
      if (!order || !["Paid", "Redeemed"].includes(order.status) ||
          (order.gift.claimedBy ? order.gift.claimedBy !== u.id : order.gift.email !== u.email?.toLowerCase()))
        fail(404, "This gift is unavailable for this account. Sign in with the recipient email.");
      if (method === "POST" && !order.gift.claimedBy) {
        if (order.status !== "Paid") fail(409, "This pass is no longer claimable.");
        await stmt(db,
          "UPDATE orders SET data=json_set(data,'$.gift.claimedBy',?) WHERE id=? AND json_extract(data,'$.gift.claimedBy') IS NULL AND json_extract(data,'$.status')='Paid'",
          u.id, order.id).run();
        const updated = await getOrder(db, order.id);
        if (updated.gift.claimedBy !== u.id) fail(409, "This gift has already been claimed.");
        return json(activityPass(updated));
      }
      return json(activityPass(order));
    }
    if (path === "/api/orders" && method === "GET") {
      const orders = await rows(db, "SELECT data FROM orders WHERE user_id=? ORDER BY rowid DESC", u.id);
      const visible = await hasDarkAccess(req, db);
      return json(orders.map(r => {
        const o = JSON.parse(r.data);
        if (!visible) o.items = o.items.map(i => i.afterDark ? { ...i, name: "After Dark item", image: "/monogram.svg" } : i);
        return o;
      }));
    }
    if (path === "/api/resume" && method === "POST") {
      const o = await getOrder(db, b.id);
      if (!o || o.userId !== u.id) fail(404, "Order not found.");
      if (o.fulfillment === "event") {
        const open = await stmt(db, "SELECT 1 FROM connect_events WHERE id=? AND json_extract(data,'$.status')='published' AND julianday(json_extract(data,'$.start'))>julianday('now')",o.eventId).first();
        if (!open) fail(409,"Ticket booking has closed for this event.");
      }
      if (o.items.some(i => i.afterDark) && !await hasDarkAccess(req, db)) fail(403, "Enter After Dark to resume this payment.");
      if (
        o.status !== "Awaiting payment" ||
        !o.provider ||
        !env.RAZORPAY_KEY_ID
      )
        fail(409, "This order is not awaiting payment.");
      return json({ order: o, key: env.RAZORPAY_KEY_ID });
    }
    if (path === "/api/checkout" && method === "POST")
      return json(await newOrder(env, u, b, await hasDarkAccess(req, db)));
    if (path === "/api/verify" && method === "POST") {
      const o = await getOrder(db, b.id);
      if (!o || o.userId !== u.id) fail(404, "Order not found.");
      if (
        !env.RAZORPAY_KEY_SECRET ||
        !goodId(b.payment) ||
        !same(
          await hmac(env.RAZORPAY_KEY_SECRET, o.provider + "|" + b.payment),
          b.signature,
        )
      )
        fail(400, "Payment signature could not be verified.");
      await capture(db, o, await gateway(env, "payments/" + b.payment));
      return json({ ok: true });
    }
    if (path === "/api/contact" && method === "POST") {
      if (!clean(b.message)) fail(400, "Enter a message.");
      const id = crypto.randomUUID();
      await stmt(
        db,
        "INSERT INTO messages VALUES(?,?,?)",
        id,
        u.id,
        JSON.stringify({
          email: u.email,
          message: clean(b.message, 2000),
          created: new Date().toISOString(),
        }),
      ).run();
      return json({ ok: true });
    }
    const role = await permissions(env, u);
    if (!["manager", "admin"].includes(role))
      fail(403, "Store team access is required.");
    if (path === "/api/manage" && method === "GET") {
      const list = await catalog(db);
      return json({
        activity: await activitySettings(db),
        products: list.filter((p) => !p.kind),
        experiences: list.filter((p) => p.kind),
        orders: (
          await rows(db, "SELECT data FROM orders WHERE json_extract(data,'$.eventId') IS NULL ORDER BY rowid DESC")
        ).map((r) => JSON.parse(r.data)),
        messages: (
          await rows(db, "SELECT data FROM messages ORDER BY rowid DESC")
        ).map((r) => JSON.parse(r.data)),
        staff:
          role === "admin"
            ? await rows(
                db,
                "SELECT staff.id,staff.role,profiles.email FROM staff LEFT JOIN profiles ON profiles.id=staff.id",
              )
            : [],
      });
    }
    if (path === "/api/manage/experience" && method === "POST")
      return json(await saveExperience(db, b));
    if (path === "/api/manage/activity" && method === "POST") return json(await updateActivity(db,b));
    if (path === "/api/manage/product" && method === "POST") {
      if (b.id && (await catalog(db)).some((p) => p.id === b.id && p.kind))
        fail(409, "Edit this listing in Experiences.");
      const p = {
        id: clean(b.id, 80) || crypto.randomUUID(),
        name: clean(b.name, 100),
        category: clean(b.category),
        detail: clean(b.detail, 1600),
        spec: clean(b.spec, 700),
        image: clean(b.image, 1500),
        tag: clean(b.tag, 40),
        favourite: b.favourite === true,
        afterDark: b.afterDark === true,
        video: b.afterDark && b.video ? listingUrl(b.video, "video") : "",
        active: !!b.active,
        price: Number(b.price),
        stock: Number(b.stock),
      };
      if (!p.afterDark && p.image.startsWith("/images/after-dark/"))
        fail(400, "Choose a normal-mode image or set the audience to After Dark.");
      if (
        !goodId(p.id) ||
        !p.name ||
        !safeImage(p.image) ||
        !integer(p.price, 1, 1000000) ||
        !integer(p.stock, 0, 100000) ||
        !(await settings(db)).categories.some((c) => c.id === p.category)
      )
        fail(400, "Check the product name, category, price, stock and image.");
      await stmt(
        db,
        "INSERT INTO catalog VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        p.id,
        JSON.stringify(p),
      ).run();
      return json(p);
    }
    if (path === "/api/manage/settings" && method === "POST") {
      const s = await settings(db);
      for (const k of [
        "gardenHeadline",
        "gardenScript",
        "gardenTagline",
        "announcement",
        "eyebrow",
        "headline",
        "italic",
        "subtitle",
        "cta",
        "coupon",
        "story",
        "shipping",
        "returns",
        "contact",
      ])
        if (k in b) s[k] = clean(b[k], 1200);
      for (const k of [
        "shippingFee",
        "shippingThreshold",
        "discount",
        "length",
        "breadth",
        "height",
        "weight",
      ])
        if (k in b) {
          s[k] = Number(b[k]);
          if (
            !Number.isFinite(s[k]) ||
            s[k] < 0 ||
            s[k] > (k === "discount" ? 90 : 100000) ||
            (k !== "weight" && !Number.isInteger(s[k]))
          )
            fail(400, "Check your numeric settings.");
        }
      s.coupon = s.coupon.toUpperCase();
      if ("reels" in b) {
        if (!Array.isArray(b.reels) || b.reels.length > 16)
          fail(400, "Choose up to 16 shoppable films.");
        const ids = new Set((await catalog(db)).filter((p) => !p.kind && !p.afterDark).map((p) => p.id));
        s.reels = b.reels.map((reel) => {
          if (!reel || !ids.has(reel.productId) || !safeImage(reel.video) || !safeImage(reel.poster))
            fail(400, "Each reel needs a product, a video URL, and a poster image.");
          return { productId: reel.productId, video: clean(reel.video, 1500), poster: clean(reel.poster, 1500) };
        });
      }
      if ("heroVideo" in b) {
        if (b.heroVideo && !safeImage(b.heroVideo))
          fail(400, "Use an HTTPS video URL or a store media path.");
        s.heroVideo = clean(b.heroVideo, 1500);
      }
      if ("heroLink" in b) {
        if (
          !/^\/(?:shop|product|edit|gifting|offers)(?:\/[a-zA-Z0-9_-]+)?$/.test(
            b.heroLink,
          )
        )
          fail(400, "Choose a valid storefront destination.");
        s.heroLink = b.heroLink;
      }
      if ("edits" in b) {
        if (
          !Array.isArray(b.edits) ||
          b.edits.length > 24 ||
          new Set(b.edits.map((e) => e.id)).size !== b.edits.length
        )
          fail(400, "Each edit needs a unique ID.");
        const productIds = new Set((await catalog(db)).filter((p) => !p.kind && !p.afterDark).map((p) => p.id));
        s.edits = b.edits.map((e) => {
          if (
            !goodId(e.id) ||
            !clean(e.name) ||
            !safeImage(e.image) ||
            !Array.isArray(e.items) ||
            !e.items.length ||
            e.items.some((id) => !productIds.has(id))
          )
            fail(
              400,
              "Choose an image, name, and at least one existing product for each edit.",
            );
          return {
            id: e.id,
            name: clean(e.name, 90),
            image: clean(e.image, 1500),
            items: [...new Set(e.items)],
          };
        });
      }
      if ("gardenImage" in b) {
        if (!safeImage(b.gardenImage)) fail(400, "Choose a valid homepage illustration.");
        s.gardenImage = b.gardenImage;
      }
      if ("heroImage" in b) {
        if (!safeImage(b.heroImage))
          fail(400, "Use an HTTPS or store image URL.");
        s.heroImage = b.heroImage;
      }
      if ("categories" in b) {
        if (
          !Array.isArray(b.categories) ||
          !b.categories.length ||
          b.categories.length > 20 ||
          b.categories.some(
            (c) => !goodId(c.id) || !clean(c.name) || !safeImage(c.image),
          ) ||
          new Set(b.categories.map((c) => c.id)).size !== b.categories.length
        )
          fail(400, "Check collection IDs, names and images.");
        s.categories = b.categories.map((c) => ({
          id: c.id,
          name: clean(c.name, 70),
          short: clean(c.short || c.name, 35),
          detail: clean(c.detail, 250),
          image: clean(c.image, 1500),
        }));
        if (
          (await catalog(db)).some(
            (p) => !p.kind && p.active && !s.categories.some((c) => c.id === p.category),
          )
        )
          fail(400, "Move or hide products before removing their collection.");
      }
      if ("heroSlides" in b) {
        if (
          !Array.isArray(b.heroSlides) ||
          b.heroSlides.length > 6 ||
          b.heroSlides.some(
            (x) =>
              !safeImage(x.image) ||
              !s.categories.some((c) => c.id === x.category),
          )
        )
          fail(400, "Check slide images and collection IDs.");
        s.heroSlides = b.heroSlides.map((x) =>
          Object.fromEntries(
            [
              "eyebrow",
              "headline",
              "italic",
              "subtitle",
              "cta",
              "category",
              "image",
            ].map((k) => [k, clean(x[k], 1500)]),
          ),
        );
      }
      await stmt(
        db,
        "INSERT INTO config VALUES('store',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        JSON.stringify(s),
      ).run();
      return json(s);
    }
    if (path === "/api/manage/staff" && method === "POST") {
      if (role !== "admin") fail(403, "Administrator access is required.");
      const id = clean(b.id, 200);
      if (
        !id ||
        id === u.id ||
        !["manager", "admin", "customer", "event_manager"].includes(b.role)
      )
        fail(400, "Choose another registered account and a valid role.");
      if (!(await stmt(db, "SELECT id FROM profiles WHERE id=?", id).first()))
        fail(404, "Ask this customer to save their profile first.");
      await stmt(
        db,
        "INSERT INTO staff VALUES(?,?) ON CONFLICT(id) DO UPDATE SET role=excluded.role",
        id,
        b.role,
      ).run();
      return json({ ok: true });
    }
    if (path === "/api/manage/redeem-activity" && method === "POST") {
      const order = await getOrder(db, clean(b.id, 100));
      if (!order || order.fulfillment !== "activity") fail(404, "Activity pass not found.");
      if (order.status !== "Paid" || (order.gift && !order.gift.claimedBy))
        fail(409, "Only a paid pass held by its attendee can be redeemed.");
      const result = await stmt(db,
        "UPDATE orders SET data=json_set(data,'$.status','Redeemed','$.redeemedAt',?) WHERE id=? AND json_extract(data,'$.status')='Paid'",
        new Date().toISOString(), order.id).run();
      if (!(result.meta?.changes ?? result.changes)) fail(409, "This pass has already been redeemed.");
      return json({ ok: true });
    }
    if (path === "/api/manage/shipment" && method === "POST") {
      const o = await getOrder(db, b.id);
      if (!o) fail(404, "Order not found.");
      return json(await ship(env, o, await settings(db), b.action));
    }
    fail(404, "Page not found.");
  } catch (e) {
    return json(
      {
        error: e.status
          ? e.message
          : "The store could not complete this request.",
      },
      e.status || 500,
    );
  }
}
