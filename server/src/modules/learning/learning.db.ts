import "dotenv/config";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const localSettings: NodeJS.ProcessEnv = {};
config({ path: fileURLToPath(new URL("../../../.env.learning.local", import.meta.url)), quiet: true, processEnv: localSettings });
if (!process.env.LEARNING_DATABASE_URL?.trim() && localSettings.LEARNING_DATABASE_URL) process.env.LEARNING_DATABASE_URL = localSettings.LEARNING_DATABASE_URL;

/** This development lineage can never silently connect to the legacy database. */
export function validateLearningDatabaseUrl(value: string): string {
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
    url.search || url.hash ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !/^kalima_learning_(dev|test(?:_[a-z0-9_]+)?)$/.test(database)) {
    throw new Error("Learning storage requires an isolated loopback kalima_learning_dev/test database");
  }
  return value;
}

export function createLearningPoolFromEnv(env: NodeJS.ProcessEnv = process.env): Pool | undefined {
  if (!env.LEARNING_DATABASE_URL) return undefined;
  try {
    const pool = new Pool({ connectionString: validateLearningDatabaseUrl(env.LEARNING_DATABASE_URL),
      max: 5, connectionTimeoutMillis: 3_000, application_name: "kalima-learning" });
    pool.on("error", () => console.error("Learning database connection temporarily unavailable"));
    return pool;
  } catch { return undefined; } // Invalid storage configuration must not block public reading.
}
