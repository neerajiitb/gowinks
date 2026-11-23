import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { database } from "../server/db.mjs";
import { api } from "../server/api.mjs";

test("paid activity gifts can be claimed by their recipient and redeemed once", async (t) => {
  const owner = { id: "merchant", email: "merchant@example.test" };
  const buyer = { id: "buyer", email: "buyer@example.test" };
  const recipient = { id: "guest", email: "recipient@example.test" };
  const env = {
    DB: database(":memory:"),
    ADMIN_USER_IDS: owner.id,
    RAZORPAY_KEY_ID: "testing",
    RAZORPAY_KEY_SECRET: "secret",
    RAZORPAY_WEBHOOK_SECRET: "hook",
  };
  const call = (path, user, body) =>
    api(
      new Request("https://test.invalid/api/" + path, {
        method: body ? "POST" : "GET",
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
      user,
    );
  const store = await (await call("store", buyer)).json();
  const example = store.experiences.find((p) => p.kind === "activity");
  const checkout = {
    address: { name: "Riya", phone: "9811111111" },
    requestId: "pass1",
    items: [{ id: example.id, qty: 1 }],
    fulfillment: "activity",
    activityGift: {
      name: "Anya",
      email: recipient.email,
      phone: "+919999999999",
      message: "For us!",
    },
  };
  let amount,
    requests = 0;
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    assert.equal(url, "https://api.razorpay.com/v1/orders");
    requests++;
    amount = JSON.parse(opts.body).amount;
    return Response.json({ id: "order_activity" });
  });
  assert.equal((await call("checkout", buyer, checkout)).status, 409);
  assert.equal(
    (
      await call("manage/experience", owner, {
        ...example,
        stock: 5,
        active: true,
        preview: false,
        price: 150,
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("checkout", buyer, { ...checkout, fulfillment: null })).status,
    409,
  );
  const spot = store.experiences.find((p) => p.kind !== "activity");
  assert.equal(
    (
      await call("checkout", buyer, {
        ...checkout,
        items: [{ id: spot.id, qty: 1 }],
      })
    ).status,
    409,
  );
  const first = await call("checkout", buyer, checkout);
  assert.equal(first.status, 200);
  const { order } = await first.json();
  assert.equal(amount, 15000);
  assert.equal(order.shipping, 0);
  assert.equal(order.total, 150);
  const retry = await (await call("checkout", buyer, checkout)).json();
  assert.equal(retry.order.id, order.id);
  assert.equal(requests, 1);
  const giftPath = "activity-gifts/" + order.gift.token;
  assert.equal((await call(giftPath, recipient, {})).status, 404);
  const payload = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_activity",
          order_id: order.provider,
          amount,
          currency: "INR",
          status: "captured",
        },
      },
    },
  });
  const hook = () =>
    api(
      new Request("https://test.invalid/api/webhook", {
        method: "POST",
        body: payload,
        headers: {
          "x-razorpay-signature": createHmac("sha256", "hook")
            .update(payload)
            .digest("hex"),
        },
      }),
      env,
      null,
    );
  assert.equal((await hook()).status, 200);
  assert.equal(
    (await call("manage/shipment", owner, { id: order.id, action: "book" }))
      .status,
    409,
  );
  assert.equal(
    (await call("manage/redeem-activity", owner, { id: order.id })).status,
    409,
  );
  assert.equal((await call(giftPath, buyer, {})).status, 404);
  assert.equal((await call(giftPath, null, {})).status, 401);
  assert.equal((await (await call(giftPath, recipient)).json()).claimed, false);
  const claimed = await (await call(giftPath, recipient, {})).json();
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.sender, "Riya");
  assert.equal(claimed.recipient, "Anya");
  assert.equal(claimed.message, "For us!");
  assert.equal(claimed.email, undefined);
  assert.equal(claimed.gift, undefined);
  assert.equal((await call(giftPath, recipient, {})).status, 200);
  assert.equal(
    (await (await call("activity-gifts", recipient)).json())[0].id,
    order.id,
  );
  assert.equal(
    (await call("manage/redeem-activity", buyer, { id: order.id })).status,
    403,
  );
  assert.equal(
    (await call("manage/redeem-activity", owner, { id: order.id })).status,
    200,
  );
  assert.equal(
    (await call("manage/redeem-activity", owner, { id: order.id })).status,
    409,
  );
  assert.equal((await hook()).status, 200);
  assert.equal(
    (await (await call(giftPath, recipient)).json()).status,
    "Redeemed",
  );
});
