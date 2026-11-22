import { createServer } from "node:http";
import {
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { database } from "./db.mjs";
import { api } from "./api.mjs";
import { assetResponse } from "./asset.mjs";
const derive = promisify(scrypt),
  db = database(process.env.DATABASE_PATH || "data/store.sqlite"),
  sql = db.native,
  publicRoot = resolve("public");
const env = { ...process.env, DB: db, HOSTED: false },
  types = {
    ".css": "text/css",
    ".js": "text/javascript",
    ".html": "text/html",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".mp4": "video/mp4",
    ".ttf": "font/ttf",
    ".svg": "image/svg+xml",
  };
const attempts = new Map(),
  tokenHash = (t) => createHash("sha256").update(t).digest("hex"),
  secure = process.env.COOKIE_SECURE === "1";
export const server = createServer(async (req, res) => {
  try {
    const port = new URL("http://" + req.headers.host).host,
      url = new URL(req.url, (secure ? "https://" : "http://") + port),
      p = url.pathname;
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    if (!p.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405).end();
        return;
      }
      const path = resolve(
        publicRoot,
        "." + decodeURIComponent(p === "/" ? "/index.html" : p),
      );
      if (!path.startsWith(publicRoot + "/")) {
        res.writeHead(404).end();
        return;
      }
      try {
        const data = await readFile(path);
        const asset = assetResponse(
          { method: req.method, headers: new Headers(req.headers) },
          types[extname(path)] || "application/octet-stream",
          data,
        );
        res
          .writeHead(asset.status, Object.fromEntries(asset.headers))
          .end(
            req.method === "HEAD"
              ? undefined
              : Buffer.from(await asset.arrayBuffer()),
          );
      } catch {
        res.writeHead(404).end();
      }
      return;
    }
    const chunks = [];
    let length = 0;
    for await (const c of req) {
      length += c.length;
      if (length > 100000) {
        res.writeHead(413).end();
        return;
      }
      chunks.push(c);
    }
    const body = Buffer.concat(chunks).toString(),
      token =
        (req.headers.cookie || "").match(
          /(?:^|;\s*)gw_session=([\da-f]+)/,
        )?.[1] || "",
      user =
        sql
          .prepare(
            "SELECT users.id, users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?",
          )
          .get(tokenHash(token), Date.now()) || null;
    const reply = (code, obj, cookie) => {
      res
        .writeHead(code, {
          "content-type": "application/json",
          "cache-control": "no-store",
          ...(cookie ? { "set-cookie": cookie } : {}),
        })
        .end(JSON.stringify(obj));
    };
    if (p.startsWith("/api/auth/")) {
      if (
        req.method !== "POST" ||
        (req.headers.origin && new URL(req.headers.origin).host !== url.host)
      ) {
        reply(403, { error: "Invalid request." });
        return;
      }
      const suffix =
        "; HttpOnly; SameSite=Lax; Path=/" + (secure ? "; Secure" : "");
      if (p === "/api/auth/logout") {
        sql.prepare("DELETE FROM sessions WHERE token=?").run(tokenHash(token));
        reply(200, { ok: true }, "gw_session=; Max-Age=0" + suffix);
        return;
      }
      if (!["/api/auth/login", "/api/auth/register"].includes(p)) {
        reply(404, { error: "Unknown action." });
        return;
      }
      const ip = req.socket.remoteAddress || "local",
        now = Date.now();
      let bucket = attempts.get(ip);
      if (!bucket || now > bucket.until) {
        bucket = { n: 0, until: now + 600000 };
        attempts.set(ip, bucket);
      }
      if (++bucket.n > 50) {
        reply(429, { error: "Too many attempts. Try again in ten minutes." });
        return;
      }
      const b = JSON.parse(body),
        email = String(b.email || "")
          .trim()
          .toLowerCase(),
        pw = String(b.password || "");
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 250 ||
        pw.length < 10 ||
        pw.length > 256
      ) {
        reply(400, {
          error: "Enter a valid email and a password of 10–256 characters.",
        });
        return;
      }
      let account = sql.prepare("SELECT * FROM users WHERE email=?").get(email);
      if (p.endsWith("register")) {
        if (account) {
          reply(409, {
            error: "This email already has an account. Please sign in.",
          });
          return;
        }
        const salt = randomBytes(18).toString("hex"),
          hash = (await derive(pw, salt, 64)).toString("hex"),
          id = randomUUID();
        try {
          db.batch([
            db
              .prepare("INSERT INTO users VALUES(?,?,?,?)")
              .bind(id, email, hash, salt),
            db.prepare("INSERT INTO profiles VALUES(?,?,?)").bind(
              id,
              email,
              JSON.stringify({
                name: String(b.name || "")
                  .trim()
                  .slice(0, 100),
              }),
            ),
          ]);
        } catch {
          reply(409, { error: "This account already exists." });
          return;
        }
        account = { id };
      } else {
        const hash = await derive(pw, account?.salt || "go-winks-dummy", 64);
        if (
          !account ||
          !timingSafeEqual(hash, Buffer.from(account.hash, "hex"))
        ) {
          reply(401, { error: "The email or password is incorrect." });
          return;
        }
      }
      const session = randomBytes(32).toString("hex");
      sql
        .prepare("INSERT INTO sessions VALUES(?,?,?)")
        .run(tokenHash(session), account.id, now + 30 * 86400000);
      reply(
        200,
        { ok: true },
        "gw_session=" + session + "; Max-Age=2592000" + suffix,
      );
      return;
    }
    const wrapped = new Request(url, {
        method: req.method,
        headers: req.headers,
        ...(req.method === "POST" ? { body } : {}),
      }),
      out = await api(wrapped, env, user);
    res
      .writeHead(out.status, Object.fromEntries(out.headers))
      .end(Buffer.from(await out.arrayBuffer()));
  } catch {
    res
      .writeHead(400, { "content-type": "application/json" })
      .end(JSON.stringify({ error: "The request could not be processed." }));
  }
});
const idx = process.argv.indexOf("--port");
server.listen(
  Number(idx >= 0 ? process.argv[idx + 1] : process.env.PORT || 3000),
  "0.0.0.0",
);
