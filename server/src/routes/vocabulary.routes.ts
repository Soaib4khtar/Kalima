import { Router } from "express";

import {
  createVocabularyWord,
  deleteVocabularyWord,
  getVocabulary,
  getVocabularyWord,
  updateVocabularyWord,
} from "../controllers/vocabulary.controller.js";

import { validate } from "../middlewares/validate.middleware.js";

import {
  createVocabularySchema,
  updateVocabularySchema,
  vocabularyIdSchema,
  vocabularyQuerySchema,
} from "../schemas/vocabulary.schema.js";

const router = Router();

router.get(
  "/",
  validate("query", vocabularyQuerySchema),
  getVocabulary,
);

router.get(
  "/:id",
  validate("params", vocabularyIdSchema),
  getVocabularyWord,
);

router.post(
  "/",
  validate("body", createVocabularySchema),
  createVocabularyWord,
);

router.patch(
  "/:id",
  validate("params", vocabularyIdSchema),
  validate("body", updateVocabularySchema),
  updateVocabularyWord,
);

router.delete(
  "/:id",
  validate("params", vocabularyIdSchema),
  deleteVocabularyWord,
);

export default router;