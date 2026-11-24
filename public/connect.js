import { eventStudio } from "./connect-studio.js";

const base = "/api/connect/";
const dt = (date,opts) => new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",...opts}).format(new Date(date));
const dateLabel = d => dt(d,{weekday:"short",day:"numeric",month:"short",year:"numeric"});
const timeLabel = d => dt(d,{hour:"numeric",minute:"2-digit"});
const localDate = d => new Date(Date.parse(d)+19800000).toISOString().slice(0,10);
const detailsLink = id => "#/connect/event/"+encodeURIComponent(id);
const staff = role => ["admin","manager","event_manager"].includes(role);
const rupees = n => n ? "₹"+Number(n).toLocaleString("en-IN") : "Free";
let hostTimer, browse={city:"",category:"",date:""};
export function stopConnect(){clearTimeout(hostTimer);}
function gcal(e) {
  const stamp=d=>d.replace(/[-:]/g,"").replace(/\.\d{3}/,"");
  return "https://calendar.google.com/calendar/render?"+new URLSearchParams({action:"TEMPLATE",text:e.title,dates:stamp(e.start)+"/"+stamp(e.end),location:e.venue+", "+e.address,details:e.description});
}
export async function mountConnect(ctx) {
  const {main,state,route,api,esc:E,login,launchPayment}=ctx;
  const [,,page,id]=route;
  main.innerHTML='<div class="wc"><div class="wc-content" role="status">Loading Winks Connect…</div></div>';
  const root=main.firstElementChild;
  const nav=()=>`<nav class="wc-nav" aria-label="Winks Connect"><a class="wc-word" href="#/connect">Winks <i>Connect</i></a><div><a href="#/connect/me">My tickets & profile</a>${state.user?'<a href="#/connect/host">Host desk</a>':''}${staff(state.user?.role)?'<a href="#/connect/studio">Event studio</a>':''}</div></nav>`;
  const show=html=>{if(root.isConnected) root.innerHTML=nav()+html;};
  const $=s=>root.querySelector(s);
  const note=msg=>{const node=$(".wc-feedback"); if(node) node.textContent=msg;};
  const feedback='<p class="wc-feedback" role="status"></p>';
  const signed=()=>{if(state.user)return true;show('<div class="wc-content"><h1>Your Winks Connect</h1><p>Sign in to book tickets, join the event conversation and view your bookings.</p><button class="wc-primary" data-login>Sign in</button></div>');$("[data-login]").onclick=login;return false;};
  const reload=()=>{if(root.isConnected){stopConnect();mountConnect(ctx);}};
  const busy=async(btn,fn)=>{btn.disabled=true;try{await fn();}catch(err){note(err.message);}finally{if(btn.isConnected)btn.disabled=false;}};
  const common={api,E,show,$,root,note,feedback,reload,busy,rupees,dateLabel};
  try {
    if(page==="studio") {if(!signed())return;await eventStudio(common);return;}
    if(page==="host") {
      if(!signed())return;
      const draw=async()=>{
        const my=await api(base+"host");if(!root.isConnected)return;
        show(`<section class="wc-content"><div class="wc-head"><div><span class="wc-kicker">Organiser</span><h1>Host desk</h1></div><button class="wc-outline" data-refresh>Refresh</button></div><p>Confirmed bookings for your events. Updates every 45 seconds while this page is open.</p>${feedback}${my.map(e=>{
          const total=e.tickets.reduce((n,t)=>n+t.qty,0),checked=e.tickets.reduce((n,t)=>n+(t.checkedAt?t.qty:0),0);
          return `<article class="wc-panel"><h2>${E(e.title)}</h2><p>${dateLabel(e.start)} · ${E(e.city)}</p><div class="wc-numbers"><div><strong>${total}</strong>confirmed seats</div><div><strong>${checked}</strong>checked in</div><div><strong>${e.remaining}</strong>available</div></div>${e.tickets.map(t=>`<div class="wc-row"><div><b>${E(t.name)}</b> · ${t.qty} ticket(s)<small>${E(t.id)} · ${dateLabel(t.created)} · ${timeLabel(t.created)} IST</small></div>${t.checkedAt?'<span>Checked in</span>':`<button class="wc-outline" data-check="${E(t.id)}" data-event="${E(e.id)}">Check in group</button>`}</div>`).join("")||'<p>No confirmed bookings yet.</p>'}</article>`;
        }).join("")||'<p>Events assigned to your account will appear here.</p>'}</section>`);
        $("[data-refresh]").onclick=reload;
        for(const btn of root.querySelectorAll("[data-check]"))btn.onclick=()=>busy(btn,async()=>{await api(base+"events/"+btn.dataset.event+"/check-in",{ticket:btn.dataset.check});reload();});
      };
      await draw();
      const poll=async()=>{if(!root.isConnected)return;try{if(!document.hidden)await draw();}catch(err){note(err.message);}if(root.isConnected)hostTimer=setTimeout(poll,45000);};
      if(root.isConnected)hostTimer=setTimeout(poll,45000); return;
    }
    if(page==="member" && id) {
      const member=await api(base+"members/"+id);if(!root.isConnected)return;
      show(`<section class="wc-content wc-thread"><span class="wc-kicker">Connect profile</span><h1>${E(member.name)}</h1><p class="wc-prose">${E(member.bio)}</p><h2>Profile comments</h2>${state.user?'<form class="wc-form" data-note><label>Leave a comment<textarea name="body" required maxlength="600"></textarea></label><button class="wc-outline">Post comment</button></form><a href="#/connect/me">My Connect profile</a>':'<button class="wc-primary" data-login>Sign in to comment</button>'}${feedback}${member.notes.map(n=>`<article><b>${E(n.name)}</b> <small>${dateLabel(n.created)}</small><p class="wc-prose">${E(n.body)}</p>${n.removable?`<button class="text-link" data-note-remove="${E(n.id)}">Remove comment</button>`:""}</article>`).join("")}</section>`);
      if($("[data-login]"))$("[data-login]").onclick=login;
      const f=$("[data-note]");if(f)f.onsubmit=ev=>{ev.preventDefault();busy(f.querySelector("button"),async()=>{await api(base+"members/"+id,{body:f.elements.body.value});reload();});};
      for(const b of root.querySelectorAll("[data-note-remove]"))b.onclick=()=>busy(b,async()=>{await api(base+"members/"+id,{remove:b.dataset.noteRemove});reload();});
      return;
    }
    if(page==="me"){
      if(!signed())return;
      const [p,tickets]=await Promise.all([api(base+"profile"),api(base+"tickets")]);if(!root.isConnected)return;
      const back=new URLSearchParams(location.hash.split("?")[1]).get("event");
      show(`<div class="wc-content"><h1>Your circle</h1><div class="wc-columns"><section class="wc-panel"><h2>Connect profile</h2><p>Your display name and bio appear with your event comments. Your city helps you browse.</p><form class="wc-form" data-profile><label>Display name<input name="name" required maxlength="60" value="${E(p.name || state.user.name || "")}"></label><label>City<input name="city" maxlength="70" value="${E(p.city)}"></label><label>About you<textarea name="bio" maxlength="240">${E(p.bio)}</textarea></label><label class="wc-check"><input name="wall" type="checkbox" ${p.wall?"checked":""}> Allow people to open my profile and leave comments</label><button class="wc-primary">Save profile</button></form>${feedback}<a data-wall-link href="#/connect/member/${E(p.handle||"")}" ${p.wall?"":"hidden"}>View my public profile</a></section><section class="wc-panel"><h2>My tickets</h2>${tickets.map(t=>`<div class="wc-ticket"><b>${E(t.title)}</b><p>${E(t.venue)} · ${E(t.city)}<br>${dateLabel(t.start)} · ${timeLabel(t.start)} IST</p><p>${t.qty} ticket(s) · ${E(t.checkedAt?"Checked in":t.status)}</p><code>${E(t.id)}</code><p><a href="${detailsLink(t.eventId)}">Event details</a></p>${t.status==="Confirmed"&&!t.checkedAt&&Date.parse(t.start)>Date.now()?`<button class="wc-outline" data-cancel-ticket="${E(t.id)}">Cancel free booking</button>`:""}</div>`).join("")||'<p>Your event bookings will appear here.</p>'}</section></div></div>`);
      for(const btn of root.querySelectorAll("[data-cancel-ticket]"))btn.onclick=()=>{if(window.confirm("Cancel all seats on this free booking?"))busy(btn,async()=>{await api(base+"tickets",{cancel:btn.dataset.cancelTicket});reload();});};
      $("[data-profile]").onsubmit=e=>{e.preventDefault();const f=e.currentTarget;busy(f.querySelector("button"),async()=>{const saved=await api(base+"profile",{...Object.fromEntries(new FormData(f)),wall:f.elements.wall.checked});browse.city=saved.city;if(back)location.hash=detailsLink(back);else {note("Connect profile saved.");const wall=$("[data-wall-link]");wall.hidden=!saved.wall;wall.href="#/connect/member/"+saved.handle;}});};return;
    }
    if(page==="event" && id){
      const [detail,profile]=await Promise.all([api(base+"events/"+id),state.user?api(base+"profile"):null]);
      if(!root.isConnected)return;
      const {event:e,comments}=detail,preview=e.status==="preview";
      const profileHref="#/connect/me?event="+encodeURIComponent(id);
      const profileCTA=state.user?`<a class="wc-outline" href="${profileHref}">Set up Connect profile</a>`:'<button class="wc-outline" data-login>Sign in to join</button>';
      const closed=e.status!=="published" || Date.parse(e.start)<=Date.now();
      const map="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(e.venue+", "+e.address+", "+e.city);
      show(`<div class="wc-content"><a class="wc-back" href="#/connect">← All events</a><div class="wc-detail"><img class="wc-detail-image" src="${E(e.image)}" alt="${E(e.title)}"><div><span class="wc-kicker">${E(e.intent)}${preview?" · Preview":""}</span><h1>${E(e.title)}</h1><p>Hosted by ${E(e.host)}</p><dl class="wc-facts"><dt>When</dt><dd>${dateLabel(e.start)}<br>${timeLabel(e.start)} – ${localDate(e.start)!==localDate(e.end)?dateLabel(e.end)+" · ":""}${timeLabel(e.end)} IST</dd><dt>Where</dt><dd>${E(e.venue)} · ${E(e.city)}<br>${E(e.address)}</dd><dt>Entry</dt><dd>${rupees(e.price)} per guest</dd></dl><div class="wc-actions"><a href="${E(map)}" target="_blank" rel="noopener noreferrer">View map</a><a href="${E(gcal(e))}" target="_blank" rel="noopener noreferrer">Add to calendar</a></div></div></div><div class="wc-columns"><section><h2>About the event</h2><p class="wc-prose">${E(e.description)}</p>${e.rules?`<h3>Before you go</h3><p class="wc-prose">${E(e.rules)}</p>`:""}</section><section class="wc-panel"><h2>Get tickets</h2>${preview?'<p>Preview event. Date and venue are illustrative. Booking opens when the organiser publishes a confirmed event.</p>':closed?'<p>Booking is closed.</p>':!e.remaining?'<p>Sold out.</p>':e.price&&!state.paymentsReady?'<p>Paid bookings open once payments are activated.</p>':!profile?.name?profileCTA:`<form data-book class="wc-form"><label>Guests<select name="qty">${Array.from({length:Math.min(4,e.remaining)},(_,i)=>`<option>${i+1}</option>`).join("")}</select></label><button class="wc-primary">${e.price?"Continue to payment":"Reserve free tickets"}</button></form>`}<div class="wc-book-feedback" role="status"></div></section></div><section class="wc-thread"><h2>Event conversation</h2>${profile?.name?`<form class="wc-form" data-comment><label>Comment as ${E(profile.name)}<textarea name="body" required maxlength="600" placeholder="Ask the host or say hello…"></textarea></label><button class="wc-outline">Post comment</button></form>`:profileCTA}${feedback}${comments.map(c=>`<article><b>${c.handle?`<a href="#/connect/member/${E(c.handle)}">${E(c.name)}</a>`:E(c.name)}</b> <small>${dateLabel(c.created)}</small>${c.bio?`<details><summary>About ${E(c.name)}</summary><p>${E(c.bio)}</p></details>`:""}<p class="wc-prose">${E(c.body)}</p>${c.removable?`<button class="text-link" data-remove-comment="${E(c.id)}">Remove comment</button>`:""}</article>`).join("")}</section></div>`);
      for(const el of root.querySelectorAll("[data-login]"))el.onclick=login;
      const f=$("[data-book]");if(f)f.onsubmit=async ev=>{ev.preventDefault();const btn=f.querySelector("button");btn.disabled=true;try{const result=await api(base+"events/"+id+"/book",{qty:Number(f.elements.qty.value)});if(!root.isConnected)return;if(result.ticket)location.hash="/connect/me";else await launchPayment(result.order,result.key);}catch(err){if(root.isConnected)$(".wc-book-feedback").textContent=err.message;}finally{btn.disabled=false;}};
      const c=$("[data-comment]");if(c)c.onsubmit=ev=>{ev.preventDefault();busy(c.querySelector("button"),async()=>{await api(base+"events/"+id+"/comments",{body:c.elements.body.value});reload();});};
      for(const el of root.querySelectorAll("[data-remove-comment]"))el.onclick=()=>busy(el,async()=>{await api(base+"events/"+id+"/comments",{remove:el.dataset.removeComment});reload();});
      return;
    }
    const [{events,categories},pref]=await Promise.all([api(base+"directory"),state.user?api(base+"profile"):null]);if(!root.isConnected)return;
    const cities=[...new Set(events.map(e=>e.city))].sort();
    if(!cities.includes(browse.city))browse.city=cities.find(c=>c.toLowerCase()===(pref?.city||state.user?.city||"").toLowerCase())||"";
    if(!categories.some(c=>c.id===browse.category))browse.category="";
    show(`<section class="wc-hero"><img src="/images/winks-connect.webp" alt="Friends sharing mocktails at an evening rooftop social"><div><span class="wc-kicker">Go Winks social events</span><h1>Winks <i>Connect</i></h1><p>Make a friend, meet a spark, or find your next circle.</p><button class="wc-hero-btn" data-discover>Explore events</button></div></section><section class="wc-content" id="wc-discover"><div class="wc-head"><h2>Find your gathering</h2></div><form class="wc-filters"><label>City<select name="city"><option value="">All cities</option>${cities.map(c=>`<option ${browse.city===c?"selected":""}>${E(c)}</option>`).join("")}</select></label><label>Event date<input name="date" type="date" value="${E(browse.date)}"></label><button class="wc-outline" type="reset">Clear filters</button><fieldset><legend>What brings you here?</legend>${[{id:"",name:"All events"},...categories].map(c=>`<label><input type="radio" name="category" value="${E(c.id)}" ${browse.category===c.id?"checked":""}><span>${E(c.name)}</span></label>`).join("")}</fieldset></form><p class="wc-count" role="status"></p><div class="wc-grid"></div></section>`);
    const form=$(".wc-filters"),draw=()=>{
      const match=events.filter(e=>(!browse.city||e.city===browse.city)&&(!browse.category||e.category===browse.category)&&(!browse.date||(localDate(e.start)<=browse.date&&localDate(e.end)>=browse.date)));
      $(".wc-count").textContent=match.length+" "+(match.length===1?"event":"events");
      $(".wc-grid").innerHTML=match.map(e=>`<a href="${detailsLink(e.id)}" class="wc-card"><div><img src="${E(e.image)}" loading="lazy" alt=""><time datetime="${E(e.start)}"><b>${dt(e.start,{day:"2-digit"})}</b>${dt(e.start,{month:"short"})}</time></div><section><span class="wc-kicker">${E(e.intent)}</span><h3>${E(e.title)}</h3><p>${E(e.city)} · ${timeLabel(e.start)} IST</p><small>${e.status==="preview"?"Preview · bookings closed":Date.parse(e.start)<=Date.now()?"Booking closed":e.remaining?rupees(e.price)+" entry":"Sold out"}</small></section></a>`).join("")||'<p>No events match these filters. Try another city or date.</p>';
    };
    form.onchange=()=>{browse=Object.fromEntries(new FormData(form));draw();};
    form.onreset=ev=>{ev.preventDefault();browse={city:"",category:"",date:""};form.elements.city.value="";form.elements.date.value="";form.querySelector('[name=category][value=""]').checked=true;draw();};
    $("[data-discover]").onclick=()=>$("#wc-discover").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
    draw();
  }catch(err){if(root.isConnected)show('<div class="wc-content"><h1>Winks Connect</h1><p role="alert">'+E(err.message)+'</p><a href="#/connect">Browse events</a></div>');}
}
