import test from "node:test";
import assert from "node:assert/strict";
import { database } from "../server/db.mjs";
import { api } from "../server/api.mjs";

function fixture() {
  const DB = database(":memory:");
  const env = {DB,ADMIN_USER_IDS:"owner"};
  const staff = {id:"staff",email:"m@example.test"};
  DB.native.prepare("INSERT INTO staff VALUES(?,?)").run(staff.id,"manager");
  const call = (path, body, user, region) => {
    const req=new Request("https://example.test/api/"+path,{method:body ? "POST":"GET",body:body && JSON.stringify(body)});
    if(region) Object.defineProperty(req,"cf",{value:{country:"IN",regionCode:region}});
    return api(req,env,user);
  };
  return {DB,call,staff};
}
const browser = () => ({visitor:crypto.randomUUID(),tab:crypto.randomUUID(),product:"velvet-flame"});
test("activity counts distinct recent browsers and uses regional wording only with sufficient evidence",async()=>{
  const {DB,call}=fixture(), a=browser();
  const pulse=async(b,region)=> (await call("activity/pulse",b,null,region)).json();
  assert.equal((await pulse(a,"MH")).looking,0);
  await pulse({...a,tab:crypto.randomUUID()},"MH");
  assert.equal((await pulse(a,"MH")).others,0);
  for(let i=0;i<3;i++) await pulse(browser(),"MH");
  await pulse({...browser(),product:"evening-duet"},"GA");
  assert.deepEqual([(await pulse(a,"MH")).others,(await pulse(a,"MH")).looking,(await pulse(a,"MH")).local],[3,3,true]);
  assert.equal((await pulse(a)).others,4);
  assert.equal((await call("activity/pulse",{...a,room:"after-dark"})).status,403);
  DB.native.prepare("UPDATE shop_presence SET seen=0").run();
  assert.equal((await pulse(a)).looking,0);
});
test("staff control support and badges while recent orders and hot sellers require real paid orders",async()=>{
  const {DB,call,staff}=fixture();
  assert.equal((await call("manage/activity",{whatsapp:true},staff)).status,400);
  assert.equal((await call("manage/activity",{hot:false},{id:"buyer",email:"b@example.test"})).status,403);
  const prefs={whatsapp:true,phone:"+91 99999 00000",greeting:"Hello & thank you!",hotThreshold:2,hotDays:3};
  assert.equal((await call("manage/activity",prefs,staff)).status,200);
  const store=async()=> (await call("store")).json();
  let data=await store(); assert.equal(data.activity.phone,"919999900000");
  assert.deepEqual(data.products.find(p=>p.id==="velvet-flame").badges,["Go Winks favourite"]);
  const insert=(id,age,paid)=>{
    const data={created:new Date(Date.now()-age*60000).toISOString(),status:paid?"Paid":"Awaiting payment",
      ...(paid?{payment:id}:{}),items:[{id:"velvet-flame",qty:8}]};
    DB.native.prepare("INSERT INTO orders VALUES(?,?,?,?)").run(id,"buyer",id,JSON.stringify(data));
  };
  insert("one",10,true);insert("two",70,true);insert("old",6000,true);insert("unpaid",2,false);
  assert.equal((await (await call("activity/pulse",{...browser(),product:""})).json()).recent,1);
  data=await store();assert.deepEqual(data.products.find(p=>p.id==="velvet-flame").badges,["Go Winks favourite","Hot selling"]);
  await call("manage/activity",{hot:false,favourites:false,whatsapp:false,visitors:false,orders:false,viewers:false},staff);
  data=await store();assert.equal(data.activity.phone,"");
  assert.deepEqual(data.products.find(p=>p.id==="velvet-flame").badges,[]);
  const result=await (await call("activity/pulse",browser())).json();assert.equal(result.recent,0);assert.equal(result.visitors,false);
});
