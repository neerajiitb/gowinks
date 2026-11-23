import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { api } from "../server/api.mjs";
import { database } from "../server/db.mjs";

test("an existing local database receives the invitation migration exactly once", (t) => {
  const dir = mkdtempSync(join(tmpdir(),"gowinks-invitations-"));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  const file = join(dir,"data.sqlite");
  const old = new DatabaseSync(file);
  old.exec(readFileSync(new URL("../drizzle/0000_store.sql",import.meta.url),"utf8"));
  old.prepare("INSERT INTO staff(id,role) VALUES('owner','admin')").run();
  old.close();
  const first = database(file);
  assert.equal(first.native.prepare("SELECT role FROM staff WHERE id='owner'").get().role, "admin");
  assert(first.native.prepare("SELECT 1 FROM sqlite_master WHERE name='invitations'").get());
  first.native.close();
  const again=database(file);
  assert.equal(again.native.prepare("SELECT COUNT(*) AS n FROM local_migrations WHERE name='0001_invitations.sql'").get().n, 1);
  again.native.close();
});

test("couples can share private invitations, track replies and withdraw pending ones", async (t) => {
  const env = { DB: database(":memory:") };
  t.after(() => env.DB.native.close());
  const p = {id:"garden-visit",name:"Garden picnic",kind:"spot",active:true,preview:true,stock:0};
  env.DB.native.prepare("INSERT INTO catalog VALUES(?,?)").run(p.id,JSON.stringify(p));
  const user = id => id ? {id,email:id+"@example.test"} : null;
  const call = (id,path,data) => api(new Request("https://store.test/api/invitations" + path,{
    method:data ? "POST" : "GET",body:data ? JSON.stringify(data) : undefined
  }),env,user(id));
  const make = {listingId:p.id,senderName:"Ari",recipientName:"Val",message:"Picnic on Friday?",phone:"+91 98765 43210",requestId:randomUUID()};
  assert.equal((await call(null,"",make)).status,401);
  assert.equal((await call("ari","",{...make,listingId:"noir-chocolate"})).status,404);
  const [a,b] = await Promise.all([call("ari","",make),call("ari","",make)]);
  const invite = await a.json(), path="/"+invite.token;
  assert.equal((await b.json()).token, invite.token);
  assert.equal(invite.preview,true);
  assert(!("phone" in invite));
  assert.equal((await call(null,path)).status,401);
  assert.deepEqual(await (await call("stranger",path)).json(),{locked:true});
  assert.deepEqual(await (await call("stranger","")).json(),[]);
  assert.equal((await call("stranger",path,{action:"accepted"})).status,403);
  assert.equal((await call("val",path,{action:"open",phone:"9999999999"})).status,403);
  const viewed=await (await call("val",path,{action:"open",phone:"9876543210"})).json();
  assert.equal(viewed.senderName,"Ari"); assert.equal(viewed.message,"Picnic on Friday?");
  assert.equal((await call("ari",path,{action:"accepted"})).status,403);
  assert.equal((await call("stranger",path)).status,404);
  for (let i=0;i<2;i++) assert.equal((await (await call("val",path,{action:"accepted"})).json()).status,"accepted");
  assert.equal((await call("val",path,{action:"declined"})).status,409);
  assert.equal((await call("ari",path,{action:"withdraw"})).status,409);
  assert.equal((await (await call("ari","")).json())[0].status,"accepted");
  assert.equal((await (await call("val","")).json())[0].direction,"received");
  const withdrawn=await (await call("ari","",{...make,requestId:randomUUID()})).json();
  assert.equal((await (await call("ari","/"+withdrawn.token,{action:"withdraw"})).json()).status,"withdrawn");
  assert.equal((await call("val","/"+withdrawn.token,{action:"open",phone:make.phone})).status,404);
  const declined=await (await call("ari","",{...make,requestId:randomUUID()})).json();
  await call("val","/"+declined.token,{action:"open",phone:make.phone});
  assert.equal((await (await call("val","/"+declined.token,{action:"declined"})).json()).status,"declined");
});
