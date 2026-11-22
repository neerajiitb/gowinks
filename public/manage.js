export async function manage(ctx) {
  const {
    state,
    api,
    esc,
    fmt,
    main,
    intro,
    crumbs,
    open,
    close,
    refresh,
    toast,
    tab,
    setTab,
    render,
    orderCard,
    field,
  } = ctx;
  const s = state.settings,
    u = state.user;
  if (!u || !["manager", "admin"].includes(u.role)) {
    main.innerHTML = `<section class="inside">${crumbs("Store management")}${intro("STORE TEAM", "Store management", u ? "This account does not have a store team role. Share your account ID with the store administrator to request access." : "Sign in with a store team account to manage Go Winks.")}${u ? '<a class="btn" href="#/account">View my profile</a>' : '<button class="btn" data-act="login">Sign in</button>'}</section>`;
    return;
  }
  main.innerHTML = `<div class="inside admin">${crumbs("Store management")}${intro("STORE TEAM", "Store management")}<div class="account-tabs">${["products", "storefront", "collections", "edits", "campaigns", "orders", "messages", ...(u.role === "admin" ? ["team"] : [])].map((k) => `<button data-tab="${k}" class="${k === tab ? "current" : ""}">${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div>${state.hosted && u.role === "admin" ? '<p style="margin-bottom:20px"><a href="/go-winks-source.zip" download class="text-link">Download project source</a></p>' : ""}<div id="manage-area">Loading store data…</div></div>`;
  main
    .querySelectorAll("[data-tab]")
    .forEach((e) => (e.onclick = () => setTab(e.dataset.tab)));
  const area = main.querySelector("#manage-area");
  let data;
  try {
    data = await api("/api/manage");
  } catch (e) {
    area.textContent = e.message;
    return;
  }
  if (!area.isConnected) return;
  const textarea = (key, name, value, more = "") =>
    `<label class="full">${esc(name)}<textarea name="${key}" ${more}>${esc(value)}</textarea></label>`;
  const form = (body, button = "Save changes") =>
    `<form class="stack" data-editor>${body}<div class="feedback" role="status"></div><button class="btn">${button}</button></form>`;
  function submit(root, callback) {
    const f = root.querySelector("[data-editor]");
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = f.querySelector("button"),
        error = f.querySelector(".feedback");
      btn.disabled = true;
      error.textContent = "";
      try {
        await callback(Object.fromEntries(new FormData(f)));
        await refresh();
        close();
        render();
        toast("Changes saved");
      } catch (err) {
        error.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    };
  }
  const cats = s.categories,
    selectCat = (name, value) =>
      `<label>Collection<select name="${name}">${cats.map((c) => `<option value="${esc(c.id)}" ${c.id === value ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>`;
  function productForm(p) {
    open(
      p.id ? "Edit product" : "Add a product",
      form(
        `<div class="form-grid">${field("name", "Product name", p.name, "required maxlength=100")}${selectCat("category", p.category)}${field("price", "Price (₹)", p.price, 'required type="number" min="1" max="1000000"')}${field("stock", "Total units stocked", p.stock, 'required type="number" min="0" max="100000"')}${field("tag", "Product label", p.tag)}${field("image", "Image URL", p.image, "required")}${textarea("detail", "Description", p.detail)}${textarea("spec", "Size, ingredients or care", p.spec)}<label>Availability<select name="active"><option value="true">Visible</option><option value="false" ${p.active === false ? "selected" : ""}>Hidden</option></select></label></div>`,
      ),
    );
    submit(document.querySelector("#dialog"), (v) =>
      api("/api/manage/product", {
        ...v,
        id: p.id,
        active: v.active === "true",
      }),
    );
  }
  if (tab === "products") {
    area.innerHTML =
      '<div class="between"><h3>Product catalogue</h3><button class="btn" id="add-product">Add product</button></div>' +
      data.products
        .map(
          (p) =>
            `<div class="admin-item"><img src="${esc(p.image)}" alt=""><div><strong>${esc(p.name)}</strong><div class="minor">${fmt(p.price)} · ${p.available} available · ${p.active ? "Visible" : "Hidden"}</div></div><button class="text-link" data-edit="${esc(p.id)}">Edit</button></div>`,
        )
        .join("");
    area.querySelector("#add-product").onclick = () =>
      productForm({ price: 790, stock: 0, image: cats[0].image, active: true });
    area
      .querySelectorAll("[data-edit]")
      .forEach(
        (e) =>
          (e.onclick = () =>
            productForm(data.products.find((p) => p.id === e.dataset.edit))),
      );
    return;
  }
  if (tab === "storefront") {
    area.innerHTML = form(
      `<h3>Homepage film</h3>${field("heroVideo", "Campaign video URL", s.heroVideo)}${field("heroImage", "Video poster or still image", s.heroImage, "required")}${field("heroLink", "Campaign destination", s.heroLink, "required")}${field("announcement", "Shipping announcement", s.announcement)}<h3>Shipping & offers</h3><div class="form-grid">${field("shippingThreshold", "Free shipping threshold (₹)", s.shippingThreshold, "type=number min=0 required")}${field("shippingFee", "Standard shipping fee (₹)", s.shippingFee, "type=number min=0 required")}${field("coupon", "Offer code", s.coupon)}${field("discount", "Discount (%)", s.discount, "type=number min=0 max=90 required")}</div><h3>Shiprocket parcel defaults</h3><div class="form-grid">${[
        ["length", "Length (cm)", 20],
        ["breadth", "Breadth (cm)", 15],
        ["height", "Height (cm)", 8],
        ["weight", "Weight (kg)", 0.5],
      ]
        .map(([k, label, d]) =>
          field(k, label, s[k] ?? d, "type=number min=0.01 step=any required"),
        )
        .join("")}</div><h3>Store pages</h3>${[
        ["story", "Our story"],
        ["shipping", "Shipping policy"],
        ["returns", "Return policy"],
        ["contact", "Contact instructions"],
      ]
        .map(([k, l]) => textarea(k, l, s[k]))
        .join("")}`,
    );
    submit(area, (v) => api("/api/manage/settings", v));
    return;
  }
  if (tab === "edits") {
    const edits = s.edits || [];
    area.innerHTML =
      '<div class="between"><h3>Shoppable edits</h3><button class="btn" id="add-edit">Add edit</button></div>' +
      edits
        .map(
          (v, i) =>
            `<div class="admin-item"><img src="${esc(v.image)}" alt=""><strong>${esc(v.name)}</strong><button class="text-link" data-edit="${i}">Edit</button></div>`,
        )
        .join("");
    const editor = (i) => {
      const old = edits[i] || { id: "", name: "", image: "", items: [] };
      open(
        i < 0 ? "New shoppable edit" : "Edit collection",
        form(
          field(
            "id",
            "Edit ID",
            old.id,
            old.id ? "readonly" : "required pattern=[a-z0-9_-]+",
          ) +
            field("name", "Title", old.name, "required") +
            field("image", "Image URL", old.image, "required") +
            `<fieldset><legend>Products</legend>${data.products.map((p) => `<label class="check-row"><input name="products" type="checkbox" value="${esc(p.id)}" ${old.items.includes(p.id) ? "checked" : ""}>${esc(p.name)}</label>`).join("")}</fieldset>`,
        ),
      );
      submit(document.querySelector("#dialog"), (v) => {
        const updated = edits.slice();
        const items = [
          ...document.querySelectorAll(
            '#dialog input[name="products"]:checked',
          ),
        ].map((el) => el.value);
        updated[i < 0 ? edits.length : i] = {
          id: v.id,
          name: v.name,
          image: v.image,
          items,
        };
        return api("/api/manage/settings", { edits: updated });
      });
    };
    area.querySelector("#add-edit").onclick = () => editor(-1);
    area
      .querySelectorAll("[data-edit]")
      .forEach((el) => (el.onclick = () => editor(Number(el.dataset.edit))));
    return;
  }
  if (tab === "collections" || tab === "campaigns") {
    const isCat = tab === "collections",
      list = isCat ? cats : s.heroSlides,
      k = isCat ? "categories" : "heroSlides";
    area.innerHTML =
      `<div class="between"><h3>${isCat ? "Shop collections" : "Campaign carousel slides"}</h3><button class="btn" id="add-item">Add ${isCat ? "collection" : "slide"}</button></div>` +
      list
        .map(
          (c, i) =>
            `<div class="admin-item"><img src="${esc(c.image)}" alt=""><div>${esc(c.name || c.headline)}<div class="minor">${esc(c.id || c.eyebrow)}</div></div><button class="text-link" data-edit="${i}">Edit</button></div>`,
        )
        .join("");
    const edit = (i) => {
      const c = list[i] || {},
        body = isCat
          ? `${field("id", "Collection ID", c.id, c.id ? "readonly" : "required pattern=[a-z0-9_-]+")}${field("name", "Collection name", c.name, "required")}${field("short", "Short name", c.short)}${field("image", "Image URL", c.image, "required")}${textarea("detail", "Description", c.detail)}`
          : `${field("eyebrow", "Campaign label", c.eyebrow, "required")}${field("headline", "Headline", c.headline, "required")}${field("italic", "Italic headline", c.italic)}${textarea("subtitle", "Description", c.subtitle)}${field("image", "Image URL", c.image, "required")}${field("cta", "Button label", c.cta, "required")}${selectCat("category", c.category)}`;
      open(
        (i >= 0 ? "Edit " : "Add ") + (isCat ? "collection" : "slide"),
        form(body),
      );
      submit(document.querySelector("#dialog"), (v) => {
        const newList = [...list];
        newList[i < 0 ? list.length : i] = v;
        return api("/api/manage/settings", { [k]: newList });
      });
    };
    area.querySelector("#add-item").onclick = () => edit(-1);
    area
      .querySelectorAll("[data-edit]")
      .forEach((e) => (e.onclick = () => edit(Number(e.dataset.edit))));
    return;
  }
  if (tab === "orders") {
    area.innerHTML = data.orders.length
      ? data.orders
          .map(
            (o) =>
              `<div>${orderCard(o)}<div class="minor">${esc(o.address.name)} · ${esc(o.email)} · ${esc(o.address.phone)}<br>${esc([o.address.address, o.address.city, o.address.state, o.address.pin].join(", "))}</div>${o.status === "Paid" || o.shipment ? `<button class="btn ghost" data-ship="${esc(o.id)}" data-action="${o.shipment ? "track" : "book"}">${o.shipment ? "Refresh tracking" : "Book Shiprocket shipment"}</button>` : ""}</div>`,
          )
          .join("")
      : "<p>No orders yet. Paid orders can be booked with Shiprocket here.</p>";
    area.querySelectorAll("[data-ship]").forEach(
      (el) =>
        (el.onclick = async () => {
          el.disabled = true;
          try {
            await api("/api/manage/shipment", {
              id: el.dataset.ship,
              action: el.dataset.action,
            });
            render();
            toast("Shipment updated");
          } catch (e) {
            toast(e.message);
            el.disabled = false;
          }
        }),
    );
    return;
  }
  if (tab === "messages") {
    area.innerHTML = data.messages.length
      ? data.messages
          .map(
            (m) =>
              `<div class="order"><strong>${esc(m.email)}</strong><p>${esc(m.message)}</p><small>${esc(new Date(m.created).toLocaleString())}</small></div>`,
          )
          .join("")
      : "<p>Customer messages will appear here.</p>";
    return;
  }
  if (tab === "team") {
    area.innerHTML =
      form(
        `<h3>Assign a store role</h3><p>Use the account ID from the customer’s saved profile. Managers edit the shop and fulfil orders. Administrators also manage team access.</p>${field("id", "Account ID", "", "required")}<label>Role<select name="role"><option value="manager">Manager</option><option value="admin">Administrator</option><option value="customer">Customer</option></select></label>`,
        "Save role",
      ) +
      "<h3>Assigned roles</h3>" +
      data.staff
        .map(
          (x) =>
            `<div class="order">${esc(x.email || x.id)} · ${esc(x.role)}</div>`,
        )
        .join("");
    submit(area, (v) => api("/api/manage/staff", v));
  }
}
