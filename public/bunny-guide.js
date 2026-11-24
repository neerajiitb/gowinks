// Frame numbers refer to the four poses in each row of the character sheet.
const poses = {
  rest: [4], walk: [0, 1, 2, 3], think: [4, 5, 5, 5],
  wink: [4, 6, 6, 4], laugh: [4, 7, 7, 4, 7, 7],
  wave: [8, 9, 8, 9, 8], kiss: [10, 10, 11, 11, 11],
};
const reactions = ["wink", "kiss", "laugh", "wave", "think"];
const moods = ["kiss", "think", "wave"];
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

export function createBunnyGuide(portal, reduceMotion) {
  const pet = portal.querySelector(".portal-bunny");
  const bubble = pet.querySelector(".bun-hello");
  const frames = [...portal.querySelectorAll(".portal-frame")];
  const effects = new Map();
  const controller = new AbortController();
  const options = { signal: controller.signal, passive: true };
  let x, y, targetX, targetY, width, height, active = 0, arriving = "wave";
  let tick = 0, idleTimer, expressionTimer, layoutTick = 0, lastTime = 0;
  let frozen = false, entering = false, reaction = 0, idleTurn = 0;
  const canMove = () => !frozen && !entering && !document.hidden;
  function act(name, greeting = "") {
    clearTimeout(expressionTimer);
    pet.dataset.mood = name;
    bubble.textContent = greeting;
    bubble.hidden = !greeting;
    if (!frozen && name !== "walk" && name !== "rest") {
      expressionTimer = setTimeout(() => act("rest"), name === "wave" ? 2300 : 1750);
    }
  }
  // CSS keyframes keep expression playback independent of pointer event frequency.
  for (const [name, sequence] of Object.entries(poses)) {
    const pose = pet.querySelector(".bun-pose");
    const keyframes = [...sequence, sequence.at(-1)].map(frame => ({
      easing: "steps(1,end)",
      backgroundPosition: ((frame % 4) * 100 / 3) + "% " + (Math.floor(frame / 4) * 50) + "%",
    }));
    const effect = pose.animate?.(keyframes, {
      duration: sequence.length * (name === "walk" ? 115 : 230),
      iterations: Infinity,
    });
    if (!effect) continue;
    effect.pause();
    effects.set(name, effect);
  }
  function showPose() {
    const name = pet.dataset.mood;
    for (const [mood, effect] of effects) {
      if (mood !== name) effect.cancel();
      else if (frozen || document.hidden || poses[name].length === 1) {
        effect.currentTime = 0;
        effect.pause();
      } else effect.play();
    }
  }
  const observer = new MutationObserver(showPose);
  observer.observe(pet, { attributes:true, attributeFilter:["data-mood"] });
  function draw() {
    pet.style.left = x.toFixed(1) + "px";
    pet.style.top = y.toFixed(1) + "px";
    pet.classList.toggle("bubble-left", x + width + 94 > innerWidth);
  }
  function update(time) {
    tick = 0;
    if (!canMove()) return;
    const dx = targetX - x, dy = targetY - y;
    const distance = Math.hypot(dx, dy);
    const dt = Math.min(48, Math.max(1, time - lastTime));
    lastTime = time;
    if (distance < 2) {
      x = targetX; y = targetY; draw();
      pet.classList.remove("going-left");
      act(arriving);
      return;
    }
    const part = Math.min(1 - Math.exp(-dt / 120), dt * .95 / distance);
    x += dx * part; y += dy * part;
    if (Math.abs(dx) > 3) pet.classList.toggle("going-left", dx < 0);
    draw();
    tick = requestAnimationFrame(update);
  }
  function move(px, py, mood) {
    targetX = clamp(px, 5, innerWidth - width - 6);
    targetY = clamp(py, 58, innerHeight - height - 44);
    arriving = mood;
    if (!canMove()) return;
    if (Math.hypot(targetX-x,targetY-y) < 10 && !tick) return;
    if (pet.dataset.mood !== "walk") act("walk");
    if (!tick) { lastTime = performance.now(); tick = requestAnimationFrame(update); }
  }
  function nearest() {
    let best = 0, min = Infinity;
    frames.forEach((frame,i) => {
      const r = frame.getBoundingClientRect();
      const distance = Math.abs(r.top + r.height * .5 - innerHeight * .48);
      if (distance < min) { min = distance; best = i; }
    });
    return best;
  }
  function perch(i, mood, snap = false) {
    active = i;
    const r = frames[i].getBoundingClientRect();
    const px = r.left - width * .74;
    const py = r.bottom - height * .86;
    if (snap) {
      x = clamp(px,5,innerWidth-width-6); y = clamp(py,58,innerHeight-height-44); draw();
    } else move(px, py, mood);
  }
  function idle() {
    clearTimeout(idleTimer);
    if (!canMove()) return;
    idleTimer = setTimeout(() => {
      if (!canMove() || pet.matches(":hover,:focus-visible")) return;
      idleTurn++;
      if (idleTurn % 2 && innerWidth > 700) perch((active + 1) % frames.length, "think");
      else act(reactions[idleTurn % reactions.length]);
      idle();
    }, 4800);
  }
  function layout() {
    layoutTick = 0;
    width = pet.offsetWidth; height = pet.offsetHeight;
    if (entering || document.hidden) return;
    const index = innerWidth <= 700 ? nearest() : active;
    perch(index, moods[index], x === undefined || frozen);
  }
  function queueLayout() {
    if (!layoutTick) layoutTick = requestAnimationFrame(layout);
    idle();
  }
  function track(event) {
    if (!canMove() || event.target.closest(".portal-bunny,button") || pet.matches(":focus-visible")) return;
    idle();
    if (event.pointerType === "mouse" && tick &&
        event.clientX >= x - 12 && event.clientX <= x + width + 12 &&
        event.clientY >= y - 12 && event.clientY <= y + height + 12) {
      halt(); act("wink"); idle(); return;
    }
    const choice = event.target.closest(".portal-choice");
    const index = frames.findIndex(f => f.parentElement === choice);
    if (index >= 0) active = index;
    const px = event.clientX, py = event.clientY;
    // Leave the pointer and tap target clear, and keep the guide close enough to reach.
    const offset = px > innerWidth * .67 ? -width - 14 : 18;
    move(px + offset, py - height * .64, index >= 0 ? moods[index] : "wink");
  }
  portal.addEventListener("pointermove", e => { if (e.pointerType !== "touch") track(e); }, options);
  portal.addEventListener("pointerdown", e => { if (e.pointerType === "touch") track(e); }, options);
  portal.addEventListener("focusin", e => {
    const i = frames.findIndex(f => f.parentElement === e.target);
    if (i >= 0 && canMove()) { perch(i, moods[i]); idle(); }
  }, options);
  function halt() {
    cancelAnimationFrame(tick); tick = 0;
    clearTimeout(idleTimer); clearTimeout(expressionTimer);
    pet.classList.remove("going-left");
  }
  pet.addEventListener("pointerenter", () => {
    if (!canMove()) return;
    halt(); act("wink");
  }, options);
  pet.addEventListener("pointerleave", idle, options);
  pet.addEventListener("click", () => {
    if (!canMove()) return;
    halt(); act(reactions[reaction++ % reactions.length]); idle();
  }, options);
  window.addEventListener("scroll", queueLayout, options);
  window.addEventListener("resize", queueLayout, options);
  function sync() {
    halt();
    frozen = reduceMotion.matches || portal.classList.contains("motion-paused");
    layout();
    if (!document.hidden) { act(frozen ? "rest" : "wave", "Hey, come in!"); idle(); }
    showPose();
  }
  reduceMotion.addEventListener("change", sync, options);
  document.addEventListener("visibilitychange", sync, options);
  sync();
  return {
    sync,
    enter() { entering = true; halt(); act("rest"); },
    dispose() {
      entering = true; halt(); cancelAnimationFrame(layoutTick);
      controller.abort(); observer.disconnect();
      for (const effect of effects.values()) effect.cancel();
    },
  };
}
