import { Router } from "express";

import {
  createVocabularyWord,
  deleteVocabularyWord,
  getVocabulary,
  getVocabularyWord,
  updateVocabularyWord,
} from "../controllers/vocabulary.controller.js";

const router = Router();

router.get("/", getVocabulary);

router.get("/:id", getVocabularyWord);

router.post("/", createVocabularyWord);

router.patch("/:id", updateVocabularyWord);

router.delete("/:id", deleteVocabularyWord);

export default router;