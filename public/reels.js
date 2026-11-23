import { icon } from "./icons.js";

export function watchShop(settings, products, esc) {
  const cards = (settings.reels || []).map((reel) => {
    const p = products.find((item) => item.id === reel.productId && item.active !== false);
    if (!p) return "";
    return `<article class="shop-reel">
      <video muted playsinline loop controls preload="none" poster="${esc(reel.poster)}" data-film="${esc(reel.video)}" aria-label="${esc(p.name)} product film"></video>
      <a href="#/product/${esc(p.id)}" class="shop-reel-product">
        <img src="${esc(p.image)}" alt="" loading="lazy"><strong>${esc(p.name)}</strong>${icon("right")}
      </a>
    </article>`;
  }).join("");
  if (!cards) return "";
  return `<section class="watch-shop" aria-labelledby="watch-shop-title">
    <h2 id="watch-shop-title">Watch &amp; Shop</h2>
    <div class="reels-frame">
      <div class="reels-track" role="region" aria-label="Shoppable product films" tabindex="0">${cards}</div>
      <button class="reels-previous" type="button" aria-label="Previous product films" disabled>${icon("left")}</button>
      <button class="reels-next" type="button" aria-label="Next product films">${icon("right")}</button>
    </div>
  </section>`;
}

export function mountReels(section, reducedMotion) {
  if (!section) return;
  const track = section.querySelector(".reels-track");
  const prev = section.querySelector(".reels-previous");
  const next = section.querySelector(".reels-next");
  const films = [...track.querySelectorAll("video")];
  const visible = new Set();
  const updateArrows = () => {
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
  };
  const step = (direction) => {
    const width = track.firstElementChild.getBoundingClientRect().width;
    const gap = parseFloat(window.getComputedStyle(track).gap) || 0;
    track.scrollBy({left: direction * (width + gap), behavior: reducedMotion.matches ? "auto" : "smooth"});
  };
  prev.onclick = () => step(-1);
  next.onclick = () => step(1);
  let drag, dragged = false;
  track.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    dragged = false;
    if (event.target.tagName === "VIDEO" &&
        event.clientY >= event.target.getBoundingClientRect().bottom - 48) return;
    drag = { start: event.clientX, scroll: track.scrollLeft, id: event.pointerId };
  });
  track.addEventListener("pointermove", (event) => {
    if (!drag || !event.buttons) { drag = null; return; }
    const distance = event.clientX - drag.start;
    if (!dragged && Math.abs(distance) < 6) return;
    dragged = true;
    track.setPointerCapture(drag.id);
    track.classList.add("dragging");
    track.scrollLeft = drag.scroll - distance;
    event.preventDefault();
  });
  const endDrag = () => {
    drag = null;
    track.classList.remove("dragging");
  };
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);
  track.addEventListener("click", (e) => {
    if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; }
  }, true);
  track.addEventListener("dragstart", (e) => e.preventDefault());
  track.addEventListener("scroll", updateArrows, {passive: true});
  window.addEventListener("resize", updateArrows);
  updateArrows();
  function sync(video) {
    if (!visible.has(video) || document.hidden) {
      video.pause();
      return;
    }
    if (!video.hasAttribute("src")) video.src = video.dataset.film;
    if (!reducedMotion.matches) video.play().catch(() => {});
  }
  const onVisibility = () => films.forEach(sync);
  const onPreference = () => {
    if (reducedMotion.matches) films.forEach((v) => v.pause());
    else onVisibility();
  };
  const observer = window.IntersectionObserver && new window.IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && e.intersectionRatio >= .25) visible.add(e.target);
      else visible.delete(e.target);
      sync(e.target);
    }
  }, {threshold:[0, .25]});
  for (const video of films) {
    video.muted = true;
    if (observer) observer.observe(video);
    else video.src = video.dataset.film;
  }
  document.addEventListener("visibilitychange", onVisibility);
  reducedMotion.addEventListener("change", onPreference);
  return () => {
    observer?.disconnect();
    films.forEach((v) => v.pause());
    document.removeEventListener("visibilitychange", onVisibility);
    reducedMotion.removeEventListener("change", onPreference);
    window.removeEventListener("resize", updateArrows);
  };
}
