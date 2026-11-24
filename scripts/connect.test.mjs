import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {database} from "../server/db.mjs";
import {api} from "../server/api.mjs";
const user=id=>({id,email:id+"@example.test"});
function setup(){
  const env={DB:database(":memory:"),ADMIN_USER_IDS:"admin"};
  const call=(path,id,b)=>api(new Request("https://example.test/api/"+path,{method:b?"POST":"GET",body:b?JSON.stringify(b):undefined}),env,id?user(id):null);
  const c=(p,id,b)=>call("connect/"+p,id,b);
  const fresh={title:"Evening coffee",category:"friends",venue:"Cafe",city:"Mumbai",address:"Test street",host:"Host",
    start:new Date(Date.now()+86400000).toISOString(),end:new Date(Date.now()+90000000).toISOString(),description:"Social coffee",rules:"",capacity:3,price:0,status:"published",image:"/images/hero.webp"};
  env.DB.native.prepare("INSERT INTO staff VALUES(?,?)").run("a","event_manager");
  env.DB.native.prepare("INSERT INTO staff VALUES(?,?)").run("b","event_manager");
  return {env,c,call,fresh};
}
test("Connect event editors, private organisers, ticket limits, cancellations and check-in",async()=>{
  const {env,c,call,fresh}=setup();
  assert.equal((await c("directory")).status,200);assert.equal((await (await c("directory")).json()).events.length,3);
  assert.equal((await c("studio","guest")).status,403);
  assert.equal((await call("manage","a")).status,403);
  assert.equal((await c("studio/category","a",{name:"Book club"})).status,200);
  assert.equal((await c("studio/event","a",fresh)).status,200);
  const e=(await (await c("studio","a")).json()).events[0], book="events/"+e.id+"/book";
  assert.equal((await c("studio/event","b",{...e,title:"Other"})).status,403);
  assert.equal((await c(book,"guest",{qty:2})).status,400);
  for(const id of ["guest","second"])await c("profile",id,{name:id});
  assert.equal((await c("events/rooftop-social/book","guest",{qty:1})).status,409);
  const first=await (await c(book,"guest",{qty:2})).json();
  assert.equal(first.ticket.status,"Confirmed");
  assert.equal((await (await c(book,"guest",{qty:2})).json()).ticket.id,first.ticket.id);
  assert.equal((await c(book,"second",{qty:2})).status,409);
  assert.equal((await c("tickets","guest",{cancel:first.ticket.id})).status,200);
  const second=await (await c(book,"second",{qty:3})).json();assert.equal(second.ticket.qty,3);
  assert.equal((await (await c("host","b")).json()).length,0);
  assert.equal((await (await c("host","admin")).json()).length,0);
  const h=(await (await c("host","a")).json())[0];assert.equal(h.tickets.length,1);assert.equal(h.remaining,0);
  assert.equal((await (await call("manage","admin")).json()).orders.length,0);
  assert.equal((await c("events/"+e.id+"/check-in","b",{ticket:second.ticket.id})).status,403);
  assert.equal((await c("events/"+e.id+"/check-in","a",{ticket:second.ticket.id})).status,200);
  assert.equal((await c("events/"+e.id+"/check-in","a",{ticket:second.ticket.id})).status,409);
  assert.equal((await c("tickets","second",{cancel:second.ticket.id})).status,409);
  assert.equal((await c("studio/event","a",{...e,capacity:2})).status,409);
  assert.equal((await (await c("tickets","guest")).json())[0].status,"Cancelled");
  env.DB.native.close();
});
test("profile comments require opt-in; event and profile threads enforce removal rights",async()=>{
  const {c}=setup();
  const profile=await (await c("profile","sam",{name:"Sam",bio:"Pottery fan",wall:true})).json();
  await c("profile","rae",{name:"Rae"});
  const wall="members/"+profile.handle;
  await c(wall,"rae",{body:"Hello!"});
  let thread=await (await c(wall)).json();assert.equal(thread.notes[0].name,"Rae");assert(!("user_id" in thread));
  await c(wall,"third",{remove:thread.notes[0].id});assert.equal((await (await c(wall)).json()).notes.length,1);
  await c(wall,"sam",{remove:thread.notes[0].id});assert.equal((await (await c(wall)).json()).notes.length,0);
  assert.equal((await c("events/rooftop-social/comments","sam",{body:"Looking forward to this!"})).status,200);
  thread=await (await c("events/rooftop-social")).json();assert.equal(thread.comments[0].handle,profile.handle);
  await c("profile","sam",{name:"Sam",wall:false});assert.equal((await c(wall)).status,404);
  assert.equal((await (await c("events/rooftop-social")).json()).comments[0].handle,null);
});
test("paid event tickets require activation and captured payment, reuse the booking, and skip shipping",async()=>{
  const {env,c,call,fresh}=setup();
  await c("studio/event","a",{...fresh,price:500});
  const e=(await (await c("studio","a")).json()).events[0];await c("profile","guest",{name:"Guest"});
  const route="events/"+e.id+"/book";
  assert.equal((await c(route,"guest",{qty:2})).status,503);
  Object.assign(env,{RAZORPAY_KEY_ID:"key",RAZORPAY_KEY_SECRET:"secret"});
  const original=global.fetch;
  global.fetch=async(url)=>Response.json(String(url).includes("/payments/")?{id:"pay_1",order_id:"order_1",amount:100000,currency:"INR",status:"captured"}:{id:"order_1"});
  try{
    const r=await (await c(route,"guest",{qty:2})).json();assert.equal(r.order.total,1000);assert.equal(r.order.shipping,0);
    assert.equal((await (await c(route,"guest",{qty:2})).json()).order.id,r.order.id);
    assert.equal((await (await c("host","a")).json())[0].tickets.length,0);
    const signature=createHmac("sha256","secret").update("order_1|pay_1").digest("hex");
    assert.equal((await call("verify","guest",{id:r.order.id,payment:"pay_1",signature})).status,200);
    assert.equal((await (await c("host","a")).json())[0].tickets[0].status,"Paid");
  }finally{global.fetch=original;}
});
