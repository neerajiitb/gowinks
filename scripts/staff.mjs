import { database } from "../server/db.mjs";
const [email, role] = process.argv.slice(2);
if (!email || !["admin", "manager", "event_manager", "customer"].includes(role))
  throw Error(
    "Usage: node --env-file-if-exists=.env scripts/staff.mjs <registered-email> <admin|manager|event_manager|customer>",
  );
const db = database(process.env.DATABASE_PATH || "data/store.sqlite").native,
  u = db.prepare("SELECT id FROM users WHERE email=?").get(email.toLowerCase());
if (!u) throw Error("Register the account first.");
db.prepare(
  "INSERT INTO staff VALUES(?,?) ON CONFLICT(id) DO UPDATE SET role=excluded.role",
).run(u.id, role);
console.log("Updated store role to " + role + ".");
