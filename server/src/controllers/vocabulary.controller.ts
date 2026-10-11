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
  const words = await getAllVocabulary(
    req.query.search as string | undefined,
    req.query.category as string | undefined,
  );

  res.json({
    success: true,
    data: words,
  });
}

export async function getVocabularyWord(
  req: Request,
  res: Response,
) {
  const word = await getVocabularyById(
    req.params.id as string,
  );

  if (!word) {
    res.status(404).json({
      success: false,
      error: {
        code: "WORD_NOT_FOUND",
        message: "Vocabulary word not found",
      },
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
  const input = req.body as CreateVocabularyInput;

  const word = await createVocabulary(input);

  res.status(201).json({
    success: true,
    data: word,
  });
}

export async function updateVocabularyWord(
  req: Request,
  res: Response,
) {
  const input = req.body as UpdateVocabularyInput;

  const word = await updateVocabulary(
    req.params.id as string,
    input,
  );

  if (!word) {
    res.status(404).json({
      success: false,
      error: {
        code: "WORD_NOT_FOUND",
        message: "Vocabulary word not found",
      },
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
  const word = await deleteVocabulary(
    req.params.id as string,
  );

  if (!word) {
    res.status(404).json({
      success: false,
      error: {
        code: "WORD_NOT_FOUND",
        message: "Vocabulary word not found",
      },
    });

    return;
  }

  res.json({
    success: true,
    data: word,
  });
}