import {DatabaseSync} from "node:sqlite";
import {mkdirSync,readFileSync} from "node:fs";
import {dirname} from "node:path";
export function database(file){
 mkdirSync(dirname(file),{recursive:true});const db=new DatabaseSync(file);
 db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");db.exec(readFileSync(new URL("../drizzle/0000_store.sql",import.meta.url),"utf8"));
 return {native:db,prepare(sql){return {bind(...args){const s=db.prepare(sql);return {first:()=>s.get(...args),all:()=>({results:s.all(...args)}),run:()=>s.run(...args)}}}},batch(statements){db.exec("BEGIN IMMEDIATE");try{const result=statements.map(s=>s.run());db.exec("COMMIT");return result}catch(e){db.exec("ROLLBACK");throw e}}};
}
