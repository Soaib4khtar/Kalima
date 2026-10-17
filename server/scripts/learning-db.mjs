import { mkdir, readFile, writeFile, access, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, isAbsolute } from "node:path";
import { Pool } from "pg";
import { migrateLearning } from "./learning-migrate.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const runtime = resolve(root, ".local/learning-postgres");
const data = resolve(runtime, "data");
if (!isAbsolute(runtime) || !runtime.startsWith(resolve(root, ".local") + "/") && !runtime.startsWith(resolve(root, ".local") + "\\")) throw new Error("Unsafe runtime directory");
const bin = process.env.LEARNING_PG_BIN ?? (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "/usr/lib/postgresql/18/bin");
function run(name, args, input) {
  const result = spawnSync(resolve(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`), args,
    { input, encoding: "utf8", windowsHide: true, timeout: 60_000 });
  if (result.status !== 0) throw new Error(`Isolated PostgreSQL ${name} failed; no credentials are printed`);
}
try {
  if (process.argv[2] === "stop") {
    run("pg_ctl", ["-D", data, "stop", "-m", "fast", "-w"]);
    console.log("Isolated learning PostgreSQL stopped. Its data is retained.");
  } else {
    await mkdir(runtime, { recursive: true });
    let settings;
    try { settings = JSON.parse(await readFile(resolve(runtime, "connection.json"), "utf8")); }
    catch {
      settings = { port: 55439, user: "kalima_learning_admin", password: randomBytes(32).toString("hex") };
      await writeFile(resolve(runtime, "connection.json"), JSON.stringify(settings), { mode: 0o600, flag: "wx" });
    }
    try { await access(resolve(data, "PG_VERSION")); }
    catch {
      const passwordFile = resolve(runtime, "init-password.tmp");
      await writeFile(passwordFile, settings.password + "\n", { mode: 0o600 });
      try { run("initdb", ["-D", data, "-U", settings.user, "--encoding=UTF8", "--auth-host=scram-sha-256", "--auth-local=trust", `--pwfile=${passwordFile}`]); }
      finally { await unlink(passwordFile); }
    }
    const status = spawnSync(resolve(bin, `pg_ctl${process.platform === "win32" ? ".exe" : ""}`), ["-D", data, "status"], { windowsHide: true });
    if (status.status !== 0) run("pg_ctl", ["-D", data, "-l", resolve(runtime, "postgres.log"), "-o", `-h 127.0.0.1 -p ${settings.port}`, "-w", "start"]);
    const base = `postgresql://${settings.user}:${settings.password}@127.0.0.1:${settings.port}/`;
    const pool = new Pool({ connectionString: base + "postgres", connectionTimeoutMillis: 3_000 });
    try {
      const exists = await pool.query("SELECT 1 FROM pg_database WHERE datname='kalima_learning_dev'");
      if (!exists.rowCount) await pool.query('CREATE DATABASE "kalima_learning_dev"');
    } finally { await pool.end(); }
    const connection = base + "kalima_learning_dev";
    // Runtime credentials only: this ignored file is never echoed or committed.
    await writeFile(new URL("../.env.learning.local", import.meta.url), `LEARNING_DATABASE_URL=${connection}\n`, { mode: 0o600 });
    const migration = await migrateLearning(connection);
    console.log(JSON.stringify({ status: "ready", database: "kalima_learning_dev", port: settings.port, migration: migration.status,
      note: "Original database untouched; generated credentials are in ignored local runtime files." }));
  }
} catch { console.error("Isolated learning database setup failed. No original database was targeted and credentials are suppressed."); process.exitCode = 1; }
