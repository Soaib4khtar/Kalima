import { createHash } from "node:crypto";

import { z } from "zod";

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:[._@/-][a-z0-9]+)*$/);

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "Source URLs must use HTTPS",
  });

function hasForbiddenTextCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      codePoint <= 0x08 ||
      codePoint === 0x0b ||
      codePoint === 0x0c ||
      (codePoint >= 0x0e && codePoint <= 0x1f) ||
      codePoint === 0x7f ||
      codePoint === 0xfffd
    );
  });
}

const exactArabicText = z
  .string()
  .min(1)
  .max(20_000)
  .refine((value) => value === value.trim(), {
    message: "Canonical text must not have leading or trailing whitespace",
  })
  .refine((value) => /\p{Script=Arabic}/u.test(value), {
    message: "Expected at least one Arabic-script character",
  })
  .refine((value) => !hasForbiddenTextCharacter(value), {
    message: "Text contains a control or replacement character",
  });

export const corpusSourceRoleSchema = z.enum([
  "canonical-text",
  "surah-metadata",
  "word-segmentation",
  "word-translation",
  "morphology",
  "verse-translation",
  "recitation-audio",
  "word-timing",
]);

const corpusSourceSchema = z
  .object({
    id: identifier,
    datasetId: identifier,
    role: corpusSourceRoleSchema,
    title: z.string().trim().min(1).max(240),
    version: z.string().trim().min(1).max(100),
    provider: z.string().trim().min(1).max(160),
    homepageUrl: httpsUrl,
    sourceUrl: httpsUrl,
    upstreamResourceId: z.string().trim().min(1).max(240),
    retrievedAt: z.string().datetime({ offset: true }),
    termsCheckedAt: z.string().datetime({ offset: true }),
    inputSha256: sha256,
    license: z
      .object({
        name: z.string().trim().min(1).max(200),
        url: httpsUrl,
        attribution: z.string().trim().min(1).max(2_000),
        verificationStatus: z.enum(["verified", "review-required", "restricted"]),
        notes: z.string().trim().max(2_000).optional(),
      })
      .strict(),
  })
  .strict();

const surahSchema = z
  .object({
    number: z.number().int().min(1).max(114),
    nameArabic: exactArabicText.max(120),
    nameTransliterated: z.string().trim().min(1).max(120),
    nameEnglish: z.string().trim().min(1).max(120),
    ayahCount: z.number().int().positive().max(400),
    metadataSourceId: identifier,
  })
  .strict();

const ayahSchema = z
  .object({
    surahNumber: z.number().int().min(1).max(114),
    ayahNumber: z.number().int().positive().max(400),
    textUthmani: exactArabicText,
    textSourceId: identifier,
  })
  .strict();

const wordOccurrenceSchema = z
  .object({
    surahNumber: z.number().int().min(1).max(114),
    ayahNumber: z.number().int().positive().max(400),
    position: z.number().int().positive().max(1_000),
    textUthmani: exactArabicText.max(300),
    transliteration: z.string().trim().min(1).max(300).optional(),
    segmentationSourceId: identifier,
  })
  .strict();

export const corpusPackageSchema = z
  .object({
    manifest: z
      .object({
        schemaVersion: z.literal(1),
        packageId: identifier,
        createdAt: z.string().datetime({ offset: true }),
        contentClassification: z.enum(["quranic", "synthetic-test"]),
        scope: z
          .object({
            kind: z.enum(["partial", "complete-quran"]),
            surahNumbers: z.array(z.number().int().min(1).max(114)).min(1).max(114),
            wordSegmentationComplete: z.boolean(),
          })
          .strict(),
        expectedCounts: z
          .object({
            surahs: z.number().int().positive().max(114),
            ayahs: z.number().int().positive().max(10_000),
            wordOccurrences: z.number().int().nonnegative().max(200_000),
          })
          .strict(),
        canonicalTextSha256: sha256,
      })
      .strict(),
    sources: z.array(corpusSourceSchema).min(1),
    surahs: z.array(surahSchema).min(1),
    ayahs: z.array(ayahSchema).min(1),
    wordOccurrences: z.array(wordOccurrenceSchema),
  })
  .strict();

export type CorpusPackage = z.infer<typeof corpusPackageSchema>;
export type CorpusSourceRole = z.infer<typeof corpusSourceRoleSchema>;

export interface CorpusValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface CorpusValidationReport {
  structureValid: boolean;
  readyForImport: boolean;
  packageId?: string;
  counts?: {
    sources: number;
    surahs: number;
    ayahs: number;
    wordOccurrences: number;
  };
  canonicalTextSha256?: string;
  issues: CorpusValidationIssue[];
  warnings: CorpusValidationIssue[];
  corpusPackage?: CorpusPackage;
}

export interface ApprovedCorpusSource {
  id: string;
  role: CorpusSourceRole;
  inputSha256: string;
  licenseUrl: string;
}

export interface CorpusInspectionOptions {
  /**
   * Controlled application configuration, not values copied from the package.
   * A package cannot authorize its own source or licensing claims.
   */
  approvedSources?: ReadonlyArray<ApprovedCorpusSource>;
}

function recordDigestPart(hash: ReturnType<typeof createHash>, fields: Array<string | number>): void {
  for (const field of fields) {
    const value = String(field);
    hash.update(String(Buffer.byteLength(value, "utf8")));
    hash.update(":");
    hash.update(value, "utf8");
    hash.update(";");
  }
  hash.update("\n");
}

/**
 * Hashes exact UTF-8 source strings in coordinate order. No Unicode
 * normalization or Arabic character substitution is performed.
 */
export function computeCanonicalTextSha256(
  ayahs: ReadonlyArray<Pick<CorpusPackage["ayahs"][number], "surahNumber" | "ayahNumber" | "textUthmani">>,
): string {
  const hash = createHash("sha256");
  const ordered = [...ayahs].sort(
    (left, right) =>
      left.surahNumber - right.surahNumber || left.ayahNumber - right.ayahNumber,
  );
  for (const ayah of ordered) {
    recordDigestPart(hash, [ayah.surahNumber, ayah.ayahNumber, ayah.textUthmani]);
  }
  return hash.digest("hex");
}

function key(...parts: Array<string | number>): string {
  return parts.join(":");
}

function addDuplicateIssues(
  issues: CorpusValidationIssue[],
  values: ReadonlyArray<string>,
  path: string,
  label: string,
): void {
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const value of values) {
    if (seen.has(value) && !reported.has(value)) {
      issues.push({ code: "duplicate", path, message: `Duplicate ${label}: ${value}` });
      reported.add(value);
    }
    seen.add(value);
  }
}

function addContiguousIssue(
  issues: CorpusValidationIssue[],
  values: ReadonlyArray<number>,
  path: string,
  label: string,
): void {
  const ordered = [...values].sort((a, b) => a - b);
  if (ordered.some((value, index) => value !== index + 1)) {
    issues.push({
      code: "non_contiguous_positions",
      path,
      message: `${label} must be contiguous and start at 1`,
    });
  }
}

export function inspectCorpusPackage(
  input: unknown,
  options: CorpusInspectionOptions = {},
): CorpusValidationReport {
  const parsed = corpusPackageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      structureValid: false,
      readyForImport: false,
      issues: parsed.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.join("."),
        message: issue.message,
      })),
      warnings: [],
    };
  }

  const corpusPackage = parsed.data;
  const issues: CorpusValidationIssue[] = [];
  const warnings: CorpusValidationIssue[] = [];
  const { manifest, sources, surahs, ayahs, wordOccurrences } = corpusPackage;

  addDuplicateIssues(issues, sources.map((source) => source.id), "sources", "source id");
  addDuplicateIssues(issues, surahs.map((surah) => String(surah.number)), "surahs", "surah number");
  addDuplicateIssues(
    issues,
    ayahs.map((ayah) => key(ayah.surahNumber, ayah.ayahNumber)),
    "ayahs",
    "ayah coordinate",
  );
  addDuplicateIssues(
    issues,
    wordOccurrences.map((word) => key(word.surahNumber, word.ayahNumber, word.position)),
    "wordOccurrences",
    "word coordinate",
  );

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const requireSourceRole = (
    sourceId: string,
    role: CorpusSourceRole,
    path: string,
  ): void => {
    const source = sourceById.get(sourceId);
    if (!source) {
      issues.push({ code: "missing_source", path, message: `Unknown source: ${sourceId}` });
    } else if (source.role !== role) {
      issues.push({
        code: "source_role_mismatch",
        path,
        message: `Source ${sourceId} has role ${source.role}; expected ${role}`,
      });
    }
  };

  surahs.forEach((surah, index) =>
    requireSourceRole(surah.metadataSourceId, "surah-metadata", `surahs.${index}.metadataSourceId`),
  );
  ayahs.forEach((ayah, index) =>
    requireSourceRole(ayah.textSourceId, "canonical-text", `ayahs.${index}.textSourceId`),
  );
  wordOccurrences.forEach((word, index) =>
    requireSourceRole(
      word.segmentationSourceId,
      "word-segmentation",
      `wordOccurrences.${index}.segmentationSourceId`,
    ),
  );

  const expected = manifest.expectedCounts;
  const actualCounts = {
    sources: sources.length,
    surahs: surahs.length,
    ayahs: ayahs.length,
    wordOccurrences: wordOccurrences.length,
  };
  for (const field of ["surahs", "ayahs", "wordOccurrences"] as const) {
    if (expected[field] !== actualCounts[field]) {
      issues.push({
        code: "count_mismatch",
        path: `manifest.expectedCounts.${field}`,
        message: `Expected ${expected[field]}, received ${actualCounts[field]}`,
      });
    }
  }

  const scopeNumbers = manifest.scope.surahNumbers;
  addDuplicateIssues(issues, scopeNumbers.map(String), "manifest.scope.surahNumbers", "scope surah");
  const sortedScope = [...scopeNumbers].sort((a, b) => a - b);
  const sortedSurahs = surahs.map((surah) => surah.number).sort((a, b) => a - b);
  if (JSON.stringify(sortedScope) !== JSON.stringify(sortedSurahs)) {
    issues.push({
      code: "scope_mismatch",
      path: "manifest.scope.surahNumbers",
      message: "Scope surahs must exactly match the included surah records",
    });
  }
  if (manifest.scope.kind === "complete-quran") {
    if (sortedScope.length !== 114 || sortedScope.some((number, index) => number !== index + 1)) {
      issues.push({
        code: "incomplete_quran_scope",
        path: "manifest.scope",
        message: "A complete-Quran package must contain surahs 1 through 114",
      });
    }
  }

  const ayahByKey = new Map(ayahs.map((ayah) => [key(ayah.surahNumber, ayah.ayahNumber), ayah]));
  for (const surah of surahs) {
    const included = ayahs.filter((ayah) => ayah.surahNumber === surah.number);
    if (included.length !== surah.ayahCount) {
      issues.push({
        code: "surah_ayah_count_mismatch",
        path: `surahs.${surah.number}.ayahCount`,
        message: `Surah ${surah.number} declares ${surah.ayahCount} ayahs but includes ${included.length}`,
      });
    }
    addContiguousIssue(
      issues,
      included.map((ayah) => ayah.ayahNumber),
      `ayahs.surah.${surah.number}`,
      `Ayah numbers for surah ${surah.number}`,
    );
  }

  const wordsByAyah = new Map<string, number[]>();
  wordOccurrences.forEach((word, index) => {
    const ayahKey = key(word.surahNumber, word.ayahNumber);
    if (!ayahByKey.has(ayahKey)) {
      issues.push({
        code: "missing_ayah",
        path: `wordOccurrences.${index}`,
        message: `Word points to missing ayah ${ayahKey}`,
      });
    }
    const positions = wordsByAyah.get(ayahKey) ?? [];
    positions.push(word.position);
    wordsByAyah.set(ayahKey, positions);
  });
  if (manifest.scope.wordSegmentationComplete) {
    for (const ayah of ayahs) {
      const ayahKey = key(ayah.surahNumber, ayah.ayahNumber);
      const positions = wordsByAyah.get(ayahKey) ?? [];
      if (positions.length === 0) {
        issues.push({
          code: "missing_word_segmentation",
          path: `wordOccurrences.${ayahKey}`,
          message: `No words supplied for ayah ${ayahKey}`,
        });
      } else {
        addContiguousIssue(
          issues,
          positions,
          `wordOccurrences.${ayahKey}`,
          `Word positions for ayah ${ayahKey}`,
        );
      }
    }
  }

  const canonicalTextSha256 = computeCanonicalTextSha256(ayahs);
  if (canonicalTextSha256 !== manifest.canonicalTextSha256) {
    issues.push({
      code: "canonical_text_digest_mismatch",
      path: "manifest.canonicalTextSha256",
      message: "Canonical text digest does not match the exact included UTF-8 text",
    });
  }

  for (const source of sources) {
    if (source.license.verificationStatus !== "verified") {
      warnings.push({
        code: "source_not_approved",
        path: `sources.${source.id}.license.verificationStatus`,
        message: `Source ${source.id} requires licensing review before import`,
      });
    }
  }
  if (manifest.contentClassification === "quranic") {
    const approvals = new Map((options.approvedSources ?? []).map((source) => [source.id, source]));
    for (const source of sources) {
      const approval = approvals.get(source.id);
      if (
        !approval ||
        approval.role !== source.role ||
        approval.inputSha256 !== source.inputSha256 ||
        approval.licenseUrl !== source.license.url
      ) {
        warnings.push({
          code: "source_not_allowlisted",
          path: `sources.${source.id}`,
          message: `Source ${source.id} does not exactly match the operator-approved source catalog`,
        });
      }
    }
  }
  if (manifest.contentClassification !== "quranic") {
    warnings.push({
      code: "synthetic_content",
      path: "manifest.contentClassification",
      message: "Synthetic test packages can be validated but never imported as Quranic content",
    });
  }

  return {
    structureValid: issues.length === 0,
    readyForImport:
      issues.length === 0 &&
      warnings.length === 0 &&
      manifest.contentClassification === "quranic",
    packageId: manifest.packageId,
    counts: actualCounts,
    canonicalTextSha256,
    issues,
    warnings,
    corpusPackage,
  };
}
