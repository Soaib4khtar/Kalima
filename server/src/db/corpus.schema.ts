/**
 * Additive Quranic corpus schema for the next migration phase.
 *
 * This file is intentionally not re-exported by schema.ts yet: that file is
 * byte-pinned by the frozen Drizzle v2 adoption runner. Activating this schema
 * requires the separately documented baseline/adoption decision; importing
 * this module for type-checking has no database side effects.
 */
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const corpusSourceDatasets = pgTable(
  "corpus_source_datasets",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    provider: text("provider").notNull(),
    homepageUrl: text("homepage_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
);

export const corpusSourceReleases = pgTable(
  "corpus_source_releases",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => corpusSourceDatasets.id, { onDelete: "restrict", onUpdate: "cascade" }),
    role: text("role").notNull(),
    version: text("version").notNull(),
    sourceUrl: text("source_url").notNull(),
    upstreamResourceId: text("upstream_resource_id").notNull(),
    inputSha256: text("input_sha256").notNull(),
    licenseName: text("license_name").notNull(),
    licenseUrl: text("license_url").notNull(),
    attribution: text("attribution").notNull(),
    licenseStatus: text("license_status").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true, mode: "string" }).notNull(),
    termsCheckedAt: timestamp("terms_checked_at", { withTimezone: true, mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "corpus_source_releases_role_check",
      sql`${table.role} in ('canonical-text', 'surah-metadata', 'word-segmentation', 'word-translation', 'morphology', 'verse-translation', 'recitation-audio', 'word-timing')`,
    ),
    check(
      "corpus_source_releases_license_status_check",
      sql`${table.licenseStatus} in ('verified', 'review-required', 'restricted')`,
    ),
    check("corpus_source_releases_sha256_check", sql`${table.inputSha256} ~ '^[a-f0-9]{64}$'`),
    index("corpus_source_releases_dataset_idx").on(table.datasetId),
  ],
);

export const corpusPackages = pgTable(
  "corpus_packages",
  {
    id: text("id").primaryKey(),
    schemaVersion: integer("schema_version").notNull(),
    canonicalTextSha256: text("canonical_text_sha256").notNull(),
    counts: jsonb("counts").$type<Record<string, number>>().notNull(),
    validatedAt: timestamp("validated_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (table) => [
    check("corpus_packages_sha256_check", sql`${table.canonicalTextSha256} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const corpusPackageSources = pgTable(
  "corpus_package_sources",
  {
    packageId: text("package_id")
      .notNull()
      .references(() => corpusPackages.id, { onDelete: "restrict", onUpdate: "cascade" }),
    sourceReleaseId: text("source_release_id")
      .notNull()
      .references(() => corpusSourceReleases.id, { onDelete: "restrict", onUpdate: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.packageId, table.sourceReleaseId], name: "corpus_package_sources_pkey" }),
  ],
);

export const corpusImportAttempts = pgTable(
  "corpus_import_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    packageId: text("package_id")
      .notNull()
      .references(() => corpusPackages.id, { onDelete: "restrict", onUpdate: "cascade" }),
    attempt: integer("attempt").notNull(),
    status: text("status").notNull(),
    failure: jsonb("failure").$type<{ code: string; message: string } | null>(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    uniqueIndex("corpus_import_attempts_package_attempt_uidx").on(table.packageId, table.attempt),
    check(
      "corpus_import_attempts_status_check",
      sql`${table.status} in ('validating', 'importing', 'completed', 'failed')`,
    ),
    check("corpus_import_attempts_number_check", sql`${table.attempt} > 0`),
  ],
);

export const surahs = pgTable(
  "surahs",
  {
    number: smallint("number").primaryKey(),
    nameArabic: text("name_arabic").notNull(),
    nameTransliterated: text("name_transliterated").notNull(),
    nameEnglish: text("name_english").notNull(),
    ayahCount: smallint("ayah_count").notNull(),
    metadataSourceReleaseId: text("metadata_source_release_id")
      .notNull()
      .references(() => corpusSourceReleases.id, { onDelete: "restrict", onUpdate: "cascade" }),
  },
  (table) => [
    check("surahs_number_check", sql`${table.number} between 1 and 114`),
    check("surahs_ayah_count_check", sql`${table.ayahCount} > 0`),
  ],
);

export const ayahs = pgTable(
  "ayahs",
  {
    surahNumber: smallint("surah_number")
      .notNull()
      .references(() => surahs.number, { onDelete: "restrict", onUpdate: "cascade" }),
    ayahNumber: smallint("ayah_number").notNull(),
    textUthmani: text("text_uthmani").notNull(),
    textSha256: text("text_sha256").notNull(),
    textSourceReleaseId: text("text_source_release_id")
      .notNull()
      .references(() => corpusSourceReleases.id, { onDelete: "restrict", onUpdate: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.surahNumber, table.ayahNumber], name: "ayahs_pkey" }),
    check("ayahs_number_check", sql`${table.ayahNumber} > 0`),
    check("ayahs_sha256_check", sql`${table.textSha256} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const roots = pgTable(
  "roots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceReleaseId: text("source_release_id")
      .notNull()
      .references(() => corpusSourceReleases.id, { onDelete: "restrict", onUpdate: "cascade" }),
    externalId: text("external_id").notNull(),
    arabic: text("arabic").notNull(),
    transliteration: text("transliteration"),
  },
  (table) => [
    uniqueIndex("roots_source_external_uidx").on(table.sourceReleaseId, table.externalId),
    index("roots_arabic_idx").on(table.arabic),
  ],
);

export const lexemes = pgTable(
  "lexemes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceReleaseId: text("source_release_id")
      .notNull()
      .references(() => corpusSourceReleases.id, { onDelete: "restrict", onUpdate: "cascade" }),
    externalId: text("external_id").notNull(),
    lemmaArabic: text("lemma_arabic").notNull(),
    transliteration: text("transliteration"),
    partOfSpeech: text("part_of_speech"),
    rootId: uuid("root_id").references(() => roots.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("lexemes_source_external_uidx").on(table.sourceReleaseId, table.externalId),
    index("lexemes_lemma_idx").on(table.lemmaArabic),
    index("lexemes_root_idx").on(table.rootId),
  ],
);

export const wordOccurrences = pgTable(
  "word_occurrences",
  {
    surahNumber: smallint("surah_number").notNull(),
    ayahNumber: smallint("ayah_number").notNull(),
    lexicalPosition: smallint("lexical_position").notNull(),
    displayPosition: smallint("display_position"),
    textUthmani: text("text_uthmani").notNull(),
    textSimple: text("text_simple"),
    transliteration: text("transliteration"),
    lexemeId: uuid("lexeme_id").references(() => lexemes.id, { onDelete: "restrict" }),
    segmentationSourceReleaseId: text("segmentation_source_release_id")
      .notNull()
      .references(() => corpusSourceReleases.id, { onDelete: "restrict", onUpdate: "cascade" }),
  },
  (table) => [
    primaryKey({
      columns: [table.surahNumber, table.ayahNumber, table.lexicalPosition],
      name: "word_occurrences_pkey",
    }),
    foreignKey({
      columns: [table.surahNumber, table.ayahNumber],
      foreignColumns: [ayahs.surahNumber, ayahs.ayahNumber],
      name: "word_occurrences_ayah_fk",
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    check("word_occurrences_position_check", sql`${table.lexicalPosition} > 0`),
    check(
      "word_occurrences_display_position_check",
      sql`${table.displayPosition} is null or ${table.displayPosition} > 0`,
    ),
    index("word_occurrences_lexeme_idx").on(table.lexemeId),
    index("word_occurrences_surface_idx").on(table.textUthmani),
  ],
);

/**
 * Upstream display streams can contain pause marks, verse-end markers and
 * other non-lexical tokens. Keep them without pretending they are learnable
 * word occurrences.
 */
export const verseDisplayTokens = pgTable(
  "verse_display_tokens",
  {
    surahNumber: smallint("surah_number").notNull(),
    ayahNumber: smallint("ayah_number").notNull(),
    position: smallint("position").notNull(),
    tokenType: text("token_type").notNull(),
    textUthmani: text("text_uthmani"),
    sourceReleaseId: text("source_release_id")
      .notNull()
      .references(() => corpusSourceReleases.id, { onDelete: "restrict", onUpdate: "cascade" }),
  },
  (table) => [
    primaryKey({
      columns: [table.sourceReleaseId, table.surahNumber, table.ayahNumber, table.position],
      name: "verse_display_tokens_pkey",
    }),
    foreignKey({
      columns: [table.surahNumber, table.ayahNumber],
      foreignColumns: [ayahs.surahNumber, ayahs.ayahNumber],
      name: "verse_display_tokens_ayah_fk",
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    check("verse_display_tokens_position_check", sql`${table.position} > 0`),
    index("verse_display_tokens_ayah_idx").on(table.surahNumber, table.ayahNumber),
  ],
);

export const morphologySegments = pgTable(
  "morphology_segments",
  {
    surahNumber: smallint("surah_number").notNull(),
    ayahNumber: smallint("ayah_number").notNull(),
    wordPosition: smallint("word_position").notNull(),
    segmentPosition: smallint("segment_position").notNull(),
    surface: text("surface").notNull(),
    segmentType: text("segment_type"),
    partOfSpeech: text("part_of_speech"),
    features: jsonb("features").$type<Record<string, string>>().notNull().default({}),
    lexemeId: uuid("lexeme_id").references(() => lexemes.id, { onDelete: "restrict" }),
    rootId: uuid("root_id").references(() => roots.id, { onDelete: "restrict" }),
    sourceReleaseId: text("source_release_id")
      .notNull()
      .references(() => corpusSourceReleases.id, { onDelete: "restrict", onUpdate: "cascade" }),
  },
  (table) => [
    primaryKey({
      columns: [
        table.sourceReleaseId,
        table.surahNumber,
        table.ayahNumber,
        table.wordPosition,
        table.segmentPosition,
      ],
      name: "morphology_segments_pkey",
    }),
    foreignKey({
      columns: [table.surahNumber, table.ayahNumber, table.wordPosition],
      foreignColumns: [
        wordOccurrences.surahNumber,
        wordOccurrences.ayahNumber,
        wordOccurrences.lexicalPosition,
      ],
      name: "morphology_segments_word_fk",
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    check("morphology_segments_position_check", sql`${table.segmentPosition} > 0`),
  ],
);

export const translationEditions = pgTable("translation_editions", {
  id: text("id").primaryKey(),
  language: text("language").notNull(),
  name: text("name").notNull(),
  translator: text("translator"),
  sourceReleaseId: text("source_release_id")
    .notNull()
    .references(() => corpusSourceReleases.id, { onDelete: "restrict", onUpdate: "cascade" }),
});

export const verseTranslations = pgTable(
  "verse_translations",
  {
    editionId: text("edition_id")
      .notNull()
      .references(() => translationEditions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    surahNumber: smallint("surah_number").notNull(),
    ayahNumber: smallint("ayah_number").notNull(),
    text: text("text").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.editionId, table.surahNumber, table.ayahNumber],
      name: "verse_translations_pkey",
    }),
    foreignKey({
      columns: [table.surahNumber, table.ayahNumber],
      foreignColumns: [ayahs.surahNumber, ayahs.ayahNumber],
      name: "verse_translations_ayah_fk",
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
  ],
);

export const wordMeanings = pgTable(
  "word_meanings",
  {
    editionId: text("edition_id")
      .notNull()
      .references(() => translationEditions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    surahNumber: smallint("surah_number").notNull(),
    ayahNumber: smallint("ayah_number").notNull(),
    wordPosition: smallint("word_position").notNull(),
    meaning: text("meaning").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.editionId, table.surahNumber, table.ayahNumber, table.wordPosition],
      name: "word_meanings_pkey",
    }),
    foreignKey({
      columns: [table.surahNumber, table.ayahNumber, table.wordPosition],
      foreignColumns: [
        wordOccurrences.surahNumber,
        wordOccurrences.ayahNumber,
        wordOccurrences.lexicalPosition,
      ],
      name: "word_meanings_word_fk",
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
  ],
);

export const recitations = pgTable("recitations", {
  id: text("id").primaryKey(),
  reciterName: text("reciter_name").notNull(),
  style: text("style"),
  sourceReleaseId: text("source_release_id")
    .notNull()
    .references(() => corpusSourceReleases.id, { onDelete: "restrict", onUpdate: "cascade" }),
});

export const verseAudio = pgTable(
  "verse_audio",
  {
    recitationId: text("recitation_id")
      .notNull()
      .references(() => recitations.id, { onDelete: "restrict", onUpdate: "cascade" }),
    surahNumber: smallint("surah_number").notNull(),
    ayahNumber: smallint("ayah_number").notNull(),
    audioUrl: text("audio_url").notNull(),
    durationMs: integer("duration_ms"),
    audioSha256: text("audio_sha256"),
  },
  (table) => [
    primaryKey({
      columns: [table.recitationId, table.surahNumber, table.ayahNumber],
      name: "verse_audio_pkey",
    }),
    foreignKey({
      columns: [table.surahNumber, table.ayahNumber],
      foreignColumns: [ayahs.surahNumber, ayahs.ayahNumber],
      name: "verse_audio_ayah_fk",
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    check("verse_audio_duration_check", sql`${table.durationMs} is null or ${table.durationMs} > 0`),
    check(
      "verse_audio_sha256_check",
      sql`${table.audioSha256} is null or ${table.audioSha256} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const wordAudioTimings = pgTable(
  "word_audio_timings",
  {
    recitationId: text("recitation_id").notNull(),
    surahNumber: smallint("surah_number").notNull(),
    ayahNumber: smallint("ayah_number").notNull(),
    wordPosition: smallint("word_position").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    sourceReleaseId: text("source_release_id")
      .notNull()
      .references(() => corpusSourceReleases.id, { onDelete: "restrict", onUpdate: "cascade" }),
  },
  (table) => [
    primaryKey({
      columns: [
        table.sourceReleaseId,
        table.recitationId,
        table.surahNumber,
        table.ayahNumber,
        table.wordPosition,
      ],
      name: "word_audio_timings_pkey",
    }),
    foreignKey({
      columns: [table.recitationId, table.surahNumber, table.ayahNumber],
      foreignColumns: [verseAudio.recitationId, verseAudio.surahNumber, verseAudio.ayahNumber],
      name: "word_audio_timings_audio_fk",
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    foreignKey({
      columns: [table.surahNumber, table.ayahNumber, table.wordPosition],
      foreignColumns: [
        wordOccurrences.surahNumber,
        wordOccurrences.ayahNumber,
        wordOccurrences.lexicalPosition,
      ],
      name: "word_audio_timings_word_fk",
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    check("word_audio_timings_start_check", sql`${table.startMs} >= 0`),
    check("word_audio_timings_range_check", sql`${table.endMs} > ${table.startMs}`),
  ],
);

export type CorpusSourceReleaseRow = typeof corpusSourceReleases.$inferSelect;
export type SurahRow = typeof surahs.$inferSelect;
export type AyahRow = typeof ayahs.$inferSelect;
export type WordOccurrenceRow = typeof wordOccurrences.$inferSelect;
