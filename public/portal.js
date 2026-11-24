import { icon } from "./icons.js";

const windows = [
  { key: "boutique", route: "/", label: "Shop", title: "The Boutique", detail: "Chocolates, gifts & intimate little luxuries", icon: "gift" },
  { key: "experience", route: "/experiences", label: "Experience", title: "Experiences", detail: "Date ideas, dreamy stays & places for two", icon: "spark" },
  { key: "connect", route: "/connect", label: "Connect", title: "Winks Connect", detail: "Local events, new friends & offline sparks", icon: "heart" },
];

export function moduleNav(page) {
  const active = page === "connect" ? "connect" :
    ["experiences", "invite", "invites", "activity-gift", "activity-checkout"].includes(page) ? "experience" :
    ["manage", "account"].includes(page) ? "" : "boutique";
  return '<nav class="module-nav" aria-label="Go Winks destinations"><a class="module-home" href="#/portal" aria-label="Choose a window">' +
    '<img src="/monogram.svg" alt=""></a>' + windows.map(w =>
    `<a href="#${w.route}"${active === w.key ? ' aria-current="location"' : ""}>${icon(w.icon)}${w.label}</a>`
  ).join("") + '</nav>';
}

const bunny = '<span class="portal-bunny" aria-hidden="true"><span class="bun-shape"><i class="bun-tail"></i><i class="bun-body"></i><i class="bun-ear left"></i><i class="bun-ear right"></i><i class="bun-face"></i><i class="bun-paw"></i></span></span>';

export function mountPortal(main) {
  // Stock and account refreshes must not interrupt a hop already in progress.
  if (main.querySelector(".portal")) return;
  main.innerHTML = `<section class="portal" aria-labelledby="portal-title">
    <div class="portal-bar"><div class="portal-logo"><img src="/monogram.svg" alt=""><img src="/wordmark.svg" alt="Go Winks"></div>
      <button data-act="account" class="portal-account">${icon("user")} My account</button></div>
    <div class="portal-intro"><h1 id="portal-title">Where will you <em>wander?</em></h1>
      <p>Pick a window and follow the bunny.</p></div>
    <div class="portal-stage">${bunny}<div class="portal-windows">${windows.map(w =>
      `<a class="portal-choice ${w.key}" href="#${w.route}">
        <span class="portal-frame" aria-hidden="true"><span class="portal-scene"><img src="/images/window-${w.key}.webp" alt=""></span>
          <span class="portal-pane left"></span><span class="portal-pane right"></span></span>
        <span class="portal-caption"><span class="portal-symbol" aria-hidden="true">${icon(w.icon)}</span><span class="portal-name">${w.title}</span>
        <span class="portal-detail">${w.detail}</span></span></a>`
    ).join("")}</div></div>
  </section>`;
  const portal = main.querySelector(".portal");
  portal.addEventListener("click", event => {
    const choice = event.target.closest(".portal-choice");
    if (!choice || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (portal.classList.contains("entering")) { event.preventDefault(); return; }
    const pet = portal.querySelector(".portal-bunny");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !pet.animate) return;
    event.preventDefault();
    const originalHash = location.hash;
    const start = pet.getBoundingClientRect();
    const frame = choice.querySelector(".portal-frame").getBoundingClientRect();
    const x = frame.left + frame.width / 2 - (start.left + start.width / 2);
    const y = frame.top + frame.height * .61 - (start.top + start.height / 2);
    portal.classList.add("entering");
    choice.classList.add("opening");
    const transform = (dx, dy, scale, angle) =>
      `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${angle}deg)`;
    const hop = pet.animate([
      { transform: transform(0, 0, 1, 0) },
      { transform: transform(x * .5, y * .55 - 52, 1.1, x < 0 ? -11 : 11), offset: .47 },
      { transform: transform(x, y, .68, 0), opacity: 1, offset: .78 },
      { transform: transform(x, y - 4, .19, 0), opacity: 0 }
    ], { duration: 780, easing: "ease-in-out", fill: "forwards" });
    hop.finished.then(() => {
      if (portal.isConnected && location.hash === originalHash) location.hash = choice.hash;
    }).catch(() => {}).finally(() => {
      portal.classList.remove("entering");
      choice.classList.remove("opening");
      hop.cancel();
    });
  });
}
