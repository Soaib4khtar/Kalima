import { defineConfig } from "drizzle-kit";

// Preparation-only configuration: no dotenv import or database credentials.
// Generate from /server with --config=drizzle-v2.config.ts.
// Database connection settings require a separately approved testing step.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle-v2",
  migrations: {
    schema: "drizzle",
    table: "__drizzle_migrations_v2",
    prefix: "index",
  },
});
