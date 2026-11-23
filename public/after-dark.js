import { badges } from "./shop-activity.js";
const key = "gw.after-dark";
let pass;
try { pass = JSON.parse(sessionStorage.getItem(key)); } catch {}
let listings, pending, revision = 0, expiryTimer, observer;
export const darkToken = () => pass && pass.expires > Date.now() ? pass.token : "";
export const darkProduct = id => darkToken() && listings?.find(p => p.id === id);
export const inDark = () => location.hash.split("/")[1] === "after-dark";
export function leaveDark(api) {
  const previous = pass;
  revision++;
  listings = pending = pass = null;
  clearTimeout(expiryTimer);
  sessionStorage.removeItem(key);
  if (previous?.token) api("/api/after-dark/access", { confirmed: false }, previous.token).catch(() => {});
}
function media(url) {
  return url?.startsWith("/images/after-dark/") ? url + "?access=" + encodeURIComponent(darkToken()) : url;
}
const gate = () => `<section class="ad-gate"><div class="ad-gate-inner"><span class="ad-moon" aria-hidden="true">☾</span><h1>After <em>Dark</em></h1><p>A private Go Winks collection for adults.<br>Are you 18 or older?</p><div class="ad-choices"><button class="ad-solid" data-confirm-age>Yes, I’m 18 or older</button><a class="ad-outline" href="#/">No, return to normal mode</a></div><small>We only remember your choice for this visit.</small><div class="ad-status" role="status"></div></div></section>`;
function film(p, esc) {
  return p.video
    ? `<video src="${esc(p.video)}" poster="${esc(p.image)}" aria-label="${esc(p.name)} product film" muted loop playsinline preload="none" controls></video>`
    : `<img src="${esc(p.image)}" alt="${esc(p.name)}">`;
}
function observeFilms(main) {
  observer?.disconnect();
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  observer = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting || document.hidden) target.pause();
      else if (!target.dataset.userPaused) target.play().catch(() => {});
    }
  }, { threshold: 0.65 });
  for (const video of main.querySelectorAll("video")) {
    video.onpause = () => {
      const rect = video.getBoundingClientRect();
      if (rect.top >= 0 && rect.bottom <= innerHeight && !document.hidden) video.dataset.userPaused = "1";
    };
    video.onplay = () => { delete video.dataset.userPaused; };
    observer.observe(video);
  }
}
export function stopDarkFilms() { observer?.disconnect(); }
export function mountDark(main, id, { api, esc, fmt, render, checkout, resume, ready, close }) {
  function scheduleExpiry() {
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => { leaveDark(api); close(); render(); }, Math.max(0, pass.expires - Date.now()));
  }
  if (!darkToken()) {
    main.innerHTML = gate();
    const button = main.querySelector("[data-confirm-age]");
    button.onclick = async () => {
      button.disabled = true;
      const current = revision;
      try {
        const result = await api("/api/after-dark/access", { confirmed: true });
        if (!inDark() || !button.isConnected || revision !== current) {
          await api("/api/after-dark/access", { confirmed: false }, result.token); return;
        }
        listings = null;
        pass = result;
        sessionStorage.setItem(key, JSON.stringify(pass));
        render();
      } catch (err) {
        main.querySelector(".ad-status")?.replaceChildren(err.message);
        button.disabled = false;
      }
    };
    return;
  }
  scheduleExpiry();
  if (!listings) {
    main.innerHTML = '<div class="ad-loading" role="status">Opening After Dark…</div>';
    if (!pending) {
      const current = revision;
      pending = api("/api/after-dark/catalog").then(({ products }) => {
        if (revision !== current || !inDark()) return;
        listings = products.map(p => ({ ...p, image: media(p.image), video: media(p.video) }));
        pending = null; render();
      }).catch(error => {
        if (revision !== current) return;
        leaveDark(api); render();
        main.querySelector(".ad-status")?.replaceChildren(error.message);
      });
    }
    return;
  }
  const href = p => "#/after-dark/" + encodeURIComponent(p.id);
  const cards = listings.map(p => `<article class="ad-card"><div class="ad-portrait">${film(p, esc)}</div><div class="ad-caption">${badges(p, esc)}<span>${esc(p.tag || "After Dark")}</span><h3><a href="${href(p)}">${esc(p.name)}</a></h3><div><strong>${fmt(p.price)}</strong><a href="${href(p)}">View product <span aria-hidden="true">›</span></a></div></div></article>`).join("");
  if (id && id !== "checkout" && id !== "resume") {
    const p = darkProduct(id);
    main.innerHTML = p ? `<section class="ad-detail"><a class="ad-back" href="#/after-dark">← After Dark collection</a><div class="ad-detail-grid"><div class="ad-portrait">${film(p, esc)}</div><div class="ad-detail-info"><span class="ad-label">${esc(p.tag || "After Dark")}</span><h1>${esc(p.name)}</h1>${badges(p, esc)}<div class="shop-live" data-live-note="product" hidden></div><strong>${fmt(p.price)}</strong><p>${esc(p.detail)}</p>${p.spec ? '<p>' + esc(p.spec) + '</p>' : ''}<button class="ad-solid" data-add="${esc(p.id)}" ${p.available ? "" : "disabled"}>${p.available ? "Add to bag" : "Currently unavailable"}</button></div></div></section>` : '<div class="ad-loading">This product is unavailable. <a href="#/after-dark">Explore the collection</a></div>';
  } else {
    const lead = listings[0];
    main.innerHTML = `<section class="ad-hero"><div class="ad-hero-copy"><span class="ad-label">Go Winks · 18+ collection</span><h1>After <em>Dark</em></h1><p>For slow nights and closer company.</p>${lead ? '<button class="ad-outline" data-explore>Explore the reels ↓</button>' : ''}</div>${lead ? `<a class="ad-cover" href="${href(lead)}"><img src="${esc(lead.image)}" alt="${esc(lead.name)}"><span>${esc(lead.name)} ›</span></a>` : ''}</section><div class="shop-live" data-live-note="store" hidden></div><section class="ad-collection" aria-labelledby="ad-collection-title"><h2 id="ad-collection-title" tabindex="-1">The night edit</h2>${cards ? '<div class="ad-grid">' + cards + '</div>' : '<p>New pieces are on their way.</p>'}</section>`;
    const explore = main.querySelector("[data-explore]");
    if (explore) explore.onclick = () => main.querySelector("#ad-collection-title").focus();
    if (id === "checkout" && ready) checkout();
    if (id === "resume" && ready) resume();
  }
  observeFilms(main);
}
