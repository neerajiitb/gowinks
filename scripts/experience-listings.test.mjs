import test from "node:test";
import assert from "node:assert/strict";
import { database } from "../server/db.mjs";
import { api } from "../server/api.mjs";

const admin = { id: "owner", email: "owner@example.test" };
const manager = { id: "manager", email: "team@example.test" };
const customer = { id: "visitor", email: "guest@example.test" };
function fixture() {
  const DB = database(":memory:");
  DB.native.prepare("INSERT INTO staff VALUES (?, ?)").run(manager.id, "manager");
  const env = { DB, ADMIN_USER_IDS: admin.id };
  return async (path, user, body) => api(new Request("https://shop.example/api/" + path, {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
  }), env, user);
}
test("managers and administrators can curate experiences independently of the merchandise catalog", async () => {
  const call = fixture();
  const initial = await (await call("store")).json();
  assert.equal(initial.products.length, 6);
  assert.equal(initial.experiences.length, 4);
  assert(initial.experiences.every((p) => p.preview));
  const seed = initial.experiences.find((p) => p.kind === "property");
  const changes = {
    ...seed, name: "Courtyard stay", preview: false, location: "Pune",
    photos: ["/images/experience-cabin.webp", "https://example.test/second.webp"],
    video: "https://example.test/property.mp4",
    reel: "https://www.instagram.com/reel/EXAMPLE001/",
  };
  assert.equal((await call("manage/experience", undefined, changes)).status, 401);
  assert.equal((await call("manage/experience", customer, changes)).status, 403);
  const saved = await (await call("manage/experience", manager, changes)).json();
  assert.equal(saved.revision, 1);
  assert.equal(saved.image, saved.photos[0]);
  assert.equal(saved.photos.length, 2);
  assert.equal((await call("manage/experience", admin, changes)).status, 409);
  assert.equal((await call("manage/experience", admin, {...saved, active: false})).status, 200);
  const publicStore = await (await call("store")).json();
  assert(!publicStore.experiences.some((p) => p.id === saved.id));
  assert(!publicStore.products.some((p) => p.kind));
  const staffView = await (await call("manage", manager)).json();
  const archived = staffView.experiences.find((p) => p.id === saved.id);
  assert.equal(archived.active, false);
  assert.equal((await call("manage/experience", admin, {...archived, active: true})).status, 200);
  const {id, ...newData} = saved;
  const created = await (await call("manage/experience", manager, {...newData, kind: "spot"})).json();
  assert(created.id && created.id !== id);
  assert.equal(created.kind, "spot");
  assert.equal((await call("manage/settings", manager, {categories: initial.settings.categories})).status, 200);
});
test("experience editors validate media, price and listing type", async () => {
  const call = fixture();
  const {products, experiences} = await (await call("store")).json();
  const activity = experiences.find((p) => p.kind === "activity");
  for (const changes of [
    {photos: []}, {photos: ["javascript:alert(1)"]}, {reel: "https://www.instagram.com.evil.example/reel/abc/"},
    {price: -100}, {stock: 1.5}, {mapUrl: "https://example.test/maps"}, {kind: "property"},
  ]) {
    const res = await call("manage/experience", admin, {...activity, ...changes});
    assert.equal(res.status, 400, JSON.stringify(changes));
  }
  assert.equal((await call("manage/experience", admin, {...activity, id: products[0].id})).status, 404);
  assert.equal((await call("manage/product", admin, {...products[0], id: activity.id})).status, 409);
});
