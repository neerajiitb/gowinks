import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
export function database(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  const migrations = new URL("../drizzle/", import.meta.url);
  db.exec("CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)");
  const applied = db.prepare("SELECT 1 FROM local_migrations WHERE name=?");
  const record = db.prepare("INSERT INTO local_migrations(name) VALUES(?)");
  for (const file of readdirSync(migrations).filter(name => /^\d+_.*\.sql$/.test(name)).sort()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      if (!applied.get(file)) {
        db.exec(readFileSync(new URL(file, migrations), "utf8"));
        record.run(file);
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  return {
    native: db,
    prepare(sql) {
      return {
        bind(...args) {
          const s = db.prepare(sql);
          return {
            first: () => s.get(...args),
            all: () => ({ results: s.all(...args) }),
            run: () => s.run(...args),
          };
        },
      };
    },
    batch(statements) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = statements.map((s) => s.run());
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
