import {readdir,readFile,writeFile,mkdir,cp} from "node:fs/promises";
import path from "node:path";
const files={};
async function collect(dir){
 for(const item of await readdir(dir,{withFileTypes:true})){
 const p=path.join(dir,item.name);if(item.isDirectory()){await collect(p);continue}
 const key="/"+path.relative("public",p),type={".webp":"image/webp",".css":"text/css",".html":"text/html",".js":"text/javascript",".ttf":"font/ttf",".svg":"image/svg+xml",".txt":"text/plain"}[path.extname(p)];
 if(type)files[key]=[type,(await readFile(p)).toString("base64")];
 }
}
await collect("public");await mkdir("dist/server",{recursive:true});await mkdir("dist/.openai",{recursive:true});
const catalog=(await readFile("public/catalog.js","utf8")).replaceAll("export const","const"),api=(await readFile("server/api.mjs","utf8")).replace(/^import .*?;\n/,"").replace("export async function api","async function api");
const worker="const {initialProducts,initialSettings}=(()=>{"+catalog+"\nreturn {initialProducts:products,initialSettings:settings}})();\n"+api+"\nconst assets="+JSON.stringify(files)+`;
export default {async fetch(req,env){
 const p=new URL(req.url).pathname;
 if(p.startsWith("/api/")){
 const id=req.headers.get("oai-authenticated-user-id"),email=req.headers.get("oai-authenticated-user-email")||"";
 let name=req.headers.get("oai-authenticated-user-full-name")||"";try{if(req.headers.get("oai-authenticated-user-full-name-encoding")==="percent-encoded-utf-8")name=decodeURIComponent(name)}catch{}
 return api(req,{...env,DB:env.DB,HOSTED:true},id?{id,email,name}:null);
 }
 const a=assets[p==="/"?"/index.html":p];if(!a)return new Response("Not found",{status:404});
 return new Response(req.method==="HEAD"?null:Uint8Array.from(atob(a[1]),c=>c.charCodeAt(0)),{headers:{"content-type":a[0],"x-content-type-options":"nosniff","cache-control":a[0].startsWith("image/")||a[0].startsWith("font/")?"public, max-age=3600":"no-cache"}});
}};\n`;
await writeFile("dist/server/index.js",worker);await cp(".openai/hosting.json","dist/.openai/hosting.json");await cp("drizzle","dist/drizzle",{recursive:true});
console.log("Built worker and bundled "+Object.keys(files).length+" assets.");
