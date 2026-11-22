import {products as initialProducts,settings as initialSettings} from "../public/catalog.js";
const json=(value,status=200)=>Response.json(value,{status,headers:{"cache-control":"no-store"}});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const clean=(v,n=300)=>String(v??"").trim().slice(0,n);
const goodId=v=>/^[a-zA-Z0-9_-]{1,100}$/.test(v||"");
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const rows=async(db,sql,...args)=>(await stmt(db,sql,...args).all()).results;
const safeImage=v=>typeof v==="string"&&((v.startsWith("/images/")&&!v.includes(".."))||/^https:\/\//.test(v));
const saveOrder=(db,o)=>stmt(db,"UPDATE orders SET data=? WHERE id=?",JSON.stringify(o),o.id).run();
const getOrder=async(db,id)=>{const r=await stmt(db,"SELECT data FROM orders WHERE id=?",id).first();return r?JSON.parse(r.data):null};
async function catalog(db){
 const edits=await rows(db,"SELECT * FROM catalog"), map=new Map(initialProducts.map(p=>[p.id,{...p}]));
 for(const r of edits)map.set(r.id,JSON.parse(r.data));
 const usage=await rows(db,"SELECT product_id,SUM(qty) AS n FROM reservations GROUP BY product_id");
 for(const p of map.values())p.available=Math.max(0,p.stock-(usage.find(r=>r.product_id===p.id)?.n||0));
 return [...map.values()];
}
async function settings(db){
 const r=await stmt(db,"SELECT data FROM config WHERE id='store'").first();
 return {...initialSettings,...(r?JSON.parse(r.data):{})};
}
async function profile(db,u){
 const a=await stmt(db,"SELECT data FROM profiles WHERE id=?",u.id).first();
 return {name:u.name||"",phone:"",address:"",city:"",state:"",pin:"",wishlist:[],...(a?JSON.parse(a.data):{}),id:u.id,email:u.email};
}
async function permissions(env,u){
 if(!u)return "visitor";
 if(env.HOSTED && env.HOSTED_ADMIN_EMAIL && u.email.toLowerCase()===env.HOSTED_ADMIN_EMAIL.toLowerCase())return "admin";
 if((env.ADMIN_USER_IDS||"").split(",").map(s=>s.trim()).includes(u.id))return "admin";
 const r=await stmt(env.DB,"SELECT role FROM staff WHERE id=?",u.id).first();return r?.role||"customer";
}
function validAddress(data){
 const result=Object.fromEntries(["name","phone","address","city","state","pin"].map(k=>[k,clean(data[k],k==="address"?350:85)]));
 if(!result.name||!/^\d{10}$/.test(result.phone)||result.address.length<5||!result.city||!result.state||!/^\d{6}$/.test(result.pin))fail(400,"Enter your name, full delivery address, 10-digit mobile number and 6-digit PIN code.");
 return result;
}
async function gateway(env,path,data){
 const r=await fetch("https://api.razorpay.com/v1/"+path,{method:data?"POST":"GET",headers:{authorization:"Basic "+btoa(env.RAZORPAY_KEY_ID+":"+env.RAZORPAY_KEY_SECRET),"content-type":"application/json"},body:data?JSON.stringify(data):undefined});
 if(!r.ok)fail(502,"Razorpay could not complete this request. Please try again or contact the store with your order number.");
 return r.json();
}
async function hmac(key,str){
 const bytes=new TextEncoder(), k=await crypto.subtle.importKey("raw",bytes.encode(key),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return [...new Uint8Array(await crypto.subtle.sign("HMAC",k,bytes.encode(str)))].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function same(a,b){if(typeof b!=="string"||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}
async function capture(db,o,p){
 if(p.order_id!==o.provider||p.amount!==o.total*100||p.currency!=="INR"||p.status!=="captured")fail(409,"Payment has not been confirmed. Check your order history for updates.");
 await stmt(db,"UPDATE orders SET data=json_set(data,'$.status','Paid','$.payment',?) WHERE id=? AND json_extract(data,'$.status')='Awaiting payment'",p.id,o.id).run();
}
async function newOrder(env,u,b){
 if(!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET)fail(503,"Online payment is awaiting merchant activation. Your bag has been saved.");
 if(!goodId(b.requestId)||!Array.isArray(b.items)||!b.items.length||b.items.length>40)fail(400,"Check the items in your bag.");
 const db=env.DB,old=await stmt(db,"SELECT data FROM orders WHERE user_id=? AND request_id=?",u.id,b.requestId).first();
 if(old){const o=JSON.parse(old.data);if(o.status!=="Awaiting payment"||!o.provider)fail(409,"This checkout already exists. Review it in your orders.");return {order:o,key:env.RAZORPAY_KEY_ID}}
 const list=await catalog(db),s=await settings(db),seen=new Set(), address=validAddress(b.address);
 const items=b.items.map(i=>{const p=list.find(p=>p.active&&p.id===i.id);if(!p||seen.has(i.id)||!integer(i.qty,1,10)||i.qty>p.available)fail(409,"An item in your bag is unavailable in that quantity.");seen.add(i.id);return {id:p.id,name:p.name,price:p.price,qty:i.qty,image:p.image,capacity:p.stock}});
 const subtotal=items.reduce((a,i)=>a+i.qty*i.price,0),coupon=clean(b.coupon,32).toUpperCase();
 if(coupon&&coupon!==s.coupon)fail(400,"This offer code is no longer valid.");
 const discount=coupon?Math.round(subtotal*s.discount/100):0,shipping=subtotal>=s.shippingThreshold?0:s.shippingFee;
 const o={id:"GW-"+crypto.randomUUID().slice(0,13).toUpperCase(),created:new Date().toISOString(),email:u.email,address,items,subtotal,discount,shipping,total:subtotal-discount+shipping,coupon,note:clean(b.note,240),status:"Preparing payment",userId:u.id};
 const put=stmt(db,"INSERT INTO orders VALUES(?,?,?,?)",o.id,u.id,b.requestId,JSON.stringify(o));
 try{await db.batch([put,...items.map(i=>stmt(db,"INSERT INTO reservations VALUES(?,?,?,?)",o.id,i.id,i.qty,i.capacity))])}catch{fail(409,"The stock or checkout has changed. Refresh your bag and try again.")}
 try{const remote=await gateway(env,"orders",{amount:o.total*100,currency:"INR",receipt:o.id});o.provider=remote.id;o.status="Awaiting payment";await saveOrder(db,o)}
 catch(e){await db.batch([stmt(db,"DELETE FROM reservations WHERE order_id=?",o.id),stmt(db,"UPDATE orders SET data=json_set(data,'$.status','Payment setup failed') WHERE id=?",o.id)]);throw e}
 return {order:o,key:env.RAZORPAY_KEY_ID};
}
async function ship(env,o,s,action){
 if(!env.SHIPROCKET_EMAIL||!env.SHIPROCKET_PASSWORD||!env.SHIPROCKET_PICKUP)fail(503,"Shiprocket merchant credentials and a pickup location are required.");
 const base="https://apiv2.shiprocket.in/v1/external/", call=async(url,token,data)=>{
  const r=await fetch(base+url,{method:data?"POST":"GET",headers:{"content-type":"application/json",...(token?{authorization:"Bearer "+token}:{})},body:data?JSON.stringify(data):undefined});if(!r.ok)fail(502,"Shiprocket could not complete this request. Check merchant settings and reconcile the order in Shiprocket.");return r.json();
 };
 const {token}=await call("auth/login",null,{email:env.SHIPROCKET_EMAIL,password:env.SHIPROCKET_PASSWORD});
 if(!token)fail(502,"Shiprocket authentication failed.");
 if(action==="track"){
  if(!o.shipment)fail(409,"The shipment has not been booked.");
  const track=await call("courier/track/shipment/"+encodeURIComponent(o.shipment),token);
  const t=(Array.isArray(track)?track[0]:track)?.tracking_data, entry=t?.shipment_track?.[0];
  if(!entry)fail(409,"Tracking is pending a carrier update.");
  o.tracking={status:clean(entry.current_status),awb:clean(entry.awb_code),courier:clean(entry.courier_name),at:new Date().toISOString()};
  if(entry.current_status?.toLowerCase()==="delivered")o.status="Delivered";
 }else{
  if(o.status!=="Paid"||o.shipment)fail(409,"Only a paid order without a shipment can be booked.");
  const a=o.address,[first,...last]=a.name.split(/\s+/);
  const result=await call("orders/create/adhoc",token,{order_id:o.id,order_date:o.created.replace("T"," ").slice(0,16),pickup_location:env.SHIPROCKET_PICKUP,billing_customer_name:first,billing_last_name:last.join(" ")||first,billing_address:a.address,billing_city:a.city,billing_pincode:a.pin,billing_state:a.state,billing_country:"India",billing_email:o.email,billing_phone:a.phone,shipping_is_billing:true,order_items:o.items.map(i=>({name:i.name,sku:i.id,units:i.qty,selling_price:i.price})),payment_method:"Prepaid",shipping_charges:o.shipping,total_discount:o.discount,sub_total:o.subtotal,length:s.length||20,breadth:s.breadth||15,height:s.height||8,weight:s.weight||0.5});
  if(!result.shipment_id)fail(502,"Shiprocket has not confirmed booking. Reconcile this order in your merchant dashboard.");
  o.shipment=result.shipment_id;o.shiprocketOrder=result.order_id;o.status="Shipment booked";
 }
 await saveOrder(env.DB,o);return o;
}
export async function api(req,env,u){
 try{
 const db=env.DB,path=new URL(req.url).pathname,method=req.method;
 if(!["GET","POST"].includes(method))fail(405,"Unsupported request.");
 if(method==="POST"&&path!=="/api/webhook"&&req.headers.get("origin")&&new URL(req.headers.get("origin")).origin!==new URL(req.url).origin)fail(403,"Cross-site request denied.");
 if(path==="/api/webhook"&&method==="POST"){
  if(!env.RAZORPAY_WEBHOOK_SECRET)fail(503,"Webhook inactive.");
  const raw=await req.text();if(!same(await hmac(env.RAZORPAY_WEBHOOK_SECRET,raw),req.headers.get("x-razorpay-signature")))fail(403,"Invalid signature.");
  const event=JSON.parse(raw);if(event.event==="payment.captured"){const p=event.payload.payment.entity,r=await stmt(db,"SELECT data FROM orders WHERE json_extract(data,'$.provider')=?",p.order_id).first();if(!r)fail(404,"Order pending.");await capture(db,JSON.parse(r.data),p)}return json({ok:true});
 }
 if(method==="GET"&&path==="/api/store"){
  const [s,list,role]=await Promise.all([settings(db),catalog(db),permissions(env,u)]);
  return json({settings:s,products:list.filter(p=>p.active),user:u?{...await profile(db,u),role}:null,hosted:!!env.HOSTED,paymentsReady:!!(env.RAZORPAY_KEY_ID&&env.RAZORPAY_KEY_SECRET)});
 }
 if(!u)fail(401,"Sign in to continue.");
 const b=method==="POST"?await req.json():{};
 if(path==="/api/profile"&&method==="POST"){
 const old=await profile(db,u),newProfile={...old};
 for(const k of ["name","phone","address","city","state","pin"])if(k in b)newProfile[k]=clean(b[k],k==="address"?350:100);
 if("wishlist" in b)newProfile.wishlist=Array.isArray(b.wishlist)?[...new Set(b.wishlist.filter(goodId))].slice(0,200):[];
 await stmt(db,"INSERT INTO profiles VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,data=excluded.data",u.id,u.email,JSON.stringify(newProfile)).run();return json(newProfile);
 }
 if(path==="/api/orders"&&method==="GET")return json((await rows(db,"SELECT data FROM orders WHERE user_id=? ORDER BY rowid DESC",u.id)).map(r=>JSON.parse(r.data)));
 if(path==="/api/resume"&&method==="POST"){const o=await getOrder(db,b.id);if(!o||o.userId!==u.id)fail(404,"Order not found.");if(o.status!=="Awaiting payment"||!o.provider||!env.RAZORPAY_KEY_ID)fail(409,"This order is not awaiting payment.");return json({order:o,key:env.RAZORPAY_KEY_ID})}
 if(path==="/api/checkout"&&method==="POST")return json(await newOrder(env,u,b));
 if(path==="/api/verify"&&method==="POST"){const o=await getOrder(db,b.id);if(!o||o.userId!==u.id)fail(404,"Order not found.");if(!env.RAZORPAY_KEY_SECRET||!goodId(b.payment)||!same(await hmac(env.RAZORPAY_KEY_SECRET,o.provider+"|"+b.payment),b.signature))fail(400,"Payment signature could not be verified.");await capture(db,o,await gateway(env,"payments/"+b.payment));return json({ok:true})}
 if(path==="/api/contact"&&method==="POST"){if(!clean(b.message))fail(400,"Enter a message.");const id=crypto.randomUUID();await stmt(db,"INSERT INTO messages VALUES(?,?,?)",id,u.id,JSON.stringify({email:u.email,message:clean(b.message,2000),created:new Date().toISOString()})).run();return json({ok:true})}
 const role=await permissions(env,u);
 if(!["manager","admin"].includes(role))fail(403,"Store team access is required.");
 if(path==="/api/manage"&&method==="GET")return json({products:await catalog(db),orders:(await rows(db,"SELECT data FROM orders ORDER BY rowid DESC")).map(r=>JSON.parse(r.data)),messages:(await rows(db,"SELECT data FROM messages ORDER BY rowid DESC")).map(r=>JSON.parse(r.data)),staff:role==="admin"?await rows(db,"SELECT staff.id,staff.role,profiles.email FROM staff LEFT JOIN profiles ON profiles.id=staff.id"):[]});
 if(path==="/api/manage/product"&&method==="POST"){
 const p={id:clean(b.id,80)||crypto.randomUUID(),name:clean(b.name,100),category:clean(b.category),detail:clean(b.detail,1600),spec:clean(b.spec,700),image:clean(b.image,1500),tag:clean(b.tag,40),active:!!b.active,price:Number(b.price),stock:Number(b.stock)};
 if(!goodId(p.id)||!p.name||!safeImage(p.image)||!integer(p.price,1,1000000)||!integer(p.stock,0,100000)||!(await settings(db)).categories.some(c=>c.id===p.category))fail(400,"Check the product name, category, price, stock and image.");
 await stmt(db,"INSERT INTO catalog VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",p.id,JSON.stringify(p)).run();return json(p);
 }
 if(path==="/api/manage/settings"&&method==="POST"){
 const s=await settings(db);for(const k of ["announcement","eyebrow","headline","italic","subtitle","cta","coupon","story","shipping","returns","contact"])if(k in b)s[k]=clean(b[k],1200);
 for(const k of ["shippingFee","shippingThreshold","discount","length","breadth","height","weight"])if(k in b){s[k]=Number(b[k]);if(!Number.isFinite(s[k])||s[k]<0||s[k]>(k==="discount"?90:100000)||(k!=="weight"&&!Number.isInteger(s[k])))fail(400,"Check your numeric settings.")}
 s.coupon=s.coupon.toUpperCase();
 if("heroImage" in b){if(!safeImage(b.heroImage))fail(400,"Use an HTTPS or store image URL.");s.heroImage=b.heroImage}
 if("categories" in b){if(!Array.isArray(b.categories)||!b.categories.length||b.categories.length>20||b.categories.some(c=>!goodId(c.id)||!clean(c.name)||!safeImage(c.image))||new Set(b.categories.map(c=>c.id)).size!==b.categories.length)fail(400,"Check collection IDs, names and images.");s.categories=b.categories.map(c=>({id:c.id,name:clean(c.name,70),short:clean(c.short||c.name,35),detail:clean(c.detail,250),image:clean(c.image,1500)}));if((await catalog(db)).some(p=>p.active&&!s.categories.some(c=>c.id===p.category)))fail(400,"Move or hide products before removing their collection.");}
 if("heroSlides" in b){if(!Array.isArray(b.heroSlides)||b.heroSlides.length>6||b.heroSlides.some(x=>!safeImage(x.image)||!s.categories.some(c=>c.id===x.category)))fail(400,"Check slide images and collection IDs.");s.heroSlides=b.heroSlides.map(x=>Object.fromEntries(["eyebrow","headline","italic","subtitle","cta","category","image"].map(k=>[k,clean(x[k],1500)])))}
 await stmt(db,"INSERT INTO config VALUES('store',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",JSON.stringify(s)).run();return json(s);
 }
 if(path==="/api/manage/staff"&&method==="POST"){if(role!=="admin")fail(403,"Administrator access is required.");const id=clean(b.id,200);if(!id||id===u.id||!["manager","admin","customer"].includes(b.role))fail(400,"Choose another registered account and a valid role.");if(!(await stmt(db,"SELECT id FROM profiles WHERE id=?",id).first()))fail(404,"Ask this customer to save their profile first.");await stmt(db,"INSERT INTO staff VALUES(?,?) ON CONFLICT(id) DO UPDATE SET role=excluded.role",id,b.role).run();return json({ok:true})}
 if(path==="/api/manage/shipment"&&method==="POST"){const o=await getOrder(db,b.id);if(!o)fail(404,"Order not found.");return json(await ship(env,o,await settings(db),b.action))}
 fail(404,"Page not found.");
 }catch(e){return json({error:e.status?e.message:"The store could not complete this request."},e.status||500)}
}
