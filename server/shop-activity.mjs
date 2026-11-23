const activityDefaults = {
  visitors: true, regional: true, viewers: true, orders: true,
  minutes: 2, orderMinutes: 30, favourites: true, hot: true, hotDays: 7, hotThreshold: 3,
  favouriteLabel: "Go Winks favourite", hotLabel: "Hot selling",
  whatsapp: false, phone: "", greeting: "Hi Go Winks! I’d love some help choosing something special.",
};
export async function activitySettings(db) {
  const row = await db.prepare("SELECT data FROM config WHERE id='activity'").bind().first();
  return { ...activityDefaults, ...(row ? JSON.parse(row.data) : {}) };
}
export async function updateActivity(db, body) {
  const next = await activitySettings(db);
  const invalid = name => { throw Object.assign(new Error("Check the setting for " + name + "."), { status: 400 }); };
  for (const k of ["visitors","regional","viewers","orders","favourites","hot","whatsapp"]) {
    if (!(k in body)) continue;
    if (typeof body[k] !== "boolean") invalid(k);
    next[k] = body[k];
  }
  for (const [k,min,max] of [["minutes",1,10],["orderMinutes",5,1440],["hotDays",1,30],["hotThreshold",1,1000]]) {
    if (!(k in body)) continue;
    if (!Number.isInteger(body[k]) || body[k]<min || body[k]>max) invalid(k);
    next[k]=body[k];
  }
  for (const [k,max] of [["favouriteLabel",36],["hotLabel",36],["greeting",350]]) {
    if (!(k in body)) continue;
    if (typeof body[k] !== "string" || !body[k].trim() || body[k].length>max) invalid(k);
    next[k]=body[k].trim();
  }
  if ("phone" in body) next.phone=String(body.phone).replace(/[\s()+-]/g,"");
  if ((next.phone || next.whatsapp) && !/^[1-9]\d{7,14}$/.test(next.phone)) invalid("international WhatsApp number");
  await db.prepare("INSERT INTO config(id,data) VALUES('activity',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data")
    .bind(JSON.stringify(next)).run();
  return next;
}
const paidSince = "json_extract(o.data,'$.payment') IS NOT NULL AND json_extract(o.data,'$.created')>=? AND json_extract(o.data,'$.status') IN ('Paid','Shipment booked','Delivered','Redeemed')";
export async function badgeProducts(db, list, cfg) {
  const hot = new Set();
  if (cfg.hot && list.length) {
    const {results} = await db.prepare(`SELECT json_extract(i.value,'$.id') AS id FROM orders o, json_each(o.data,'$.items') i
      WHERE ${paidSince} GROUP BY json_extract(i.value,'$.id') HAVING COUNT(DISTINCT o.id)>=?`)
      .bind(new Date(Date.now()-cfg.hotDays*86400000).toISOString(),cfg.hotThreshold).all();
    for(const row of results) hot.add(row.id);
  }
  return list.map(p => ({ ...p, badges: [
    ...(cfg.favourites && p.favourite ? [cfg.favouriteLabel] : []),
    ...(hot.has(p.id) ? [cfg.hotLabel] : []),
  ] }));
}
export async function shopActivity(req, db, cfg, room, product, body) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(body.visitor) || !uuid.test(body.tab)) throw Object.assign(new Error("Invalid browsing session."), {status:400});
  const now=Date.now(), cutoff=now-cfg.minutes*60000;
  // Region codes come only from trusted edge metadata. No coordinates or IPs are stored.
  const cf=req.cf, region=cfg.regional && /^[A-Z]{2}$/.test(cf?.country) && /^[A-Z0-9-]{1,8}$/.test(cf?.regionCode)
    ? cf.country+"-"+cf.regionCode : "";
  let others=0, looking=0, local=false;
  if(cfg.visitors || cfg.viewers) {
    await db.batch([
      db.prepare("DELETE FROM shop_presence WHERE seen<?").bind(now-600000),
      db.prepare(`INSERT INTO shop_presence(tab,visitor,room,product,region,seen) VALUES(?,?,?,?,?,?)
        ON CONFLICT(tab) DO UPDATE SET visitor=excluded.visitor,room=excluded.room,product=excluded.product,region=excluded.region,seen=excluded.seen`)
        .bind(body.tab,body.visitor,room,cfg.viewers ? product : "",region,now),
    ]);
    const counts=await db.prepare(`SELECT COUNT(DISTINCT visitor) AS total,
      COUNT(DISTINCT CASE WHEN region=? THEN visitor END) AS nearby,
      COUNT(DISTINCT CASE WHEN product=? THEN visitor END) AS looking
      FROM shop_presence WHERE room=? AND seen>=? AND visitor<>?`).bind(region,product,room,cutoff,body.visitor).first();
    local=!!(cfg.visitors && region && counts.nearby>=3);
    others=cfg.visitors ? (local ? counts.nearby : counts.total) : 0;
    looking=cfg.viewers && product ? counts.looking : 0;
  }
  const recent=cfg.orders && !product ? await db.prepare(`SELECT COUNT(*) AS n FROM orders o WHERE ${paidSince}`)
    .bind(new Date(now-cfg.orderMinutes*60000).toISOString()).first() : null;
  return {visitors:cfg.visitors,others,local,looking,recent:recent?.n || 0,minutes:cfg.minutes,orderMinutes:cfg.orderMinutes};
}
