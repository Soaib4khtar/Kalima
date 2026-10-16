import assert from "node:assert/strict";
import test from "node:test";
import type { QuranSurah } from "../src/lib/api.ts";
import {
  createQuranRecallCards,
  createQuranRecallSession,
  occurrenceId,
  quranRecallReducer,
  safeHttpsUrl,
} from "../src/features/quran/quran-learning.ts";

const SYNTHETIC_SURAH_FIXTURE: QuranSurah = {
  number: 99,
  nameArabic: "SYNTHETIC_NAME",
  nameTransliterated: "Synthetic chapter",
  translatedName: "Test data only",
  verses: [{
    sourceId: 99003,
    number: 3,
    verseKey: "99:3",
    textUthmani: "SYNTHETIC VERSE — NOT QURAN",
    translation: { sourceId: 99901, text: "Synthetic verse translation", resourceId: 999, resourceName: "Synthetic resource" },
    words: [
      { sourceId: 9900301, position: 1, textUthmani: "SYNTHETIC_WORD_A", translation: "first meaning", transliteration: "example-a", reference: { surah: 99, ayah: 3, word: 1, verseKey: "99:3" } },
      { sourceId: 9900302, position: 2, textUthmani: "SYNTHETIC_WORD_B", translation: "", reference: { surah: 99, ayah: 3, word: 2, verseKey: "99:3" } },
      { sourceId: 9900303, position: 3, textUthmani: "SYNTHETIC_WORD_C", reference: { surah: 99, ayah: 3, word: 3, verseKey: "99:3" } },
      { sourceId: 9900304, position: 4, textUthmani: "SYNTHETIC_WORD_D", translation: "fourth meaning", reference: { surah: 99, ayah: 3, word: 4, verseKey: "99:3" } },
    ],
  }],
};

test("recall cards include only occurrences with source-provided meanings", () => {
  assert.deepEqual(createQuranRecallCards(SYNTHETIC_SURAH_FIXTURE), [
    {
      id: "99:3:1",
      textUthmani: "SYNTHETIC_WORD_A",
      meaning: "first meaning",
      transliteration: "example-a",
      reference: "99:3 · Word 1",
    },
    {
      id: "99:3:4",
      textUthmani: "SYNTHETIC_WORD_D",
      meaning: "fourth meaning",
      reference: "99:3 · Word 4",
    },
  ]);
});

test("occurrence IDs preserve surah, ayah, and word positions", () => {
  assert.equal(occurrenceId(12, 34, 5), "12:34:5");
});

test("source-provided Unicode is preserved without normalization", () => {
  // Deliberately synthetic Arabic-script sequence; this is not Quranic text.
  const syntheticUnicode = "\u062A\u064E\u062C\u0652\u0631\u0650\u0628\u064E\u0629";
  const fixture: QuranSurah = {
    ...SYNTHETIC_SURAH_FIXTURE,
    verses: [{
      ...SYNTHETIC_SURAH_FIXTURE.verses[0],
      words: [{
        sourceId: 9900301,
        position: 1,
        textUthmani: syntheticUnicode,
        translation: "synthetic meaning",
        reference: { surah: 99, ayah: 3, word: 1, verseKey: "99:3" },
      }],
    }],
  };

  assert.equal(createQuranRecallCards(fixture)[0]?.textUthmani, syntheticUnicode);
});

test("recall answers must be revealed before moving forward", () => {
  const initial = createQuranRecallSession(["a", "b"]);
  assert.equal(quranRecallReducer(initial, { type: "next" }), initial);
  const revealed = quranRecallReducer(initial, { type: "reveal" });
  assert.equal(revealed.revealed, true);
  assert.deepEqual(quranRecallReducer(revealed, { type: "next" }), {
    cardIds: ["a", "b"],
    currentIndex: 1,
    revealed: false,
    complete: false,
  });
});

test("recall session completes after the last revealed meaning and can restart", () => {
  let state = createQuranRecallSession(["only-card"]);
  state = quranRecallReducer(state, { type: "reveal" });
  state = quranRecallReducer(state, { type: "next" });
  assert.equal(state.complete, true);
  assert.deepEqual(quranRecallReducer(state, { type: "restart" }), createQuranRecallSession(["only-card"]));
});

test("empty and duplicate card sets are handled deterministically", () => {
  assert.equal(createQuranRecallSession([]).complete, true);
  assert.deepEqual(createQuranRecallSession(["a", "a", "b"]).cardIds, ["a", "b"]);
});

test("media and attribution links accept HTTPS only", () => {
  assert.equal(safeHttpsUrl("https://content.example.test/audio.mp3"), "https://content.example.test/audio.mp3");
  assert.equal(safeHttpsUrl("http://content.example.test/audio.mp3"), null);
  assert.equal(safeHttpsUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpsUrl("not a URL"), null);
});
