const localTime = iso => iso ? new Date(Date.parse(iso)+19800000).toISOString().slice(0,16) : "";
export async function eventStudio({api,E,show,$,root,note,feedback,reload,busy,dateLabel}) {
  const data=await api("/api/connect/studio");
  if(!root.isConnected)return;
  show(`<div class="wc-content"><div class="wc-head"><div><span class="wc-kicker">Event management</span><h1>Event studio</h1></div><button class="wc-primary" data-new>Create event</button></div>
    <div class="wc-columns"><section class="wc-panel"><h2>Events</h2>${data.events.map(e=>`<div class="wc-row"><div><b>${E(e.title)}</b><small>${E(e.city)} · ${dateLabel(e.start)} · ${E(e.status)}</small></div><button class="wc-outline" data-edit="${E(e.id)}">Edit</button></div>`).join("")||'<p>Create your first event to get started.</p>'}</section>
    <section class="wc-panel"><h2>Event categories</h2><p>${data.categories.map(c=>E(c.name)).join(" · ")}</p><form class="wc-form" data-category>${data.assign?`<label>Category<select name="id"><option value="">New category</option>${data.categories.map(c=>`<option value="${E(c.id)}">${E(c.name)}</option>`).join("")}</select></label>`:""}<label>Category name<input required maxlength="50" name="name"></label><button class="wc-outline">Save category</button></form>${feedback}</section></div><div data-editor></div></div>`);
  const form=$("[data-category]");
  form.onsubmit=evt=>{evt.preventDefault();busy(form.querySelector("button"),async()=>{await api("/api/connect/studio/category",Object.fromEntries(new FormData(form)));reload();});};
  function edit(e={}) {
    const field=(k,label,max,req=true)=>`<label>${label}<input name="${k}" ${req?"required":""} maxlength="${max}" value="${E(e[k]||"")}"></label>`;
    const editor=$("[data-editor]");
    editor.innerHTML=`<section class="wc-panel"><h2>${e.id?"Edit event":"New event"}</h2><form class="wc-form wc-editor"><div class="wc-field-grid">${field("title","Event name",100)}<label>Category<select name="category">${data.categories.map(c=>`<option value="${E(c.id)}" ${e.category===c.id?"selected":""}>${E(c.name)}</option>`).join("")}</select></label>
      ${field("host","Public host name",100)}${data.assign?field("owner","Organiser account ID (blank assigns to you)",200,false):""}
      ${field("city","City",70)}${field("venue","Venue name",120)}${field("address","Address for the map",250)}
      <label>Starts (India time)<input required name="start" type="datetime-local" value="${localTime(e.start)}"></label><label>Ends (India time)<input required name="end" type="datetime-local" value="${localTime(e.end)}"></label>
      <label>Seats<input required min="1" max="5000" type="number" name="capacity" value="${E(e.capacity??20)}"></label><label>Ticket price per guest (₹, 0 for free)<input required min="0" max="100000" type="number" name="price" value="${E(e.price??0)}"></label>
      <label>Publication<select name="status">${["draft","preview","published","archived"].map(s=>`<option value="${s}" ${(e.status||"draft")===s?"selected":""}>${s}</option>`).join("")}</select></label></div>
      <label>Cover image URL<input required maxlength="1500" name="image" value="${E(e.image||"/images/wings-connect.webp")}"></label>
      <label>Event description<textarea required maxlength="2500" name="description">${E(e.description||"")}</textarea></label><label>Entry requirements & house rules<textarea maxlength="900" name="rules">${E(e.rules||"")}</textarea></label><p role="status" data-editor-note></p><div class="wc-actions"><button class="wc-primary">Save event</button><button type="button" class="wc-outline" data-close-editor>Close</button></div></form></section>`;
    const f=editor.querySelector("form");f.elements.title.focus();
    editor.querySelector("[data-close-editor]").onclick=()=>{editor.replaceChildren();$("[data-new]").focus();};
    f.onsubmit=async ev=>{ev.preventDefault();const btn=f.querySelector(".wc-primary");btn.disabled=true;try{
      const v=Object.fromEntries(new FormData(f));for(const k of ["start","end"])v[k]=new Date(v[k]+":00+05:30").toISOString();
      await api("/api/connect/studio/event",{...v,id:e.id,revision:e.revision,capacity:Number(v.capacity),price:Number(v.price)});reload();
    }catch(err){editor.querySelector("[data-editor-note]").textContent=err.message;}finally{btn.disabled=false;}};
  }
  $("[data-new]").onclick=()=>edit();
  for(const btn of root.querySelectorAll("[data-edit]"))btn.onclick=()=>edit(data.events.find(e=>e.id===btn.dataset.edit));
}
