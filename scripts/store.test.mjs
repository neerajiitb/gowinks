import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {api} from "../server/api.mjs";
import {database} from "../server/db.mjs";
const admin={id:"owner",email:"owner@example.test"},manager={id:"manager",email:"manager@example.test"},buyer={id:"buyer",email:"buyer@example.test"};
const address={name:"Test Buyer",city:"Pune",state:"Maharashtra",pin:"411001",address:"Test Address 10",phone:"9999999999"};
function shop(){const env={DB:database(":memory:"),ADMIN_USER_IDS:"owner"};const call=(path,user,data)=>api(new Request("https://store.test/api/"+path,{method:data===undefined?"GET":"POST",body:data===undefined?undefined:JSON.stringify(data)}),env,user);return {env,call}}
test("visitors can browse and only staff can edit the catalogue",async()=>{const {call}=shop();assert.equal((await (await call("store",null)).json()).products.length,6);assert.equal((await call("manage",null)).status,401);assert.equal((await call("manage",buyer)).status,403);await call("profile",manager,{name:"Store manager"});assert.equal((await call("manage/staff",admin,{id:"manager",role:"manager"})).status,200);const p=(await (await call("store",null)).json()).products[0];assert.equal((await call("manage/product",manager,{...p,price:1090})).status,200);assert.equal((await (await call("store",null)).json()).products[0].price,1090);assert.equal((await call("manage/staff",manager,{id:"buyer",role:"admin"})).status,403)});
test("profile, wishlist, offer and content changes persist",async()=>{const {call}=shop();await call("profile",buyer,{...address,wishlist:["noir-chocolate"]});await call("manage/settings",admin,{discount:8,headline:"Slow evenings."});const r=await (await call("store",buyer)).json();assert.equal(r.user.city,"Pune");assert.deepEqual(r.user.wishlist,["noir-chocolate"]);assert.equal(r.settings.discount,8);assert.equal(r.settings.headline,"Slow evenings.");assert.equal((await call("checkout",buyer,{})).status,503)});
test("checkout uses authoritative totals, verifies captured payment and supports shipment tracking",async t=>{
 const {env,call}=shop();Object.assign(env,{RAZORPAY_KEY_ID:"test",RAZORPAY_KEY_SECRET:"unit-test",RAZORPAY_WEBHOOK_SECRET:"test-hook",SHIPROCKET_EMAIL:"unit@test.invalid",SHIPROCKET_PASSWORD:"simulated",SHIPROCKET_PICKUP:"studio"});
 let expected,shipment,creates=0;
 t.mock.method(globalThis,"fetch",async(url,opts)=>{
 if(url.endsWith("/v1/orders")){expected=JSON.parse(opts.body);creates++;return Response.json({id:"order_test"})}
 if(url.endsWith("/payments/pay_test"))return Response.json({id:"pay_test",order_id:"order_test",amount:expected.amount,currency:"INR",status:"captured"});
 if(url.endsWith("/auth/login"))return Response.json({token:"simulation"});
 if(url.endsWith("/create/adhoc")){shipment=JSON.parse(opts.body);return Response.json({order_id:20,shipment_id:25})}
 if(url.endsWith("/track/shipment/25"))return Response.json({tracking_data:{shipment_track:[{current_status:"Delivered",courier_name:"Test Courier",awb_code:"123"}]}});
 throw Error("Unexpected simulated provider request");
 });
 const body={address,requestId:"attempt-1",coupon:"CLOSER10",items:[{id:"noir-chocolate",qty:2,price:1}],note:"For you"};
 const first=await call("checkout",buyer,body);assert.equal(first.status,200);const {order}=await first.json();assert.equal(order.total,1422);assert.equal(expected.amount,142200);assert.equal((await call("checkout",buyer,body)).status,200);assert.equal(creates,1);assert.equal((await call("manage/shipment",admin,{id:order.id})).status,409);assert.equal((await call("verify",manager,{id:order.id})).status,404);assert.equal((await call("verify",buyer,{id:order.id,payment:"pay_test",signature:"fake"})).status,400);
 const signature=createHmac("sha256","unit-test").update("order_test|pay_test").digest("hex");assert.equal((await call("verify",buyer,{id:order.id,payment:"pay_test",signature})).status,200);assert.equal((await (await call("orders",buyer)).json())[0].status,"Paid");assert.deepEqual(await (await call("orders",manager)).json(),[]);
 assert.equal((await call("manage/shipment",admin,{id:order.id,action:"book"})).status,200);assert.equal(shipment.payment_method,"Prepaid");assert.equal(shipment.order_items[0].selling_price,790);assert.equal((await call("manage/shipment",admin,{id:order.id,action:"book"})).status,409);assert.equal((await (await call("manage/shipment",admin,{id:order.id,action:"track"})).json()).status,"Delivered");
 const payload={event:"payment.captured",payload:{payment:{entity:{id:"pay_test",order_id:"order_test",amount:142200,currency:"INR",status:"captured"}}}},raw=JSON.stringify(payload),hookSig=createHmac("sha256","test-hook").update(raw).digest("hex");
 const hook=s=>api(new Request("https://store.test/api/webhook",{method:"POST",headers:{"x-razorpay-signature":s},body:raw}),env,null);assert.equal((await hook("bad")).status,403);assert.equal((await hook(hookSig)).status,200);assert.equal((await (await call("orders",buyer)).json())[0].status,"Delivered");
});
test("checkout rejects unavailable items and the database prevents overbooking",async t=>{const {env,call}=shop();Object.assign(env,{RAZORPAY_KEY_ID:"test",RAZORPAY_KEY_SECRET:"test"});t.mock.method(globalThis,"fetch",async()=>Response.json({id:"order_test"}));const p=(await (await call("store",null)).json()).products[0];await call("manage/product",admin,{...p,stock:1});const body={address,items:[{id:p.id,qty:1}]};const responses=await Promise.all(["one","two"].map(id=>call("checkout",buyer,{...body,requestId:id})));assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal((await (await call("store",null)).json()).products[0].available,0)});
