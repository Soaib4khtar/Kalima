import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// pgTable() is a Drizzle function that defines a PostgreSQL table.
// The first argument is the table name (must match what's in the DB).
// The second argument is an object where each key = column name.
export const vocabulary = pgTable("vocabulary", {
  // uuid() → PostgreSQL UUID column type
  // .primaryKey() → marks this as the PRIMARY KEY
  // .notNull()    → adds a NOT NULL constraint
  id: uuid().primaryKey().notNull(),

  // text() → PostgreSQL TEXT column (unlimited string length)
  english: text().notNull(),
  arabic: text().notNull(),
  transliteration: text().notNull(),
  category: text().notNull(),
  level: text().notNull(),

  // timestamp() → PostgreSQL TIMESTAMP column
  // { withTimezone: true } → stores timezone info (TIMESTAMPTZ), best practice
  // { mode: "string" }     → Drizzle returns it as a string instead of a Date object
  // .defaultNow()          → automatically sets to NOW() on INSERT
  // .notNull()             → cannot be null
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
});

// We also export the TypeScript *type* of a row selected from this table.
// Drizzle infers this automatically from the schema above.
// "typeof vocabulary.$inferSelect" = "what shape does a row have when I SELECT it?"
export type VocabularyRow = typeof vocabulary.$inferSelect;

// "typeof vocabulary.$inferInsert" = "what shape does data need to be to INSERT?"
export type VocabularyInsert = typeof vocabulary.$inferInsert;
