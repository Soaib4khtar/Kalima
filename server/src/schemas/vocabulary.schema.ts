import * as z from "zod";

export const vocabularyIdSchema = z.object({
  id: z.uuid(),
});

export const vocabularyQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().min(1).max(50).optional(),
});

export const createVocabularySchema = z.object({
  english: z.string().trim().min(1).max(100),
  arabic: z.string().trim().min(1).max(100),
  transliteration: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(50),
  level: z.enum(["A1", "A2", "B1"]),
});

export const updateVocabularySchema =
  createVocabularySchema
    .partial()
    .refine(
      (data) => Object.keys(data).length > 0,
      {
        message: "At least one field is required",
      },
    );