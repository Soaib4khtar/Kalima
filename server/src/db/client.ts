import { drizzle } from "drizzle-orm/node-postgres";

import { pool } from "../db.js";

import * as schema from "./schema.js";

export const db = drizzle({
  client: pool,
  schema,
});