import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";

// Opt-in live acceptance: no fixtures, screenshots, traces, response dumps,
// recordings, database access, or saved content. Only aggregate results leave
// this process. The normal offline test suite never runs this script.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverRequire = createRequire(resolve(root, "server/package.json"));
serverRequire("dotenv").config({ path: resolve(root, "server/.env"), quiet: true });
const report = { environment: "prelive", checks: [], upstream: [], audio: {}, frontend: {} };
const privateValues = [process.env.QF_CLIENT_ID, process.env.QF_CLIENT_SECRET].filter(Boolean);
const captured = {};
let stage = "configuration";
let api;
let vite;
let browser;
let pool;

class AcceptanceFailure extends Error {}
function check(condition, label) {
  if (!condition) throw new AcceptanceFailure(label);
  report.checks.push(label);
}

async function waitForReady(page) {
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/quran/surahs/1");
  await page.goto("http://127.0.0.1:4177/quran/al-fatihah");
  const response = await pending;
  const body = await response.json();
  check(response.status() === 200 && body.success && body.data?.status === "ready", `${stage}: genuine API ready response`);
  check(response.headers()["cache-control"] === "no-store", `${stage}: API no-store`);
  check(privateValues.every((value) => !JSON.stringify(body).includes(value)), `${stage}: API contains no credentials or tokens`);
  await page.locator(".quran-ready-content").waitFor();
  return body.data;
}

async function decodedText(page, value) {
  return page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, "text/html");
    doc.querySelectorAll("script,style").forEach((node) => node.remove());
    return doc.body.textContent.replace(/\s+/gu, " ").trim();
  }, value ?? "");
}

async function verifySource(page, ready) {
  const chapter = captured.chapter?.chapter;
  const verses = [...(captured.verses?.verses ?? [])].sort((a, b) => a.verse_number - b.verse_number);
  const translation = captured.translations?.translations?.find((row) => row.id === Number(process.env.QF_TRANSLATION_ID));
  const recitation = captured.recitations?.recitations?.find((row) => row.id === Number(process.env.QF_RECITATION_ID));
  check(chapter?.id === 1 && chapter.verses_count === 7 && verses.length === 7 && ready.surah.verses.length === 7,
    "source: complete seven-ayah Al-Fatihah");
  check(Boolean(translation), "source: selected translation exists in prelive catalog");
  check(ready.attribution.translationName === translation.name && ready.attribution.translationAuthor === translation.author_name,
    "source: translation edition and author attribution match catalog");
  if (process.env.QF_RECITATION_ID) check(Boolean(recitation), "source: selected recitation exists in prelive catalog");
  if (recitation) check(ready.attribution.recitationName === recitation.reciter_name, "source: reciter attribution matches catalog");
  let words = 0;
  let meanings = 0;
  let translations = 0;
  for (const [index, verse] of ready.surah.verses.entries()) {
    const upstream = verses[index];
    check(verse.number === index + 1 && verse.verseKey === `1:${index + 1}` && verse.sourceId === upstream.id,
      `source: ayah ${index + 1} identity`);
    check(verse.textUthmani === upstream.text_uthmani, `source: ayah ${index + 1} exact Arabic Unicode`);
    const sourceAudio = captured.ayahAudio?.audio_files?.find((row) => row.verse_key === verse.verseKey) ?? upstream.audio;
    if (sourceAudio?.url?.trim() && (sourceAudio.verse_key == null || sourceAudio.verse_key === verse.verseKey) && recitation) {
      const audioUrl = new URL(sourceAudio.url, "https://verses.quran.com/");
      if (audioUrl.protocol === "https:") check(verse.audio?.url === audioUrl.href && verse.audio.recitationId === recitation.id,
        `source: ayah ${index + 1} returned audio preserved`);
    }
    const lexical = upstream.words.filter((word) => word.char_type_name === "word");
    check(lexical.length === verse.words.length, `source: ayah ${index + 1} lexical filtering`);
    const sourceTranslation = upstream.translations?.find((row) => row.resource_id === Number(process.env.QF_TRANSLATION_ID));
    if (verse.translation) {
      check(verse.translation.sourceId === sourceTranslation?.id && verse.translation.text === await decodedText(page, sourceTranslation?.text),
        `source: ayah ${index + 1} translation source fidelity`);
      translations += 1;
    }
    for (const [wordIndex, word] of verse.words.entries()) {
      const source = lexical[wordIndex];
      check(word.sourceId === source.id && word.position === source.position && word.textUthmani === source.text_uthmani &&
        source.location === `1:${verse.number}:${word.position}` && source.verse_key === verse.verseKey &&
        word.reference.surah === 1 && word.reference.ayah === verse.number && word.reference.word === word.position &&
        word.reference.verseKey === verse.verseKey, `source: word ${verse.number}:${word.position} mapping`);
      if (word.translation) {
        check(word.translation === await decodedText(page, source.translation?.text), `source: word ${verse.number}:${word.position} contextual meaning fidelity`);
        meanings += 1;
      }
      words += 1;
    }
  }
  report.content = {
    ayahs: 7, words, contextualMeanings: meanings, verseTranslations: translations,
    missingMeanings: words - meanings, missingVerseTranslations: 7 - translations,
    excludedDisplayTokens: verses.reduce((sum, verse) => sum + verse.words.length, 0) - words,
  };
  report.attribution = {
    translation: translation.name, author: translation.author_name,
    translationLanguage: translation.language_name,
    wordMeaningLanguage: ready.attribution.wordTranslationLanguage,
    reciter: recitation?.reciter_name, recitationStyle: recitation?.style,
  };
}

async function verifyReader(page, ready, mobile) {
  const ayahs = page.locator(".quran-ayah");
  check(await ayahs.count() === 7, `${stage}: seven rendered ayahs`);
  for (const [index, verse] of ready.surah.verses.entries()) {
    check(await ayahs.nth(index).textContent() === verse.textUthmani && await ayahs.nth(index).getAttribute("dir") === "rtl" &&
      await ayahs.nth(index).getAttribute("lang") === "ar", `${stage}: ayah ${index + 1} exact RTL rendering`);
  }
  check(await page.locator(".quran-ready-content").getAttribute("translate") === "no" &&
    await page.locator('meta[name="google"]').getAttribute("content") === "notranslate", `${stage}: browser translation protection`);
  const credit = await page.locator(".quran-attribution").textContent();
  check(credit.includes("Quran data provided by Quran.Foundation.") && credit.includes(ready.attribution.translationName) &&
    credit.includes(ready.attribution.translationAuthor), `${stage}: visible source attribution`);
  const words = ready.surah.verses.flatMap((verse) => verse.words);
  const buttons = page.locator(".quran-word-button");
  check(await buttons.count() === words.length, `${stage}: selectable lexical words`);
  for (const [index, word] of words.entries()) {
    const button = buttons.nth(index);
    if (mobile) await button.tap();
    else { await button.focus(); await button.press("Enter"); }
    const panel = page.locator(mobile ? ".quran-inline-word-panel" : ".quran-detail-column");
    check(await button.getAttribute("aria-pressed") === "true" &&
      await panel.locator(".quran-word-heading h2").textContent() === word.textUthmani,
      `${stage}: word ${index + 1} selection`);
    if (word.translation) check(await panel.locator(".word-detail-block strong").textContent() === word.translation,
      `${stage}: word ${index + 1} displayed meaning`);
    check((await panel.locator(".quran-reference").textContent()).includes(`${word.reference.verseKey} · Word ${word.position}`),
      `${stage}: word ${index + 1} displayed reference`);
  }
  const recall = page.locator(".quran-recall");
  const cards = words.filter((word) => word.translation?.trim());
  for (const [index, card] of cards.entries()) {
    check(await recall.locator("h2").textContent() === card.textUthmani && await recall.locator(".recall-answer strong").count() === 0,
      `${stage}: recall ${index + 1} hides answer`);
    await recall.getByRole("button", { name: "Reveal meaning" }).click();
    check(await recall.locator(".recall-answer strong").textContent() === card.translation, `${stage}: recall ${index + 1} exact contextual answer`);
    await recall.getByRole("button", { name: "Next word" }).click();
  }
  if (cards.length) {
    await recall.getByRole("heading", { name: "A thoughtful first pass." }).waitFor();
    await recall.getByRole("button", { name: "Practice again" }).click();
    check(await recall.locator(".recall-answer strong").count() === 0, `${stage}: recall restart`);
  }
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${stage}: no horizontal overflow`);
  const html = await page.content();
  check(privateValues.every((value) => !html.includes(value)), `${stage}: no credentials or token in page`);
  report.frontend[mobile ? "mobile" : "desktop"] = { selectedWords: words.length, recalledMeanings: cards.length, passed: true };
}

async function probeAudio(url) {
  try {
    let response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!response.ok) {
      response = await fetch(url, { headers: { Range: "bytes=0-1023" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
      await response.body?.cancel();
    }
    return { reachable: response.ok && /audio\//i.test(response.headers.get("content-type") ?? ""), status: response.status };
  } catch { return { reachable: false, networkFailure: true }; }
}

async function playSample(page, selector) {
  const element = page.locator(selector).first();
  if (await element.count() === 0) return { status: "no-source" };
  try {
    return await element.evaluate(async (audio) => {
      return new Promise((resolveResult) => {
        const finish = (status) => {
          clearTimeout(timer);
          audio.pause();
          audio.removeEventListener("timeupdate", onTime);
          audio.removeEventListener("error", onError);
          resolveResult({ status, durationAvailable: Number.isFinite(audio.duration) && audio.duration > 0 });
        };
        const onTime = () => { if (audio.currentTime > 0.1) finish("played"); };
        const onError = () => finish("media-error");
        const timer = setTimeout(() => finish("timeout"), 15_000);
        audio.addEventListener("timeupdate", onTime);
        audio.addEventListener("error", onError);
        audio.play().catch(() => finish("play-rejected"));
      });
    });
  } catch { return { status: "browser-error" }; }
}

try {
  check((process.env.QF_ENV ?? "prelive") === "prelive", "prelive-only configuration");
  check(["QF_CLIENT_ID", "QF_CLIENT_SECRET", "QF_TRANSLATION_ID"].every((key) => Boolean(process.env[key]?.trim())), "required settings present");
  // This process cannot reach the user's original PostgreSQL server.
  process.env.DB_HOST = "127.0.0.1";
  process.env.DB_PORT = "1";
  process.env.CORS_ORIGINS = "http://127.0.0.1:4177";
  const { createQuranFoundationProviderFromEnv } = await import("../server/dist/modules/quran/quran-foundation.provider.js");
  const provider = createQuranFoundationProviderFromEnv(process.env, {
    fetch: async (input, init) => {
      const url = new URL(String(input));
      check(["prelive-oauth2.quran.foundation", "apis-prelive.quran.foundation"].includes(url.hostname), "upstream host is prelive");
      const response = await fetch(input, init);
      const endpoint = url.pathname.includes("oauth2/token") ? "oauth" : url.pathname.includes("resources/translations") ? "translations" :
        url.pathname.includes("resources/recitations") ? "recitations" : url.pathname.includes("verses/by_chapter/1") ? "verses" :
        url.pathname.includes("/recitations/") ? "ayahAudio" : "chapter";
      report.upstream.push({ endpoint, status: response.status });
      if (response.ok) {
        const body = await response.clone().json();
        if (endpoint === "oauth") { privateValues.push(body.access_token); report.authentication = "succeeded"; }
        else captured[endpoint] = body;
      }
      return response;
    },
  });
  check(provider.getStatus().status === "configured", "provider configured for prelive");
  const { createApp } = await import("../server/dist/app.js");
  ({ pool } = await import("../server/dist/db.js"));
  let databaseCalls = 0;
  pool.query = pool.connect = () => { databaseCalls += 1; throw new AcceptanceFailure("Database access is forbidden during live acceptance"); };
  api = createApp({ quranProvider: provider }).listen(0, "127.0.0.1");
  await new Promise((resolveReady, reject) => { api.once("listening", resolveReady); api.once("error", reject); });
  process.env.VITE_API_URL = `http://127.0.0.1:${api.address().port}`;
  // This acceptance run verifies public reading; never inherit a real account.
  process.env.VITE_SUPABASE_URL = "";
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "";
  stage = "local frontend startup";
  const { createServer } = await import("vite");
  vite = await createServer({ root, logLevel: "silent", server: { host: "127.0.0.1", port: 4177, strictPort: true } });
  await vite.listen();
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    args: ["--disk-cache-size=0", "--media-cache-size=0", "--autoplay-policy=no-user-gesture-required"] });

  let ready;
  for (const mobile of [false, true]) {
    stage = mobile ? "mobile" : "desktop";
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile, hasTouch: mobile, serviceWorkers: "block" });
    const page = await context.newPage();
    ready = await waitForReady(page);
    await verifySource(page, ready);
    await verifyReader(page, ready, mobile);
    if (!mobile) {
      stage = "audio playback";
      await page.locator(".quran-word-button").first().click();
      report.audio.wordPlayback = await playSample(page, ".quran-detail-column audio");
      report.audio.ayahPlayback = await playSample(page, ".quran-verse-audio audio");
    }
    if (mobile) {
      stage = "missing-fields degradation";
      const partial = structuredClone(ready);
      partial.surah.verses.forEach((verse) => {
        delete verse.translation; delete verse.audio;
        verse.words.forEach((word) => { delete word.translation; delete word.audioUrl; });
      });
      const pattern = "**/api/quran/surahs/1";
      await page.route(pattern, (route) => route.fulfill({ json: { success: true, data: partial } }));
      await page.reload();
      await page.locator(".quran-practice-locked").waitFor();
      const texts = await page.locator(".quran-ayah").allTextContents();
      check(texts.length === 7 && texts.every((text, index) => text === ready.surah.verses[index].textUthmani), "missing-fields: all genuine Arabic remains intact");
      check(await page.locator("audio").count() === 0 && await page.getByRole("button", { name: "Reveal meaning" }).count() === 0,
        "missing-fields: unavailable practice and audio are omitted");
      await page.unroute(pattern);
      stage = "API error and retry";
      await page.route(pattern, (route) => route.fulfill({ status: 503, json: { success: false, error: { message: "Acceptance test temporary failure" } } }));
      await page.reload();
      await page.getByRole("alert").waitFor();
      check(await page.getByRole("button", { name: "Try again" }).isVisible(), "API error: recovery action available");
      await page.unroute(pattern);
      await page.getByRole("button", { name: "Try again" }).click();
      await page.locator(".quran-ready-content").waitFor();
      check(await page.locator(".quran-ayah").count() === 7, "API retry: genuine provider response restored");
    }
    await context.close();
  }
  stage = "audio reachability";
  const wordUrls = ready.surah.verses.flatMap((verse) => verse.words.flatMap((word) => word.audioUrl ? [word.audioUrl] : []));
  const ayahUrls = ready.surah.verses.flatMap((verse) => verse.audio?.url ? [verse.audio.url] : []);
  for (const [kind, urls] of [["words", wordUrls], ["ayahs", ayahUrls]]) {
    const results = [];
    for (let index = 0; index < urls.length; index += 4) results.push(...await Promise.all(urls.slice(index, index + 4).map(probeAudio)));
    report.audio[kind] = { supplied: urls.length, reachable: results.filter((item) => item.reachable).length,
      unavailable: results.filter((item) => !item.reachable).map((item) => ({ status: item.status, networkFailure: item.networkFailure })) };
  }
  check(databaseCalls === 0, "no database calls");
  report.audio.missingWordSources = report.content.words - wordUrls.length;
  report.audio.missingAyahSources = process.env.QF_RECITATION_ID ? 7 - ayahUrls.length : undefined;
  const audioUnavailable = report.audio.words.reachable !== wordUrls.length || report.audio.ayahs.reachable !== ayahUrls.length ||
    report.audio.missingWordSources > 0 || report.audio.missingAyahSources > 0 ||
    [report.audio.wordPlayback, report.audio.ayahPlayback].some((sample) => !["played", "no-source"].includes(sample.status));
  report.status = audioUnavailable ? "passed-with-audio-unavailable" : "passed";
  report.note = "Source fidelity and application behavior verified against genuine prelive responses; audio results describe reachability and sample decoding/playback.";
} catch (error) {
  report.status = "failed";
  report.failedStage = stage;
  report.failure = error instanceof AcceptanceFailure ? error.message : "An operation failed; raw exception details are suppressed to protect provider data and credentials.";
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await vite?.close().catch(() => {});
  if (api) await new Promise((resolveClosed) => api.close(resolveClosed));
  await pool?.end().catch(() => {});
  report.passedChecks = report.checks.length;
  delete report.checks;
  console.log(JSON.stringify(report, null, 2));
}
