// ─────────────────────────────────────────────────────────────────
// server/src/db/seed.ts
//
// A one-time script that populates the vocabulary table with
// initial Arabic words so we can actually use and test the app.
//
// HOW TO RUN:
//   npx tsx src/db/seed.ts
//   (from inside the /server directory)
//
// DESIGN DECISIONS:
//   - Uses "INSERT ... ON CONFLICT DO NOTHING" so it's safe to
//     run multiple times — won't crash or duplicate data.
//   - Uses Drizzle ORM (not raw SQL) so we get type safety:
//     TypeScript will error if we forget a required field.
//   - We import the `pool` from db.ts so we reuse the same
//     connection config (reads .env automatically).
// ─────────────────────────────────────────────────────────────────

import "dotenv/config"; // Must be first — loads .env into process.env

import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

// ─────────────────────────────────────────────────────────────────
// We create a fresh Pool + Drizzle instance here instead of
// importing from db.ts. Why? Because db.ts logs the config on
// import (the console.log), and we want a clean seed output.
// ─────────────────────────────────────────────────────────────────
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// drizzle() wraps the pool with type-safe query methods
const db = drizzle({ client: pool, schema });

// ─────────────────────────────────────────────────────────────────
// SEED DATA
// These are the 8 words from the old static vocabulary.ts file,
// now going into the real PostgreSQL database.
//
// Fields we INCLUDE: what the DB has (id, english, arabic,
//   transliteration, category, level)
// Fields we SKIP: partOfSpeech, example, status — the DB doesn't
//   have columns for these yet. We'll add them in future milestones.
// ─────────────────────────────────────────────────────────────────
const seedWords: schema.VocabularyInsert[] = [
  {
    id: randomUUID(),
    english: "Book",
    arabic: "كِتَاب",
    transliteration: "Kitab",
    category: "Everyday",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "House",
    arabic: "بَيْت",
    transliteration: "Bayt",
    category: "Everyday",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "Water",
    arabic: "مَاء",
    transliteration: "Māʾ",
    category: "Everyday",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "Food",
    arabic: "طَعَام",
    transliteration: "Ṭaʿām",
    category: "Food",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "School",
    arabic: "مَدْرَسَة",
    transliteration: "Madrasa",
    category: "Places",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "Friend",
    arabic: "صَدِيق",
    transliteration: "Ṣadīq",
    category: "People",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "Door",
    arabic: "بَاب",
    transliteration: "Bāb",
    category: "Everyday",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "Beautiful",
    arabic: "جَمِيل",
    transliteration: "Jamīl",
    category: "Descriptions",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "Car",
    arabic: "سَيَّارَة",
    transliteration: "Sayyāra",
    category: "Transport",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "Sun",
    arabic: "شَمْس",
    transliteration: "Shams",
    category: "Nature",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "Moon",
    arabic: "قَمَر",
    transliteration: "Qamar",
    category: "Nature",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "God",
    arabic: "اللّٰه",
    transliteration: "Allah",
    category: "Religion",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "Peace",
    arabic: "سَلَام",
    transliteration: "Salām",
    category: "Greetings",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "Thank you",
    arabic: "شُكْرًا",
    transliteration: "Shukran",
    category: "Greetings",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "Yes",
    arabic: "نَعَم",
    transliteration: "Naʿam",
    category: "Everyday",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "No",
    arabic: "لَا",
    transliteration: "Lā",
    category: "Everyday",
    level: "A1",
  },
  {
    id: randomUUID(),
    english: "Love",
    arabic: "حُبّ",
    transliteration: "Ḥubb",
    category: "Emotions",
    level: "A2",
  },
  {
    id: randomUUID(),
    english: "Knowledge",
    arabic: "عِلْم",
    transliteration: "ʿIlm",
    category: "Education",
    level: "A2",
  },
  {
    id: randomUUID(),
    english: "Heart",
    arabic: "قَلْب",
    transliteration: "Qalb",
    category: "Body",
    level: "A2",
  },
  {
    id: randomUUID(),
    english: "Time",
    arabic: "وَقْت",
    transliteration: "Waqt",
    category: "Everyday",
    level: "A2",
  },
];

// ─────────────────────────────────────────────────────────────────
// MAIN SEED FUNCTION
// ─────────────────────────────────────────────────────────────────
async function seed() {
  console.log("🌱 Starting database seed...\n");

  // Check how many words already exist
  // db.select() = SELECT * FROM vocabulary
  const existing = await db.select().from(schema.vocabulary);

  if (existing.length > 0) {
    console.log(`⚠️  Found ${existing.length} existing words. Skipping seed.`);
    console.log(
      "   (Delete the rows manually and re-run if you want to re-seed)\n",
    );
    await pool.end();
    return;
  }

  // db.insert(table) = INSERT INTO vocabulary
  // .values(array)   = the rows to insert
  // Drizzle validates the shape of each object against VocabularyInsert
  // at compile time — if you forget a required field, TypeScript errors.
  await db.insert(schema.vocabulary).values(seedWords);

  console.log(`✅ Successfully inserted ${seedWords.length} vocabulary words!\n`);
  console.log("Words inserted:");
  seedWords.forEach((word, i) => {
    console.log(`  ${i + 1}. ${word.english} → ${word.arabic} (${word.level})`);
  });

  // Always close the pool when you're done —
  // otherwise the script will hang waiting for connections to close
  await pool.end();
  console.log("\n✨ Seed complete!");
}

// Run the seed function and handle any errors
seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  pool.end();
  process.exit(1);
});
