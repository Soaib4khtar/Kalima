import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// drizzle.config.ts is the configuration file for Drizzle Kit (the CLI tool).
// Drizzle Kit is separate from Drizzle ORM — it's what handles migrations:
//   - db:generate → reads our schema.ts → produces SQL migration files
//   - db:migrate  → runs those SQL files against the actual database
//   - db:studio   → opens a web UI to browse/edit data
//
// Previously this used DATABASE_URL (a single connection string like:
//   postgres://user:password@host:port/dbname
// ) but our .env has individual variables (DB_HOST, DB_PORT, etc.)
// So we build the URL ourselves from those variables.
const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;

export default defineConfig({
  // "out" = where to write the generated .sql migration files
  out: "./drizzle",

  // "schema" = where Drizzle Kit should read our table definitions from
  schema: "./src/db/schema.ts",

  // "dialect" = which database engine we're using
  dialect: "postgresql",

  dbCredentials: {
    // We construct the connection URL from our .env variables.
    // Format: postgresql://username:password@host:port/database
    url: `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`,
  },

  // Only look at tables in the "public" schema (PostgreSQL default schema)
  schemaFilter: ["public"],
});