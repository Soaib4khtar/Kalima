import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const vocabulary = pgTable("vocabulary", {
	id: uuid().primaryKey().notNull(),
	english: text().notNull(),
	arabic: text().notNull(),
	transliteration: text().notNull(),
	category: text().notNull(),
	level: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});
