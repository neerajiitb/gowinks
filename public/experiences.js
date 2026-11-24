import { icon } from "./icons.js";

const labels = { activity: "Activities", spot: "Spots", property: "Stays" };
const singular = { activity: "Activity", spot: "Spot", property: "Stay" };

export function mountExperiences(main, listings, id, { esc, fmt }) {
  if (id) {
    const item = listings.find((entry) => entry.id === id);
    if (!item) {
      main.innerHTML = '<section class="xp-shell xp-empty"><h1>Listing unavailable</h1><p>This experience may have been taken off the list.</p><a class="btn" href="#/experiences">Explore other experiences</a></section>';
      return;
    }
    showListing(main, item, { esc, fmt });
    return;
  }

  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const chosenKind = Object.hasOwn(labels, params.get("kind")) ? params.get("kind") : "";
  const select = (key, title, all, options) =>
    `<label>${title}<select name="${key}"><option value="">${all}</option>${options.map(value => `<option value="${esc(value)}"${value === params.get(key) ? " selected" : ""}>${esc(value)}</option>`).join("")}</select></label>`;
  const unique = key => [...new Set(listings.map(entry => entry[key]).filter(Boolean))].sort();
  const featured = listings.find(entry => entry.kind === "activity" && entry.image) || listings[0];
  main.innerHTML = `<div class="xp-directory">
    <section class="xp-cover"><div class="xp-cover-inner"><div class="xp-cover-text">
      <h1>GoWinks <span>Experience</span></h1>
      <p>Find a date for two, a spot worth sharing, or a stay for the weekend.</p>
      <a href="#/invites" class="xp-invites-link">${icon("gift")} My invitations</a>
    </div>${featured?.image ? `<img src="${esc(featured.image)}" alt="${esc(featured.name)}" class="xp-cover-photo">` : ""}</div></section>
    <div class="xp-shell"><form class="xp-filters" aria-label="Filter experiences">
      <fieldset><legend class="visually-hidden">Listing type</legend>${Object.entries({"":"All", ...labels}).map(([key,label]) => `<label><input type="radio" name="kind" value="${key}" ${key === chosenKind ? "checked" : ""}><span>${label}</span></label>`).join("")}</fieldset>
      <div class="xp-fields"><label>Search<input type="search" name="q" placeholder="Search dates, places, cities…" maxlength="100" value="${esc(params.get("q") || "")}"></label>
      ${select("city","City","All cities",unique("city"))}${select("vibe","Mood","Any mood",unique("vibe"))}
      <button type="reset" class="xp-clear">Clear filters</button></div>
    </form><section class="xp-results" aria-label="Experience listings"><p class="xp-count" role="status"></p><div class="xp-grid"></div></section></div></div>`;
  const form = main.querySelector(".xp-filters");
  function filter(updateUrl) {
    const values = Object.fromEntries(new FormData(form));
    const q = (values.q || "").trim().toLowerCase();
    const visible = listings.filter(item =>
      (!values.kind || item.kind === values.kind) && (!values.city || item.city === values.city) &&
      (!values.vibe || item.vibe === values.vibe) && (!q || [item.name, item.city, item.location, item.detail, item.vibe].join(" ").toLowerCase().includes(q)));
    if (updateUrl) {
      const query = new URLSearchParams(Object.entries(values).filter(([, value]) => value));
      window.history.replaceState(null, "", "#/experiences" + (query.size ? "?" + query : ""));
    }
    main.querySelector(".xp-count").textContent = visible.length + (visible.length === 1 ? " listing" : " listings");
    main.querySelector(".xp-grid").innerHTML = visible.map(item => `<a href="#/experiences/${esc(item.id)}" class="xp-card">
      <div class="xp-card-image"><img loading="lazy" src="${esc(item.image)}" alt=""><span>${singular[item.kind]}</span></div>
      <div class="xp-location">${esc([item.city,item.vibe].filter(Boolean).join(" · "))}</div><h2>${esc(item.name)}</h2>
      <div class="xp-card-meta">${esc(item.duration || "")}${item.kind === "activity" && !item.preview ? ` · ${fmt(item.price)} for two` : ""}${item.preview ? " · Preview" : ""}</div></a>`).join("") ||
      '<div class="xp-empty"><h2>No matches</h2><p>Try a different city, mood, or listing type.</p></div>';
  }
  form.oninput = () => filter(true);
  form.onsubmit = event => { event.preventDefault(); filter(true); };
  form.onreset = event => {
    event.preventDefault();
    form.elements.namedItem("q").value = "";
    for (const key of ["city", "vibe"]) form.elements.namedItem(key).value = "";
    form.querySelector('input[name="kind"][value=""]').checked = true;
    filter(true);
  };
  filter(false);
}

function showListing(main, item, { esc, fmt }) {
  const entries = [...new Set([item.image, ...(item.photos || [])].filter(Boolean))].map(src => ({src, type:"photo"}));
  if (item.video) entries.push({src:item.video, type:"video"});
  const isActivity = item.kind === "activity";
  const buy = "#/activity-checkout/" + esc(item.id);
  const cost = isActivity && !item.preview ? `<p class="xp-cost"><strong>${fmt(item.price)}</strong> for two</p>` : "";
  main.innerHTML = `<article class="xp-shell xp-detail">
    <a class="xp-back" href="#/experiences">${icon("left")} All experiences</a>
    <div class="xp-detail-grid"><div class="xp-gallery">
      <div class="xp-gallery-stage"></div>
      ${entries.length > 1 ? `<div class="xp-thumbs" aria-label="Listing media">${entries.map((m,i) => `<button type="button" data-media="${i}" aria-label="${m.type === "video" ? "Play listing video" : "Show photo " + (i+1)}" aria-pressed="false">${m.type === "video" ? icon("play") : `<img alt="" src="${esc(m.src)}">`}</button>`).join("")}</div>` : ""}
    </div><div class="xp-description"><p class="xp-location">${esc([singular[item.kind],item.city].filter(Boolean).join(" · "))}</p>
      <h1>${esc(item.name)}</h1><p class="xp-tags">${[item.vibe,item.duration].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join("")}</p>
      <p class="xp-copy">${esc(item.detail)}</p>
      ${item.location ? `<p><strong>Where</strong> · ${esc(item.location)}</p>` : ""}
      ${item.spec ? `<p class="xp-copy">${esc(item.spec)}</p>` : ""}
      <div class="xp-external">${item.mapUrl ? `<a href="${esc(item.mapUrl)}" target="_blank" rel="noopener noreferrer">Open map ↗</a>` : ""}
      ${item.reel ? `<a href="${esc(item.reel)}" target="_blank" rel="noopener noreferrer">Watch on Instagram ↗</a>` : ""}</div>
      ${item.preview ? '<p class="xp-preview-note">Preview listing · Bookings are closed.</p>' : ""}
      ${cost}<div class="xp-actions">
      ${isActivity && !item.preview && item.available > 0 ? `<a class="btn" href="${buy}">Buy activity</a><a class="btn outline" href="${buy}/gift">Gift this activity</a>` : ""}
      ${isActivity && !item.preview && !item.available ? "<span>Sold out</span>" : ""}
      <a class="btn outline" href="#/invite/new/${esc(item.id)}">Invite someone</a></div>
    </div></div></article>`;
  function select(index) {
    const media = entries[index];
    if (!media) return;
    main.querySelector(".xp-gallery-stage").innerHTML = media.type === "video"
      ? `<video controls playsinline preload="metadata" src="${esc(media.src)}" aria-label="${esc(item.name)} video"></video>`
      : `<img src="${esc(media.src)}" alt="${esc(item.name)} · photo ${index+1}">`;
    for (const b of main.querySelectorAll("[data-media]")) b.setAttribute("aria-pressed", String(Number(b.dataset.media) === index));
  }
  select(0);
  for (const b of main.querySelectorAll("[data-media]")) b.onclick = () => select(Number(b.dataset.media));
}
