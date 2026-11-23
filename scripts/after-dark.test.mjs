import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../server/api.mjs";
import { database } from "../server/db.mjs";
import { hasDarkAccess } from "../server/after-dark.mjs";

test("After Dark gates the catalogue, media and checkout and revokes access on exit", async () => {
  const env = { DB: database(":memory:"), ADMIN_USER_IDS: "manager" };
  const owner = { id: "manager", email: "m@store.test" };
  const buyer = { id: "buyer", email: "b@store.test" };
  const request = (path, data, token, user) => api(new Request("https://store.test/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: token ? { "x-gw-after-dark": token } : {},
    body: data === undefined ? undefined : JSON.stringify(data),
  }), env, user);
  const catalog = token => request("after-dark/catalog", undefined, token);
  const grant = async () => (await (await request("after-dark/access", { confirmed: true })).json()).token;
  assert.equal((await catalog()).status, 403);
  assert.equal((await catalog("made-up")).status, 403);
  for (const confirmed of [false, "true", null])
    assert.deepEqual(await (await request("after-dark/access", { confirmed })).json(), { active: false });
  const token = await grant();
  const { products } = await (await catalog(token)).json();
  assert.equal(products.length, 3);
  const item = products[0];
  const store = await (await request("store")).text();
  assert.ok(!store.includes(item.name) && !store.includes("/images/after-dark/"));
  const media = new Request("https://store.test" + item.video + "?access=" + token);
  assert.ok(await hasDarkAccess(media, env.DB, true));
  const order = { items: [{ id: item.id, qty: 1 }] };
  assert.equal((await request("checkout", order, undefined, buyer)).status, 403);
  assert.equal((await request("checkout", order, token, buyer)).status, 503);
  assert.equal((await request("manage/product", { ...item, stock: 2 }, undefined, owner)).status, 200);
  assert.equal((await (await catalog(token)).json()).products[0].available, 2);
  const restrictedReel = { productId: item.id, video: item.video, poster: item.image };
  assert.equal((await request("manage/settings", { reels: [restrictedReel] }, undefined, owner)).status, 400);
  await request("after-dark/access", { confirmed: false }, token);
  assert.equal((await catalog(token)).status, 403);
  assert.equal(await hasDarkAccess(media, env.DB, true), false);
  const expired = await grant();
  env.DB.native.prepare("UPDATE after_dark_sessions SET expires=0 WHERE token=?").run(expired);
  assert.equal((await catalog(expired)).status, 403);
});
