import { createBunnyGuide } from "./bunny-guide.js";
import { icon } from "./icons.js";

const windows = [
  { key: "boutique", route: "/", label: "Shop", title: "The Boutique", detail: "Chocolates, gifts & little luxuries", icon: "gift" },
  { key: "experience", route: "/experiences", label: "Experience", title: "Experiences", detail: "Date ideas & dreamy stays for two", icon: "spark" },
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

const bunny = `<button type="button" class="portal-bunny" aria-label="Play with the Go Winks bunny">
  <span class="bun-hello">Hey, come in!</span>
  <span class="bun-shape" aria-hidden="true"><span class="bun-pose"></span><span class="bun-kiss">♥</span></span>
</button>`;
let guide;
export function stopPortal() { guide?.dispose(); guide = null; }
let motionPaused = false;
try { motionPaused = localStorage.getItem("gw.portalMotion") === "paused"; } catch {}

export function mountPortal(main) {
  // Stock and account refreshes must not interrupt a hop already in progress.
  if (main.querySelector(".portal")) return;
  main.innerHTML = `<section class="portal" aria-labelledby="portal-title">
    <div class="portal-bar"><div class="portal-logo"><img src="/monogram.svg" alt=""><img src="/wordmark.svg" alt="Go Winks"></div>
      <div class="portal-tools"><button type="button" class="portal-motion"></button>
        <button type="button" data-act="account" class="portal-account">${icon("user")} My account</button></div></div>
    <div class="portal-intro"><h1 id="portal-title">Pick your <em>kind of fun.</em></h1>
      <p>Pick a window to explore, or tap the bunny to play.</p></div>
    <div class="portal-stage">${bunny}<div class="portal-windows">${windows.map(w =>
      `<a class="portal-choice ${w.key}" href="#${w.route}">
        <span class="portal-frame" aria-hidden="true">
          <span class="portal-scene"><img src="/images/india-${w.key}.webp" alt=""></span>
          <span class="portal-pane left"><i class="sash-handle"></i></span><span class="portal-pane right"><i class="sash-handle"></i></span>
        </span>
        <span class="portal-caption"><span class="portal-name">${icon(w.icon)}${w.title}</span>
          <span class="portal-detail">${w.detail}</span>
        </span></a>`
    ).join("")}</div></div>
  </section>`;
  const portal = main.querySelector(".portal");
  const motionToggle = portal.querySelector(".portal-motion");
  function showMotionSetting() {
    portal.classList.toggle("motion-paused", motionPaused);
    const label = motionPaused ? "Play animations" : "Pause animations";
    motionToggle.setAttribute("aria-label", label);
    motionToggle.title = label;
    motionToggle.innerHTML = icon(motionPaused ? "play" : "pause");
  }
  showMotionSetting();
  guide = createBunnyGuide(portal, matchMedia("(prefers-reduced-motion: reduce)"));
  motionToggle.addEventListener("click", () => {
    motionPaused = !motionPaused;
    try { localStorage.setItem("gw.portalMotion", motionPaused ? "paused" : "playing"); } catch {}
    showMotionSetting();
    guide.sync();
  });
  portal.addEventListener("click", event => {
    const choice = event.target.closest(".portal-choice");
    if (!choice || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (portal.classList.contains("entering")) { event.preventDefault(); return; }
    const pet = portal.querySelector(".portal-bunny");
    if (motionPaused || matchMedia("(prefers-reduced-motion: reduce)").matches || !pet.animate) return;
    event.preventDefault();
    const originalHash = location.hash;
    guide.enter();
    const start = pet.getBoundingClientRect();
    const frame = choice.querySelector(".portal-frame").getBoundingClientRect();
    const x = frame.left + frame.width / 2 - (start.left + start.width / 2);
    const y = frame.top + frame.height * .61 - (start.top + start.height / 2);
    portal.classList.add("entering");
    choice.classList.add("opening");
    // When a phone user has scrolled past the mascot, let it pop up beside the selected sill.
    const belowFold = start.bottom < 0 || start.top > innerHeight;
    const startX = belowFold ? x - frame.width * .37 : 0;
    const startY = belowFold ? y + frame.height * .22 : 0;
    const turn = x - startX < 0 ? -1 : 1;
    const transform = (dx, dy, scale, angle) =>
      `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${angle}deg)`;
    const hop = pet.animate([
      { transform: transform(startX, startY, 1, 0) },
      { transform: transform(startX, startY + 5, .89, -14 * turn), offset: .22 },
      { transform: transform(startX + (x - startX) * .48, Math.min(startY, y) - 53, 1.12, 36 * turn), offset: .65 },
      { transform: transform(x, y, .6, -16 * turn), opacity: 1, offset: .84 },
      { transform: transform(x, y - 4, .13, 9 * turn), opacity: 0 }
    ], { duration: 1150, easing: "ease-in-out", fill: "forwards" });
    hop.finished.then(() => {
      if (portal.isConnected && location.hash === originalHash) location.hash = choice.hash;
    }).catch(() => {}).finally(() => {
      portal.classList.remove("entering");
      choice.classList.remove("opening");
      hop.cancel();
    });
  });
}
