import "dotenv/config";
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Pool } from "pg";

const localSettings = {};
config({ path: fileURLToPath(new URL("../.env.learning.local", import.meta.url)), quiet: true, processEnv: localSettings });
if (!process.env.LEARNING_DATABASE_URL?.trim() && localSettings.LEARNING_DATABASE_URL) process.env.LEARNING_DATABASE_URL = localSettings.LEARNING_DATABASE_URL;
export function checkedLearningUrl(value) {
  const url = new URL(value);
  if (url.search || url.hash || !["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !/^kalima_learning_(dev|test(?:_[a-z0-9_]+)?)$/.test(decodeURIComponent(url.pathname.slice(1)))) {
    throw new Error("Refused: only isolated loopback learning dev/test databases are permitted");
  }
  return value;
}
export async function migrateLearning(connectionString, { throughVersion = 2 } = {}) {
  if (![1, 2].includes(throughVersion)) throw new Error("Unknown learning migration target");
  const checked = checkedLearningUrl(connectionString);
  const pool = new Pool({ connectionString: checked, connectionTimeoutMillis: 3_000, max: 1 });
  let db;
  try {
    db = await pool.connect();
    const identity = await db.query("SELECT current_database() AS name");
    if (identity.rows[0].name !== decodeURIComponent(new URL(checked).pathname.slice(1))) throw new Error("Database identity mismatch");
    const migrations = await Promise.all(["0001_learning.sql", "0002_adaptive_reviews.sql"].slice(0, throughVersion).map(async (file, index) => {
      const sql = await readFile(new URL(`../learning-migrations/${file}`, import.meta.url), "utf8");
      return { version: index + 1, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    }));
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(124711,1)");
    await db.query("CREATE SCHEMA IF NOT EXISTS learning");
    await db.query("CREATE TABLE IF NOT EXISTS learning.schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())");
    const applied = await db.query("SELECT version,checksum FROM learning.schema_migrations ORDER BY version");
    if (applied.rows.some((row, index) => row.version !== index + 1 || !migrations.some((item) => item.version === row.version && item.checksum === row.checksum))) throw new Error("Learning migration history/checksum mismatch");
    if (!applied.rowCount) {
      const existing = await db.query("SELECT 1 FROM information_schema.tables WHERE table_schema='learning' AND table_name<>'schema_migrations'");
      if (existing.rowCount) throw new Error("Refused to adopt untracked existing learning tables");
    }
    const pending = migrations.filter((item) => item.version > applied.rowCount);
    for (const item of pending) {
      await db.query(item.sql);
      await db.query("INSERT INTO learning.schema_migrations(version,checksum) VALUES($1,$2)", [item.version, item.checksum]);
    }
    await db.query("COMMIT");
    return pending.length ? { status: "applied", versions: pending.map((item) => item.version) } : { status: "already-applied" };
  } catch (error) { if (db) await db.query("ROLLBACK"); throw error; }
  finally { db?.release(); await pool.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await migrateLearning(process.env.LEARNING_DATABASE_URL))); }
  catch { console.error("Learning migration refused or failed; credentials and database details are suppressed."); process.exitCode = 1; }
}
