const signedIn = (ctx) => {
  if (ctx.state.user) return true;
  ctx.main.innerHTML = `<section class="inside"><h1>Your activity pass</h1><p>Sign in to buy or claim a pass and keep it in your account.</p><button class="btn" id="pass-login">Sign in</button></section>`;
  ctx.main.querySelector("#pass-login").onclick = ctx.login;
  return false;
};

export function activityCheckout(ctx, id, gifting) {
  const { state, main, esc, fmt, field, api, launchPayment } = ctx;
  const item = state.experiences?.find((p) => p.id === id);
  if (!item || item.kind !== "activity" || item.preview || !item.available) {
    main.innerHTML =
      '<section class="inside"><h1>Activity unavailable</h1><p>This activity is currently unavailable to buy.</p><a class="text-link" href="#/experiences">Explore experiences</a></section>';
    return;
  }
  if (!signedIn(ctx)) return;
  const giftFields = gifting
    ? `<fieldset><legend>Gift recipient</legend>
    ${field("recipient", "Their name", "", "required maxlength=85")}
    ${field("email", "The email they’ll use to claim", "", "type=email required maxlength=250")}
    ${field("whatsapp", "WhatsApp number with country code (optional)", "", 'type=tel placeholder="+91…" pattern="\\+[1-9][0-9]{7,14}"')}
    <label>Gift message (optional)<textarea name="message" maxlength="240"></textarea></label></fieldset>`
    : "";
  main.innerHTML = `<section class="inside"><a class="text-link" href="#/experiences/${esc(item.id)}">Back to activity</a>
    <div class="intro"><h1>${gifting ? "Gift an activity" : "Buy an activity pass"}</h1></div>
    <form class="stack account-box" id="activity-payment"><div class="activity-pass-summary"><img src="${esc(item.image)}" alt=""><div><h2>${esc(item.name)}</h2><p>${esc([item.city, item.duration].filter(Boolean).join(" · "))}</p><strong>${fmt(item.price)} · One pass</strong></div></div>
    ${field("name", gifting ? "Your name (shown on the gift)" : "Name on your pass", state.user.name, "required maxlength=85 autocomplete=name")}
    ${field("phone", "Your mobile number", state.user.phone, 'required type=tel autocomplete=tel pattern="[0-9]{10}" maxlength=10')}
    ${giftFields}<p>${gifting ? "After payment, share the gift from My orders. Your recipient signs in to claim it." : "Your digital pass will appear in My orders after payment."}</p>
    ${state.paymentsReady ? "" : '<p class="notice">Online payments are awaiting merchant activation.</p>'}
    <p class="feedback" role="status"></p><button class="btn" ${state.paymentsReady ? "" : "disabled"}>Pay ${fmt(item.price)} with Razorpay</button></form></section>`;
  const form = main.querySelector("#activity-payment");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    if (button.disabled || !state.paymentsReady) return;
    button.disabled = true;
    const data = Object.fromEntries(new FormData(form));
    const payload = {
      fulfillment: "activity",
      items: [{ id: item.id, qty: 1 }],
      address: { name: data.name, phone: data.phone },
      ...(gifting
        ? {
            activityGift: {
              name: data.recipient,
              email: data.email,
              phone: data.whatsapp,
              message: data.message,
            },
          }
        : {}),
    };
    try {
      const fingerprint = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify([state.user.id, payload])),
          ),
        ),
      ).join("-");
      let attempt = JSON.parse(
        sessionStorage.getItem("gw.activityCheckout") || "null",
      );
      if (!attempt || attempt.fingerprint !== fingerprint) {
        attempt = { fingerprint, id: crypto.randomUUID() };
        sessionStorage.setItem("gw.activityCheckout", JSON.stringify(attempt));
      }
      const result = await api("/api/checkout", {
        ...payload,
        requestId: attempt.id,
      });
      await launchPayment(result.order, result.key);
    } catch (err) {
      form.querySelector(".feedback").textContent = err.message;
    } finally {
      button.disabled = false;
    }
  };
}

export function receivedPassCard(p, esc) {
  return `<article class="order"><div class="between"><strong>${esc(p.name)}</strong><span class="chip">${esc(p.status === "Redeemed" ? p.status : "Claimed")}</span></div><p>Gift from ${esc(p.sender)} for ${esc(p.recipient)}</p><p>Pass reference: ${esc(p.id)}</p>${p.city ? "<p>" + esc(p.city) + "</p>" : ""}${p.message ? "<p>" + esc(p.message) + "</p>" : ""}</article>`;
}

export async function activityGift(ctx, token) {
  if (!signedIn(ctx)) return;
  const { main, esc, api } = ctx;
  main.innerHTML =
    '<section class="inside"><h1>Your activity gift</h1><div role="status" class="account-box">Checking your gift…</div></section>';
  const box = main.querySelector(".account-box");
  try {
    const url = "/api/activity-gifts/" + encodeURIComponent(token);
    const pass = await api(url);
    if (!box.isConnected) return;
    if (pass.claimed) {
      box.innerHTML = receivedPassCard(pass, esc);
      return;
    }
    box.innerHTML = `<h2>${esc(pass.name)}</h2><p>${esc(pass.sender)} gifted this activity to ${esc(pass.recipient)}.</p>${pass.message ? "<p>" + esc(pass.message) + "</p>" : ""}<button class="btn">Claim my pass</button><p class="feedback" role="status"></p>`;
    box.querySelector("button").onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const claimed = await api(url, {});
        box.innerHTML =
          receivedPassCard(claimed, esc) + "<p>Saved in My orders.</p>";
      } catch (err) {
        box.querySelector(".feedback").textContent = err.message;
        button.disabled = false;
      }
    };
  } catch (err) {
    box.textContent = err.message;
  }
}

export function ownedPassInfo(o, user, esc) {
  if (o.fulfillment !== "activity") return "";
  if (!o.gift) return `<p>Digital activity pass for ${esc(o.address.name)}</p>`;
  const status = o.gift.claimedBy ? "Claimed" : "Awaiting claim";
  const canShare =
    o.status === "Paid" && !o.gift.claimedBy && user?.id === o.userId;
  const link = new URL(
    "/#/activity-gift/" + encodeURIComponent(o.gift.token),
    location.origin,
  ).href;
  const text = `${o.address.name} gifted you ${o.items[0].name} on GoWinks Experience. Claim your pass: ${link}`;
  const wa =
    "https://wa.me/" +
    (o.gift.phone || "").replace(/\D/g, "") +
    "?text=" +
    encodeURIComponent(text);
  return `<p>Gift for ${esc(o.gift.name)}${["Paid", "Redeemed"].includes(o.status) ? " · " + status : ""}</p>${canShare ? `<a class="text-link" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">Share gift on WhatsApp</a><label>Gift link<input readonly value="${esc(link)}"></label>` : ""}`;
}
