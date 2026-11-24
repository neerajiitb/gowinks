const q = (db, sql, ...args) => db.prepare(sql).bind(...args);
const all = async (db, sql, ...args) => (await q(db,sql,...args).all()).results;
function reject(code,message) { throw Object.assign(new Error(message), {status:code}); }
function textField(v,max,required=false) {
  if (v != null && typeof v !== "string") reject(400,"Check the text fields.");
  const text=(v || "").trim();
  if ((required && !text) || text.length>max) reject(400,"Complete the required fields and check their length.");
  return text;
}
const uid = () => crypto.randomUUID();
const wide = role => ["admin","manager"].includes(role);
const team = role => wide(role) || role==="event_manager";
const confirmed = o => ["Paid","Confirmed"].includes(o.status);
const profileFor = (db,u) => q(db,"SELECT name,city,bio,handle,wall FROM connect_profiles WHERE user_id=?",u.id).first();
async function events(db) {
  const list=await all(db,`SELECT e.*, c.name AS intent, coalesce(r.used,0) AS used
    FROM connect_events e JOIN connect_categories c ON c.id=e.category
    LEFT JOIN (SELECT product_id,sum(qty) AS used FROM reservations WHERE product_id LIKE 'wc:%' GROUP BY product_id) r ON r.product_id='wc:'||e.id
    ORDER BY json_extract(e.data,'$.start')`);
  return list.map(r=>({...JSON.parse(r.data),id:r.id,category:r.category,intent:r.intent,owner:r.owner,revision:r.revision,used:r.used}));
}
function publicEvent(e) {
  const {owner,revision,used,...fields}=e;
  return {...fields,remaining:Math.max(0,e.capacity-used)};
}
function ticket(o) {
  return {id:o.id,eventId:o.eventId,title:o.items[0].name,qty:o.items[0].qty,created:o.created,
    total:o.total,start:o.eventStart,end:o.eventEnd,venue:o.eventVenue,city:o.eventCity,status:o.status,checkedAt:o.checkedAt || "",name:o.address.name};
}
const eventOrders=async(db,id)=>(await all(db,"SELECT data FROM orders WHERE json_extract(data,'$.eventId')=? ORDER BY rowid DESC",id)).map(r=>JSON.parse(r.data));
async function book(db,u,e,b,env,provider) {
  if (!u) reject(401,"Sign in to book your place.");
  const profile=await profileFor(db,u);
  if (!profile) reject(400,"Save your Connect profile before booking.");
  if(e.status!=="published" || Date.parse(e.start)<=Date.now()) reject(409,"Booking is closed for this event.");
  const previous=await q(db,`SELECT data FROM orders WHERE user_id=? AND json_extract(data,'$.eventId')=? AND json_extract(data,'$.status') NOT IN ('Cancelled','Payment setup failed')`,u.id,e.id).first();
  if(previous) {
    const o=JSON.parse(previous.data);
    if(confirmed(o)) return {ticket:ticket(o)};
    if(o.status==="Awaiting payment" && o.provider) return {order:o,key:env.RAZORPAY_KEY_ID};
    reject(409,"Your booking is being prepared. Check My tickets in a moment.");
  }
  if(!Number.isInteger(b.qty) || b.qty<1 || b.qty>4 || b.qty>e.capacity-e.used) reject(409,"Choose an available ticket quantity, up to four.");
  if(e.price && !(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)) reject(503,"Paid booking is awaiting merchant activation.");
  const id="WC-"+uid().slice(0,13).toUpperCase(), total=e.price*b.qty;
  const o={id,eventId:e.id,eventStart:e.start,eventEnd:e.end,eventVenue:e.venue,eventCity:e.city,fulfillment:"event",created:new Date().toISOString(),email:u.email,userId:u.id,address:{name:profile.name},
    items:[{id:"wc:"+e.id,name:e.title,price:e.price,qty:b.qty,image:e.image}],subtotal:total,total,discount:0,shipping:0,
    status:total?"Preparing payment":"Confirmed"};
  try {
    await db.batch([q(db,"INSERT INTO orders VALUES(?,?,?,?)",id,u.id,uid(),JSON.stringify(o)),
      q(db,"INSERT INTO reservations VALUES(?,?,?,?)",id,"wc:"+e.id,b.qty,e.capacity)]);
  } catch {reject(409,"Availability changed. Refresh the event or check My tickets.");}
  if(!total) return {ticket:ticket(o)};
  try {
    const remote=await provider({amount:total*100,currency:"INR",receipt:id});
    o.provider=remote.id;o.status="Awaiting payment";
    await q(db,"UPDATE orders SET data=? WHERE id=?",JSON.stringify(o),id).run();
  } catch(err) {
    await db.batch([q(db,"DELETE FROM reservations WHERE order_id=?",id),
      q(db,"UPDATE orders SET data=json_set(data,'$.status','Payment setup failed') WHERE id=?",id)]);
    throw err;
  }
  return {order:o,key:env.RAZORPAY_KEY_ID};
}

export async function connectApi(req,env,u,role,provider) {
  const db=env.DB, parts=new URL(req.url).pathname.slice("/api/connect/".length).split("/"),
    [action,id,operation]=parts,post=req.method==="POST",b=post?await req.json():{};
  const categories=()=>all(db,"SELECT id,name FROM connect_categories ORDER BY name");
  if(action==="profile" || action==="tickets") {
    if(!u) reject(401,"Sign in to view your Connect profile and tickets.");
    if(action==="tickets" && !post) {
      const records=await all(db,"SELECT data FROM orders WHERE user_id=? AND json_extract(data,'$.eventId') IS NOT NULL ORDER BY rowid DESC",u.id);
      return records.map(r=>ticket(JSON.parse(r.data)));
    }
    if(action==="tickets" && post && u) {
      const o=await q(db,"SELECT data FROM orders WHERE user_id=? AND id=?",u.id,b.cancel).first();
      const order=o && JSON.parse(o.data);
      if(!order?.eventId || order.status!=="Confirmed" || order.total!==0 || order.checkedAt) reject(409,"Only an unused free booking can be cancelled.");
      const updated=await db.batch([
        q(db,`UPDATE orders SET data=json_set(data,'$.status','Cancelled') WHERE id=? AND user_id=?
            AND json_extract(data,'$.status')='Confirmed' AND json_extract(data,'$.checkedAt') IS NULL
            AND EXISTS (SELECT 1 FROM connect_events WHERE id=? AND julianday(json_extract(data,'$.start'))>julianday('now'))`,order.id,u.id,order.eventId),
        q(db,`DELETE FROM reservations WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND json_extract(data,'$.status')='Cancelled')`,order.id,order.id)
      ]);
      if(!(updated[0].meta?.changes ?? updated[0].changes)) reject(409,"This booking can no longer be cancelled.");
      return {ok:true};
    }
    if(action==="profile"){
      if(post) await q(db,`INSERT INTO connect_profiles(user_id,name,city,bio,wall) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name, city=excluded.city,bio=excluded.bio,wall=excluded.wall`,
        u.id,textField(b.name,60,true),textField(b.city,70),textField(b.bio,240),b.wall===true?1:0).run();
      return (await profileFor(db,u)) || {name:"",city:"",bio:""};
    }
  }
  if(action==="members") {
    const member=await q(db,"SELECT name,bio,handle,user_id,wall FROM connect_profiles WHERE handle=?",id).first();
    if(!member?.wall) reject(404,"This profile is private.");
    const owner=member.user_id===u?.id;
    if(post) {
      if(!u) reject(401,"Sign in to comment.");
      if(b.remove) await q(db,"DELETE FROM connect_notes WHERE id=? AND handle=? AND (author=? OR ?=1)",
        b.remove,id,u.id,(owner||wide(role))?1:0).run();
      else {
        if(!await profileFor(db,u)) reject(400,"Save a Connect profile before commenting.");
        const added=await q(db,`INSERT INTO connect_notes SELECT ?,?,?,?,? WHERE NOT EXISTS
          (SELECT 1 FROM connect_notes WHERE author=? AND created>?) RETURNING id`,uid(),id,u.id,textField(b.body,600,true),
          new Date().toISOString(),u.id,new Date(Date.now()-10000).toISOString()).first();
        if(!added) reject(429,"Wait a few seconds before posting again.");
      }
      return {ok:true};
    }
    const notes=await all(db,`SELECT n.id,p.name,n.author,n.body,n.created FROM connect_notes n JOIN connect_profiles p ON p.user_id=n.author WHERE n.handle=? ORDER BY n.created DESC LIMIT 100`,id);
    return {name:member.name,bio:member.bio,notes:notes.map(({author,...n})=>({...n,removable:owner||wide(role)||author===u?.id}))};
  }
  const list=await events(db);
  if(action==="directory" && !post) return {categories:await categories(),events:list.filter(e=>["preview","published"].includes(e.status) && Date.parse(e.end)>Date.now()).map(publicEvent)};
  if(action==="host" && !post) {
    if(!u) reject(401,"Sign in to see your organiser dashboard.");
    // This endpoint never broadens its guest-list scope for administrators.
    const mine=list.filter(e=>e.owner===u.id);
    return Promise.all(mine.map(async e=>({...publicEvent(e),tickets:(await eventOrders(db,e.id)).filter(confirmed).map(ticket)})));
  }
  if(action==="studio") {
    if(!u || !team(role)) reject(403,"An event manager or store administrator account is required.");
    if(!post) return {events:list.filter(e=>wide(role)||e.owner===u.id),categories:await categories(),assign:wide(role)};
    if(id==="category") {
      const name=textField(b.name,50,true);
      if(b.id && !wide(role)) reject(403,"Only store managers and admins can rename shared categories.");
      try {
        if(b.id) await q(db,"UPDATE connect_categories SET name=? WHERE id=?",name,b.id).run();
        else await q(db,"INSERT INTO connect_categories VALUES(?,?)",uid(),name).run();
      } catch {reject(409,"That category name is already in use.");}
      return {ok:true};
    }
    if(id!=="event") reject(404,"Unknown editor.");
    const existing=b.id && list.find(e=>e.id===b.id);
    if(b.id && (!existing || (!wide(role) && existing.owner!==u.id))) reject(403,"This event is outside your management access.");
    const owner=wide(role) ? textField(b.owner,200) || u.id : u.id;
    if(owner!==u.id && !await q(db,"SELECT id FROM profiles WHERE id=?",owner).first()) reject(400,"Use the organiser’s saved Go Winks account ID.");
    const category=textField(b.category,80,true);
    if(!await q(db,"SELECT id FROM connect_categories WHERE id=?",category).first()) reject(400,"Select an existing category.");
    const e={};
    for(const [key,max] of [["title",100],["city",70],["venue",120],["address",250],["host",100],["description",2500],["rules",900],["image",1500]])
      e[key]=textField(b[key],max,key!=="rules");
    if(!/^\/images\/[\w/-]+\.webp$/.test(e.image) && !/^https:\/\/[^\s<>"\\]+$/i.test(e.image)) reject(400,"Use a store image or an HTTPS photo URL.");
    if(!["draft","preview","published","archived"].includes(b.status)) reject(400,"Choose a publication status.");
    if(!Number.isInteger(b.capacity)||b.capacity<1||b.capacity>5000||!Number.isInteger(b.price)||b.price<0||b.price>100000) reject(400,"Check the capacity and ticket price.");
    const start=Date.parse(b.start),end=Date.parse(b.end);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) reject(400,"Enter an end time later than the start.");
    Object.assign(e,{start:new Date(start).toISOString(),end:new Date(end).toISOString(),capacity:b.capacity,price:b.price,status:b.status});
    if(existing){
      const updated=await q(db,`UPDATE connect_events SET data=?,owner=?,category=?,revision=revision+1
        WHERE id=? AND revision=? AND ? >= (SELECT coalesce(sum(qty),0) FROM reservations WHERE product_id='wc:'||?) RETURNING id`,
        JSON.stringify(e),owner,category,b.id,b.revision,e.capacity,b.id).first();
      if(!updated) reject(409,"The event changed or capacity is below reserved seats. Reopen it and try again.");
    }else await q(db,"INSERT INTO connect_events(id,owner,category,data) VALUES(?,?,?,?)",uid(),owner,category,JSON.stringify(e)).run();
    return {ok:true};
  }
  if(action!=="events") reject(404,"Unknown Winks Connect page.");
  const e=list.find(x=>x.id===id);
  if(!e) reject(404,"Event not found.");
  const host=!!u && e.owner===u.id, moderate=host||wide(role);
  const guestsAllowed=["published","preview"].includes(e.status);
  if(operation==="check-in" && post) {
    if(!host) reject(403,"Only the assigned organiser can check guests in.");
    const record=await q(db,`UPDATE orders SET data=json_set(data,'$.checkedAt',?) WHERE id=? AND json_extract(data,'$.eventId')=?
      AND json_extract(data,'$.status') IN ('Paid','Confirmed') AND json_extract(data,'$.checkedAt') IS NULL AND EXISTS(SELECT 1 FROM connect_events WHERE id=? AND owner=?) RETURNING id`,
      new Date().toISOString(),b.ticket,id,id,u.id).first();
    if(!record) reject(409,"Ticket unavailable or already checked in.");
    return {ok:true};
  }
  if(!guestsAllowed && !moderate) {
    const held=!operation && !post && u && await q(db,`SELECT 1 FROM orders WHERE user_id=? AND json_extract(data,'$.eventId')=? AND json_extract(data,'$.status') IN ('Confirmed','Paid')`,u.id,id).first();
    if(!held) reject(404,"This event is unavailable.");
  }
  if(!operation && !post){
    const comments=await all(db,`SELECT c.id,p.name,p.bio,CASE WHEN p.wall=1 THEN p.handle END AS handle,c.body,c.created,c.user_id FROM connect_comments c
      JOIN connect_profiles p ON p.user_id=c.user_id WHERE event_id=? ORDER BY c.created DESC LIMIT 100`,id);
    return {event:publicEvent(e),comments:comments.map(({user_id,...c})=>({...c,removable:moderate||user_id===u?.id}))};
  }
  if(!u) reject(401,"Sign in to continue.");
  if(operation==="book" && post) return book(db,u,e,b,env,provider);
  if(operation==="comments" && post) {
    if(b.remove) {
      await q(db,"DELETE FROM connect_comments WHERE id=? AND event_id=? AND (user_id=? OR ?=1)",b.remove,id,u.id,moderate?1:0).run();
    }else{
      if(!guestsAllowed) reject(409,"Comments are closed.");
      if(!await profileFor(db,u)) reject(400,"Save a Connect profile before commenting.");
      const result=await q(db,`INSERT INTO connect_comments SELECT ?,?,?,?,? WHERE NOT EXISTS
        (SELECT 1 FROM connect_comments WHERE user_id=? AND created>?) RETURNING id`,uid(),id,u.id,textField(b.body,600,true),
        new Date().toISOString(),u.id,new Date(Date.now()-10000).toISOString()).first();
      if(!result) reject(429,"Wait a few seconds before posting again.");
    }
    return {ok:true};
  }
  reject(404,"Unknown event action.");
}
