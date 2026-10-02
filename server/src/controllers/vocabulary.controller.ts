import type { Request, Response } from "express";

import {
  createVocabulary,
  deleteVocabulary,
  getAllVocabulary,
  getVocabularyById,
  updateVocabulary,
} from "../services/vocabulary.service.js";

import type {
  CreateVocabularyInput,
  UpdateVocabularyInput,
} from "../types/vocabulary.js";

export async function getVocabulary(
  req: Request,
  res: Response,
) {
  const search =
    typeof req.query.search === "string"
      ? req.query.search
      : undefined;

  const category =
    typeof req.query.category === "string"
      ? req.query.category
      : undefined;

  const words = await getAllVocabulary(search, category);

  res.json({
    success: true,
    data: words,
  });
}

export async function getVocabularyWord(
  req: Request,
  res: Response,
) {
  const id = req.params.id as string;
  const word = await getVocabularyById(id);

  if (!word) {
    res.status(404).json({
      success: false,
      message: "Vocabulary word not found",
    });

    return;
  }

  res.json({
    success: true,
    data: word,
  });
}

export async function createVocabularyWord(
  req: Request,
  res: Response,
) {
  const {
    english,
    arabic,
    transliteration,
    category,
    level,
  } = req.body as CreateVocabularyInput;

  if (
    !english ||
    !arabic ||
    !transliteration ||
    !category ||
    !level
  ) {
    res.status(400).json({
      success: false,
      message: "All vocabulary fields are required",
    });

    return;
  }

  const word = await createVocabulary({
    english,
    arabic,
    transliteration,
    category,
    level,
  });

  res.status(201).json({
    success: true,
    data: word,
  });
}

export async function updateVocabularyWord(
  req: Request,
  res: Response,
) {
  const id = req.params.id as string;
  const input = req.body as UpdateVocabularyInput;

  const word = await updateVocabulary(
    id,
    input,
  );

  if (!word) {
    res.status(404).json({
      success: false,
      message: "Vocabulary word not found",
    });

    return;
  }

  res.json({
    success: true,
    data: word,
  });
}

export async function deleteVocabularyWord(
  req: Request,
  res: Response,
) {
  const id = req.params.id as string;
  const word = await deleteVocabulary(id);

  if (!word) {
    res.status(404).json({
      success: false,
      message: "Vocabulary word not found",
    });

    return;
  }

  res.json({
    success: true,
    data: word,
  });
}