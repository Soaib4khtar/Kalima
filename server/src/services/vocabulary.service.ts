import { randomUUID } from "node:crypto";

import { pool } from "../db.js";

import type {
  CreateVocabularyInput,
  UpdateVocabularyInput,
} from "../types/vocabulary.js";

export async function getAllVocabulary(
  search?: string,
  category?: string,
) {
  const values: string[] = [];
  const conditions: string[] = [];

  if (search && search.trim() !== "") {
    values.push(`%${search.trim().toLowerCase()}%`);

    conditions.push(
      `(LOWER(english) LIKE $${values.length} OR arabic LIKE $${values.length})`,
    );
  }

  if (category && category !== "all") {
    values.push(category);

    conditions.push(`category = $${values.length}`);
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const result = await pool.query(
    `
      SELECT
        id,
        english,
        arabic,
        transliteration,
        category,
        level,
        created_at,
        updated_at
      FROM vocabulary
      ${whereClause}
      ORDER BY created_at DESC
    `,
    values,
  );

  return result.rows;
}

export async function getVocabularyById(id: string) {
  const result = await pool.query(
    `
      SELECT
        id,
        english,
        arabic,
        transliteration,
        category,
        level,
        created_at,
        updated_at
      FROM vocabulary
      WHERE id = $1
    `,
    [id],
  );

  return result.rows[0];
}

export async function createVocabulary(
  input: CreateVocabularyInput,
) {
  const id = randomUUID();

  const result = await pool.query(
    `
      INSERT INTO vocabulary (
        id,
        english,
        arabic,
        transliteration,
        category,
        level
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        english,
        arabic,
        transliteration,
        category,
        level,
        created_at,
        updated_at
    `,
    [
      id,
      input.english,
      input.arabic,
      input.transliteration,
      input.category,
      input.level,
    ],
  );

  return result.rows[0];
}

export async function updateVocabulary(
  id: string,
  input: UpdateVocabularyInput,
) {
  const fields: string[] = [];
  const values: string[] = [];

  if (input.english !== undefined) {
    values.push(input.english);
    fields.push(`english = $${values.length}`);
  }

  if (input.arabic !== undefined) {
    values.push(input.arabic);
    fields.push(`arabic = $${values.length}`);
  }

  if (input.transliteration !== undefined) {
    values.push(input.transliteration);
    fields.push(`transliteration = $${values.length}`);
  }

  if (input.category !== undefined) {
    values.push(input.category);
    fields.push(`category = $${values.length}`);
  }

  if (input.level !== undefined) {
    values.push(input.level);
    fields.push(`level = $${values.length}`);
  }

  if (fields.length === 0) {
    return getVocabularyById(id);
  }

  values.push(id);

  const result = await pool.query(
    `
      UPDATE vocabulary
      SET
        ${fields.join(", ")},
        updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING
        id,
        english,
        arabic,
        transliteration,
        category,
        level,
        created_at,
        updated_at
    `,
    values,
  );

  return result.rows[0];
}

export async function deleteVocabulary(id: string) {
  const result = await pool.query(
    `
      DELETE FROM vocabulary
      WHERE id = $1
      RETURNING
        id,
        english,
        arabic,
        transliteration,
        category,
        level,
        created_at,
        updated_at
    `,
    [id],
  );

  return result.rows[0];
}