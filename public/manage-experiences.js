const types = { activity: "Activity", property: "Property", spot: "Spot" };

export function manageExperiences(ctx, entries) {
  const { area, open, field, textarea, form, submit, api, esc } = ctx;
  area.innerHTML = '<div class="between"><h3>GoWinks Experience</h3><button type="button" class="btn" data-new-listing>Add listing</button></div>' +
    entries.map((item) => `<div class="admin-item"><img src="${esc(item.image)}" alt=""><div><strong>${esc(item.name)}</strong><div class="minor">${types[item.kind]} · ${esc(item.city)} · ${item.active ? item.preview ? "Preview" : "Published" : "Archived"}</div></div><button class="text-link" type="button" data-listing-id="${esc(item.id)}">Edit</button></div>`).join("");
  function edit(item = {}) {
    const kind = item.kind || "activity";
    const mode = item.active ? item.preview ? "preview" : "published" : "archived";
    const kindOptions = Object.entries(types).map(([value, name]) =>
      `<option value="${value}" ${value === kind ? "selected" : ""}>${name}</option>`).join("");
    const modes = [
      ["archived", "Archived — visible only to staff"],
      ["preview", "Preview — visible for discovery"],
      ["published", "Published — available to customers"],
    ].map(([value, name]) =>
      `<option value="${value}" ${value === mode ? "selected" : ""}>${name}</option>`).join("");
    open(item.id ? "Edit experience listing" : "Add experience listing", form(
      `<div class="form-grid">
        <label>Listing type<select name="kind" ${item.id ? "disabled" : ""}>${kindOptions}</select></label>
        <label>Publication<select name="publication">${modes}</select></label>
        ${field("name", "Listing title", item.name, "required maxlength=100")}
        ${field("city", "City or area", item.city, "required maxlength=90")}
        ${field("vibe", "Vibe (e.g. Outdoors)", item.vibe, "required maxlength=60")}
        ${field("duration", "Duration or best time to visit", item.duration, "maxlength=80")}
        ${field("location", "Venue or meeting address", item.location, "maxlength=300")}
        ${field("mapUrl", "Google Maps link", item.mapUrl, 'type="url"')}
        ${textarea("detail", "What couples can expect", item.detail || "", "required maxlength=2000")}
        ${textarea("photoUrls", "Photo URLs · one per line, cover first (up to 12)", (item.photos || []).join("\n"), "required rows=3")}
        ${field("video", "Direct video URL (MP4)", item.video)}
        ${field("reel", "Instagram reel URL", item.reel, 'type="url"')}
        <fieldset class="full" data-activity-pass><legend>Activity passes</legend>
          ${field("price", "Price per couple (₹)", item.price || "", 'type="number" min="1" max="1000000" required')}
          ${field("stock", "Total passes including existing reservations", item.stock ?? 0, 'type="number" min="0" max="100000" required')}
        </fieldset>
      </div>`
    ));
    const dialog = document.querySelector("#dialog");
    const typeSelector = dialog.querySelector('[name="kind"]');
    const passes = dialog.querySelector("[data-activity-pass]");
    const togglePassFields = () => {
      passes.hidden = typeSelector.value !== "activity";
      passes.disabled = passes.hidden;
    };
    togglePassFields();
    typeSelector.onchange = togglePassFields;
    submit(dialog, (values) => api("/api/manage/experience", {
      ...values,
      id: item.id,
      revision: item.revision,
      kind: item.kind || values.kind,
      photos: values.photoUrls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean),
      active: values.publication !== "archived",
      preview: values.publication === "preview" || (values.publication === "archived" && item.preview !== false),
    }));
  }
  area.querySelector("[data-new-listing]").onclick = () => edit();
  area.querySelectorAll("[data-listing-id]").forEach((button) => {
    button.onclick = () => edit(entries.find((item) => item.id === button.dataset.listingId));
  });
}
