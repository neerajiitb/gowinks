// Animate the new page in place, so a navigation never waits for an outgoing page.
export function createShopMotion(preference) {
  const active = new Set();
  let source;
  let petals;

  function reset() {
    petals?.remove();
    petals = null;
    for (const animation of active) animation.cancel();
    active.clear();
  }

  preference.addEventListener("change", () => {
    source = null;
    if (preference.matches) reset();
  });

  function play(element, frames, duration) {
    if (!element?.animate || preference.matches) return;
    const animation = element.animate(frames, {
      duration,
      easing: "cubic-bezier(.19, 1, .32, 1)",
    });
    active.add(animation);
    const release = () => active.delete(animation);
    animation.finished.then(release, release);
  }

  function rememberProduct(anchor, event) {
    source = null;
    if (preference.matches || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.altKey || event.shiftKey ||
        !anchor.hash.startsWith("#/product/")) return;
    const photo = anchor.closest(".product")?.querySelector(".pimage img");
    if (!photo?.complete || !photo.naturalWidth) return;
    const rect = photo.getBoundingClientRect();
    if (rect.width && rect.height && rect.bottom > 0 && rect.top < window.innerHeight)
      source = { hash: anchor.hash, url: photo.currentSrc || photo.src, rect };
  }

  function scatterPetals() {
    if (!Element.prototype.animate || document.hidden) return;
    const spray = document.createElement("div");
    spray.className = "navigation-petals";
    spray.setAttribute("aria-hidden", "true");
    petals = spray;
    document.body.append(spray);
    const flights = Array.from({ length: 7 }, (_, index) => {
      const petal = document.createElement("i");
      spray.append(petal);
      const x = index * 14 + 3;
      const drift = index % 2 ? 22 : -19;
      const turn = index % 3 * 38 - 42;
      const flight = petal.animate([
        { opacity: 0, transform: `translate(${x}vw, -12px) rotate(${turn}deg)` },
        { opacity: .85, offset: .23 },
        { opacity: 0, transform: `translate(calc(${x}vw + ${drift}px), ${85 + index % 3 * 23}px) rotate(${turn + 120}deg) rotateY(52deg)` },
      ], { duration: 820 + index % 3 * 80, delay: index % 4 * 55, easing: "ease-out" });
      return flight.finished.catch(() => {});
    });
    Promise.all(flights).then(() => {
      spray.remove();
      if (petals === spray) petals = null;
    });
  }

  function enter(main, hash) {
    const origin = source;
    source = null;
    reset();
    if (preference.matches) return;
    const section = hash.split(/[/?]/)[1] || "";
    if (["", "shop", "product", "edit", "gifting", "offers", "experiences", "connect", "wishlist"].includes(section)) scatterPetals();
    const stage = main.querySelector(".pd-main");
    const photo = stage?.querySelector("img");
    if (origin?.hash === hash && photo && (photo.currentSrc || photo.src) === origin.url) {
      const rect = stage.getBoundingClientRect();
      if (rect.width && rect.height && rect.top < window.innerHeight) {
        const x = origin.rect.left - rect.left, y = origin.rect.top - rect.top;
        const sx = origin.rect.width / rect.width, sy = origin.rect.height / rect.height;
        play(stage, [
          { transformOrigin: "top left", transform: `translate(${x}px, ${y}px) scale(${sx}, ${sy})`, opacity: 0.84 },
          { transformOrigin: "top left", transform: "none", opacity: 1 },
        ], 380);
        play(main.querySelector(".pdp-info"), [{ opacity: 0.55, translate: "0 8px" }, { opacity: 1, translate: "none" }], 260);
        return;
      }
    }
    play(main, [{ opacity: 0.68, translate: "0 7px" }, { opacity: 1, translate: "none" }], 230);
  }

  function changePhoto(photo) {
    play(photo, [{ opacity: 0.65, scale: "1.02" }, { opacity: 1, scale: "1" }], 235);
  }
  return { rememberProduct, enter, changePhoto };
}
