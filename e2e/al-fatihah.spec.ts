import { expect, test } from "@playwright/test";
import type { QuranSurahReady } from "../src/lib/api";

// All content in this fixture is synthetic test data, never Quranic content.
// Only intercepted test responses receive it; production has no fixture mode.
const SYNTHETIC_READY: QuranSurahReady = {
  status: "ready",
  attribution: {
    provider: "Quran Foundation",
    label: "Quran data provided by Quran.Foundation",
    url: "https://quran.foundation/",
    translationName: "Synthetic test translation",
    translationAuthor: "Synthetic test author",
    wordTranslationLanguage: "english",
    recitationName: "Synthetic test reciter",
    recitationStyle: "Synthetic style",
  },
  surah: {
    number: 1,
    nameArabic: "تَجْرِبَةٌ",
    nameTransliterated: "Synthetic chapter — not Quran",
    translatedName: "Test data only",
    verses: [{
      sourceId: 900001,
      number: 1,
      verseKey: "1:1",
      textUthmani: "تَجْرِبَةٌ مُصْطَنَعَةٌ",
      translation: {
        sourceId: 900002,
        text: "Synthetic verse for browser interaction testing.",
        resourceId: 9000,
        resourceName: "Synthetic test translation",
      },
      audio: { url: "https://audio.example.test/synthetic-ayah.mp3", recitationId: 9001 },
      words: [
        {
          sourceId: 900003,
          position: 1,
          textUthmani: "تَجْرِبَةٌ",
          translation: "synthetic exercise",
          audioUrl: "https://audio.example.test/synthetic-word.mp3",
          reference: { surah: 1, ayah: 1, word: 1, verseKey: "1:1" },
        },
        {
          sourceId: 900004,
          position: 2,
          textUthmani: "مُصْطَنَعَةٌ",
          reference: { surah: 1, ayah: 1, word: 2, verseKey: "1:1" },
        },
      ],
    }],
  },
};

const apiPath = "**/api/quran/surahs/1";

test.beforeEach(async ({ context }) => {
  // Keep tests self-contained, including audio controls and credit links.
  await context.route(/^https:\/\//, (route) => route.abort());
});

test("shows the real unconfigured API state without requiring PostgreSQL", async ({ page }) => {
  await page.goto("/quran/al-fatihah");
  await expect(page.getByRole("heading", { name: "Al-Fatihah isn’t connected yet." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quran data provided by Quran.Foundation." })).toBeVisible();
  await expect(page.locator(".quran-word-button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reveal meaning" })).toHaveCount(0);
});

test("preserves RTL text, selects words and completes a meaning recall", async ({ page, isMobile }, testInfo) => {
  await page.route(apiPath, (route) => route.fulfill({ json: { success: true, data: SYNTHETIC_READY } }));
  await page.goto("/quran/al-fatihah");

  const ayah = page.locator(".quran-ayah");
  await expect(ayah).toHaveText(SYNTHETIC_READY.surah.verses[0].textUthmani);
  await expect(ayah).toHaveAttribute("dir", "rtl");
  await expect(ayah).toHaveAttribute("lang", "ar");
  await expect(page.locator(".quran-ready-content")).toHaveAttribute("translate", "no");
  await expect(page.getByText("Translation author: Synthetic test author")).toBeVisible();
  await expect(page.getByText("Recitation style: Synthetic style")).toBeVisible();
  await expect(page.getByLabel("Ayah 1 audio")).toHaveAttribute("src", "https://audio.example.test/synthetic-ayah.mp3");

  const firstWord = page.getByRole("button", { name: /^Word 1 in ayah 1:/ });
  if (isMobile) {
    await firstWord.tap();
  } else {
    await firstWord.focus();
    await firstWord.press("Enter");
  }
  await expect(firstWord).toHaveAttribute("aria-pressed", "true");
  const details = page.locator(isMobile ? ".quran-inline-word-panel" : ".quran-detail-column");
  await expect(details.getByText("synthetic exercise", { exact: true })).toBeVisible();
  await expect(details.locator(".quran-reference")).toContainText("1:1 · Word 1");
  await expect(details.getByLabel("Word 1 audio")).toHaveAttribute("src", "https://audio.example.test/synthetic-word.mp3");

  const recall = page.locator(".quran-recall");
  await expect(recall.getByText("synthetic exercise", { exact: true })).toHaveCount(0);
  await recall.getByRole("button", { name: "Reveal meaning" }).click();
  await expect(recall.getByText("synthetic exercise", { exact: true })).toBeVisible();
  await recall.getByRole("button", { name: "Next word" }).click();
  await expect(recall.getByRole("heading", { name: "A thoughtful first pass." })).toBeVisible();
  await expect(recall.getByText("You reviewed 1 contextual meaning from this surah.")).toBeVisible();
  await recall.getByRole("button", { name: "Practice again" }).click();
  await expect(recall.getByRole("button", { name: "Reveal meaning" })).toBeVisible();

  await page.getByRole("button", { name: /^Word 2 in ayah 1:/ }).click();
  await expect(details.getByText("Contextual meaning is not available from the current source.")).toBeVisible();
  await expect(details.getByText("No verified recording is available for this word.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("synthetic-learning.png"), fullPage: true });
});

test("keeps source text readable while missing meanings lock recall", async ({ page }) => {
  const partial = structuredClone(SYNTHETIC_READY);
  for (const verse of partial.surah.verses) {
    delete verse.translation;
    delete verse.audio;
    for (const word of verse.words) {
      delete word.translation;
      delete word.audioUrl;
    }
  }
  await page.route(apiPath, (route) => route.fulfill({ json: { success: true, data: partial } }));
  await page.goto("/quran/al-fatihah");
  await expect(page.locator(".quran-ayah")).toHaveText(partial.surah.verses[0].textUthmani);
  await expect(page.getByText("Recall practice is waiting for verified meanings.")).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reveal meaning" })).toHaveCount(0);
});

test("shows loading, then content unavailable, and retries", async ({ page }) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let ready = false;
  await page.route(apiPath, async (route) => {
    await pending;
    await route.fulfill({ json: {
      success: true,
      data: !ready
        ? { status: "unavailable", reason: "Synthetic provider outage.", attribution: SYNTHETIC_READY.attribution }
        : SYNTHETIC_READY,
    } });
  });
  await page.goto("/quran/al-fatihah");
  await expect(page.getByRole("status")).toHaveText("Connecting to the Quranic content source…");
  release();
  await expect(page.getByRole("heading", { name: "Al-Fatihah can’t be loaded right now." })).toBeVisible();
  ready = true;
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.locator(".quran-ayah")).toBeVisible();
});

test("surfaces API failures and allows recovery", async ({ page }) => {
  let failing = true;
  await page.route(apiPath, (route) => route.fulfill(failing
    ? { status: 503, json: { success: false, error: { message: "Synthetic API outage." } } }
    : { json: { success: true, data: SYNTHETIC_READY } }));
  await page.goto("/quran/al-fatihah");
  await expect(page.getByRole("alert")).toContainText("Synthetic API outage.");
  failing = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".quran-ayah")).toBeVisible();
});
