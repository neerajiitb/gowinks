// Preview inventory stays at zero until the store team adds verified stock.
export const darkProducts = [
  ["pebble", "Velvet Pebble", "Personal vibrator", "A sculptural palm-sized vibrator in a deep plum finish.", 2690],
  ["halo", "Halo for Two", "Couples’ ring", "A soft coral vibrating ring with a curved, sculptural silhouette.", 1990],
  ["ember", "Ember Melt", "Massage candle", "An amber massage candle in a small pouring vessel for slow evenings together.", 1490],
].map(([slug, name, tag, detail, price]) => ({
  id: "nocturne-" + slug, name, tag, detail, price, category: slug === "ember" ? "candles" : "rituals",
  stock: 0, active: true, afterDark: true, spec: "",
  image: "/images/after-dark/" + slug + ".webp", video: "/images/after-dark/" + slug + ".mp4",
}));

export async function hasDarkAccess(req, db, media = false) {
  const token = media ? new URL(req.url).searchParams.get("access") : req.headers.get("x-gw-after-dark");
  if (!/^[a-f0-9-]{36}$/.test(token || "")) return false;
  return !!(await db.prepare("SELECT 1 FROM after_dark_sessions WHERE token=? AND expires>?")
    .bind(token, Date.now()).first());
}
export async function darkAccessAction(req, db) {
  const body = await req.json();
  const previous = req.headers.get("x-gw-after-dark") || "";
  await db.prepare("DELETE FROM after_dark_sessions WHERE token=? OR expires<=?").bind(previous, Date.now()).run();
  const headers = { "cache-control": "private, no-store" };
  if (body.confirmed !== true) return Response.json({ active: false }, { headers });
  const token = crypto.randomUUID(), expires = Date.now() + 4 * 60 * 60 * 1000;
  await db.prepare("INSERT INTO after_dark_sessions(token,expires) VALUES(?,?)").bind(token, expires).run();
  return Response.json({ token, expires }, { headers });
}
