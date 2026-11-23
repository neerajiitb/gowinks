import { readdir, readFile, writeFile, mkdir, cp } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
const files = {};
async function collect(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) {
      await collect(p);
      continue;
    }
    const key = "/" + path.relative("public", p),
      type = {
        ".webp": "image/webp",
        ".woff2": "font/woff2",
        ".mp4": "video/mp4",
        ".css": "text/css",
        ".html": "text/html",
        ".js": "text/javascript",
        ".ttf": "font/ttf",
        ".svg": "image/svg+xml",
        ".txt": "text/plain",
      }[path.extname(p)];
    if (type) files[key] = [type, (await readFile(p)).toString("base64")];
  }
}
await collect("public");
// A release-specific URL also invalidates cached dependencies of app.js and CSS.
const release = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
  encoding: "utf8",
}).trim();
const localUiAsset = /(["'])(\.?\/[\w./-]+\.(?:css|js|svg|ttf|woff2))\1/g;
for (const [pathname, asset] of Object.entries(files)) {
  if (!/\.(?:html|css|js)$/.test(pathname)) continue;
  const source = Buffer.from(asset[1], "base64").toString("utf8");
  const versioned = source.replace(localUiAsset, (match, quote, url) => {
    const target = path.posix.resolve(path.posix.dirname(pathname), url);
    return Object.hasOwn(files, target) ? `${quote}${url}?v=${release}${quote}` : match;
  });
  asset[1] = Buffer.from(versioned).toString("base64");
}
const sourceZip = execFileSync(
  "git",
  ["archive", "--format=zip", "--prefix=go-winks/", "HEAD"],
  { maxBuffer: 16 * 1024 * 1024 },
);
files["/go-winks-source.zip"] = [
  "application/zip",
  sourceZip.toString("base64"),
];
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
const catalog = (await readFile("public/catalog.js", "utf8")).replaceAll(
    "export const",
    "const",
  ),
  api = (await readFile("server/api.mjs", "utf8"))
    .replace(/^import[\s\S]*?from "\.\.\/public\/catalog\.js";\s*/, "")
    .replace("export async function api", "async function api");
const assetHelper = (await readFile("server/asset.mjs", "utf8")).replace(
  "export function assetResponse",
  "function assetResponse",
);
const worker =
  assetHelper +
  "\n" +
  "const {initialProducts,initialSettings}=(()=>{" +
  catalog +
  "\nreturn {initialProducts:products,initialSettings:settings}})();\n" +
  api +
  "\nconst assets=" +
  JSON.stringify(files) +
  `;
export default {async fetch(req,env){
 const p=new URL(req.url).pathname;
 if(p.startsWith("/api/")){
 const id=req.headers.get("oai-authenticated-user-id"),email=req.headers.get("oai-authenticated-user-email")||"";
 let name=req.headers.get("oai-authenticated-user-full-name")||"";try{if(req.headers.get("oai-authenticated-user-full-name-encoding")==="percent-encoded-utf-8")name=decodeURIComponent(name)}catch{}
 return api(req,{...env,DB:env.DB,HOSTED:true},id?{id,email,name}:null);
 }
 if(p==="/go-winks-source.zip"){
 const email=req.headers.get("oai-authenticated-user-email"),id=req.headers.get("oai-authenticated-user-id");
 if(!id||!email||!env.HOSTED_ADMIN_EMAIL||email.toLowerCase()!==env.HOSTED_ADMIN_EMAIL.toLowerCase())return new Response("Owner access required",{status:403});
}
 const a=assets[p==="/"?"/index.html":p];if(!a)return new Response("Not found",{status:404});
 return assetResponse(req,a[0],Uint8Array.from(atob(a[1]),c=>c.charCodeAt(0)));
}};\n`;
await writeFile("dist/server/index.js", worker);
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
await cp("drizzle", "dist/drizzle", { recursive: true });
console.log(
  "Built worker and bundled " + Object.keys(files).length + " assets.",
);
