import { z } from "zod";

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "Expected an HTTPS URL",
  });

const exactArabicTextSchema = z
  .string()
  .min(1)
  .refine((value) => /\p{Script=Arabic}/u.test(value), {
    message: "Expected Arabic-script text",
  });

export const quranAttributionSchema = z
  .object({
    provider: z.literal("Quran Foundation"),
    label: z.literal("Quran data provided by Quran.Foundation"),
    url: httpsUrlSchema,
    translationName: z.string().trim().min(1).optional(),
    translationAuthor: z.string().trim().min(1).optional(),
    translationLanguage: z.string().trim().min(1).optional(),
    wordTranslationLanguage: z.string().trim().min(1).optional(),
    recitationName: z.string().trim().min(1).optional(),
    recitationStyle: z.string().trim().min(1).optional(),
  })
  .strict();

export const quranWordReferenceSchema = z
  .object({
    surah: z.number().int().min(1).max(114),
    ayah: z.number().int().positive(),
    word: z.number().int().positive(),
    verseKey: z.string().regex(/^\d{1,3}:\d{1,3}$/),
  })
  .strict();

export const quranWordOccurrenceSchema = z
  .object({
    sourceId: z.number().int().positive(),
    position: z.number().int().positive(),
    textUthmani: exactArabicTextSchema,
    translation: z.string().min(1).optional(),
    transliteration: z.string().min(1).optional(),
    audioUrl: httpsUrlSchema.optional(),
    reference: quranWordReferenceSchema,
  })
  .strict();

export const quranVerseSchema = z
  .object({
    sourceId: z.number().int().positive(),
    number: z.number().int().positive(),
    verseKey: z.string().regex(/^\d{1,3}:\d{1,3}$/),
    textUthmani: exactArabicTextSchema,
    translation: z
      .object({
        sourceId: z.number().int().positive(),
        text: z.string().min(1),
        resourceId: z.number().int().positive(),
        resourceName: z.string().trim().min(1),
      })
      .strict()
      .optional(),
    audio: z
      .object({
        url: httpsUrlSchema,
        recitationId: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    words: z.array(quranWordOccurrenceSchema),
  })
  .strict();

export const quranSurahSchema = z
  .object({
    number: z.number().int().min(1).max(114),
    nameArabic: exactArabicTextSchema,
    nameTransliterated: z.string().trim().min(1),
    translatedName: z.string().trim().min(1),
    verses: z.array(quranVerseSchema).min(1),
  })
  .strict();

export const quranSurahResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("ready"),
      surah: quranSurahSchema,
      attribution: quranAttributionSchema,
    })
    .strict(),
  z
    .object({
      status: z.enum(["unconfigured", "unavailable"]),
      reason: z.string().trim().min(1),
      attribution: quranAttributionSchema,
    })
    .strict(),
]);

export const quranSurahResponseSchema = z
  .object({
    success: z.literal(true),
    data: quranSurahResultSchema,
  })
  .strict();

export const quranProviderStatusSchema = z
  .object({
    status: z.enum(["configured", "unconfigured"]),
    environment: z.enum(["prelive", "production"]),
    reason: z.string().trim().min(1).optional(),
    attribution: quranAttributionSchema,
  })
  .strict();

export const quranProviderStatusResponseSchema = z
  .object({
    success: z.literal(true),
    data: quranProviderStatusSchema,
  })
  .strict();

export type QuranAttribution = z.infer<typeof quranAttributionSchema>;
export type QuranProviderStatus = z.infer<typeof quranProviderStatusSchema>;
export type QuranSurahResult = z.infer<typeof quranSurahResultSchema>;
export type QuranSurahReady = Extract<QuranSurahResult, { status: "ready" }>;
