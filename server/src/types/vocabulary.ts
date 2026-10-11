import type * as z from "zod";

import {
  createVocabularySchema,
  updateVocabularySchema,
} from "../schemas/vocabulary.schema.js";

export type CreateVocabularyInput = z.infer<
  typeof createVocabularySchema
>;

export type UpdateVocabularyInput = z.infer<
  typeof updateVocabularySchema
>;