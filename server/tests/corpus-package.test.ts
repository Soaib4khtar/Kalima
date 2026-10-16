import assert from "node:assert/strict";
import test from "node:test";

import {
  computeCanonicalTextSha256,
  inspectCorpusPackage,
} from "../src/modules/corpus/corpus-package.ts";

// Deliberately synthetic Arabic: this fixture is never Quranic source data.
function makeSyntheticPackage() {
  const ayahs = [
    {
      surahNumber: 1,
      ayahNumber: 1,
      textUthmani: "نَصٌّ تَجْرِيبِيٌّ",
      textSourceId: "fixture-text@1",
    },
    {
      surahNumber: 1,
      ayahNumber: 2,
      textUthmani: "نَصٌّ ثَانٍ",
      textSourceId: "fixture-text@1",
    },
  ];

  return {
    manifest: {
      schemaVersion: 1,
      packageId: "kalima.synthetic-fixture@1",
      createdAt: "2026-10-16T12:00:00.000Z",
      contentClassification: "synthetic-test",
      scope: {
        kind: "partial",
        surahNumbers: [1],
        wordSegmentationComplete: true,
      },
      expectedCounts: { surahs: 1, ayahs: 2, wordOccurrences: 3 },
      canonicalTextSha256: computeCanonicalTextSha256(ayahs),
    },
    sources: [
      {
        id: "fixture-metadata@1",
        datasetId: "fixture-metadata",
        role: "surah-metadata",
        title: "Synthetic metadata fixture",
        version: "1",
        provider: "Kalima tests",
        homepageUrl: "https://example.invalid",
        sourceUrl: "https://example.invalid/metadata",
        upstreamResourceId: "fixture-metadata-1",
        retrievedAt: "2026-10-16T12:00:00.000Z",
        termsCheckedAt: "2026-10-16T12:00:00.000Z",
        inputSha256: "1".repeat(64),
        license: {
          name: "Test fixture only",
          url: "https://example.invalid/license",
          attribution: "Synthetic test content created for Kalima validation tests.",
          verificationStatus: "verified",
        },
      },
      {
        id: "fixture-text@1",
        datasetId: "fixture-text",
        role: "canonical-text",
        title: "Synthetic Arabic text fixture",
        version: "1",
        provider: "Kalima tests",
        homepageUrl: "https://example.invalid",
        sourceUrl: "https://example.invalid/text",
        upstreamResourceId: "fixture-text-1",
        retrievedAt: "2026-10-16T12:00:00.000Z",
        termsCheckedAt: "2026-10-16T12:00:00.000Z",
        inputSha256: "2".repeat(64),
        license: {
          name: "Test fixture only",
          url: "https://example.invalid/license",
          attribution: "Synthetic test content created for Kalima validation tests.",
          verificationStatus: "verified",
        },
      },
      {
        id: "fixture-segmentation@1",
        datasetId: "fixture-segmentation",
        role: "word-segmentation",
        title: "Synthetic segmentation fixture",
        version: "1",
        provider: "Kalima tests",
        homepageUrl: "https://example.invalid",
        sourceUrl: "https://example.invalid/segmentation",
        upstreamResourceId: "fixture-segmentation-1",
        retrievedAt: "2026-10-16T12:00:00.000Z",
        termsCheckedAt: "2026-10-16T12:00:00.000Z",
        inputSha256: "3".repeat(64),
        license: {
          name: "Test fixture only",
          url: "https://example.invalid/license",
          attribution: "Synthetic test content created for Kalima validation tests.",
          verificationStatus: "verified",
        },
      },
    ],
    surahs: [
      {
        number: 1,
        nameArabic: "اِخْتِبَار",
        nameTransliterated: "Ikhtibar",
        nameEnglish: "Synthetic test",
        ayahCount: 2,
        metadataSourceId: "fixture-metadata@1",
      },
    ],
    ayahs,
    wordOccurrences: [
      {
        surahNumber: 1,
        ayahNumber: 1,
        position: 1,
        textUthmani: "نَصٌّ",
        segmentationSourceId: "fixture-segmentation@1",
      },
      {
        surahNumber: 1,
        ayahNumber: 1,
        position: 2,
        textUthmani: "تَجْرِيبِيٌّ",
        segmentationSourceId: "fixture-segmentation@1",
      },
      {
        surahNumber: 1,
        ayahNumber: 2,
        position: 1,
        textUthmani: "ثَانٍ",
        segmentationSourceId: "fixture-segmentation@1",
      },
    ],
  };
}

test("a structurally valid synthetic package is never production-importable", () => {
  const report = inspectCorpusPackage(makeSyntheticPackage());
  assert.equal(report.structureValid, true);
  assert.equal(report.readyForImport, false);
  assert.deepEqual(report.issues, []);
  assert.ok(report.warnings.some((warning) => warning.code === "synthetic_content"));
  assert.deepEqual(report.counts, {
    sources: 3,
    surahs: 1,
    ayahs: 2,
    wordOccurrences: 3,
  });
});

test("duplicate occurrence coordinates are rejected", () => {
  const input = makeSyntheticPackage();
  input.wordOccurrences.push({ ...input.wordOccurrences[1] });
  input.manifest.expectedCounts.wordOccurrences = 4;

  const report = inspectCorpusPackage(input);
  assert.equal(report.structureValid, false);
  assert.ok(report.issues.some((issue) => issue.code === "duplicate"));
});

test("ayah and word positions must be contiguous", () => {
  const input = makeSyntheticPackage();
  input.wordOccurrences[1].position = 3;

  const report = inspectCorpusPackage(input);
  assert.equal(report.structureValid, false);
  assert.ok(report.issues.some((issue) => issue.code === "non_contiguous_positions"));
});

test("every provenance reference must exist and have the required role", () => {
  const input = makeSyntheticPackage();
  input.ayahs[0].textSourceId = "fixture-segmentation@1";
  input.wordOccurrences[0].segmentationSourceId = "missing-source@1";

  const report = inspectCorpusPackage(input);
  assert.ok(report.issues.some((issue) => issue.code === "source_role_mismatch"));
  assert.ok(report.issues.some((issue) => issue.code === "missing_source"));
});

test("exact canonical text digest changes on a Unicode representation change", () => {
  const decomposed = computeCanonicalTextSha256([
    { surahNumber: 1, ayahNumber: 1, textUthmani: "ا\u0654" },
  ]);
  const composed = computeCanonicalTextSha256([
    { surahNumber: 1, ayahNumber: 1, textUthmani: "أ" },
  ]);
  assert.notEqual(decomposed, composed);

  const input = makeSyntheticPackage();
  input.ayahs[0].textUthmani += " ا";
  const report = inspectCorpusPackage(input);
  assert.ok(report.issues.some((issue) => issue.code === "canonical_text_digest_mismatch"));
});

test("unverified licensing blocks import without making the package malformed", () => {
  const input = makeSyntheticPackage();
  input.sources[0].license.verificationStatus = "review-required";

  const report = inspectCorpusPackage(input);
  assert.equal(report.structureValid, true);
  assert.equal(report.readyForImport, false);
  assert.ok(report.warnings.some((warning) => warning.code === "source_not_approved"));
});

test("a package cannot authorize its own Quranic source claims", () => {
  const input = makeSyntheticPackage();
  input.manifest.contentClassification = "quranic";

  const report = inspectCorpusPackage(input);
  assert.equal(report.structureValid, true);
  assert.equal(report.readyForImport, false);
  assert.ok(report.warnings.some((warning) => warning.code === "source_not_allowlisted"));
});

test("complete-Quran claims require every surah number", () => {
  const input = makeSyntheticPackage();
  input.manifest.scope.kind = "complete-quran";

  const report = inspectCorpusPackage(input);
  assert.equal(report.structureValid, false);
  assert.ok(report.issues.some((issue) => issue.code === "incomplete_quran_scope"));
});
