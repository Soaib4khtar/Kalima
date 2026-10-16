import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, describe, test } from "node:test";

import { createApp } from "../src/app.ts";
import type { QuranContentProvider } from "../src/modules/quran/quran-content-provider.ts";
import {
  createQuranFoundationProviderFromEnv,
  QuranFoundationProvider,
} from "../src/modules/quran/quran-foundation.provider.ts";
import {
  quranProviderStatusResponseSchema,
  quranSurahResponseSchema,
} from "../src/modules/quran/quran.schemas.ts";
import { pool } from "../src/db.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Every Arabic string and all metadata below are deliberately synthetic test
// data. They are not presented as, and must never be imported as, Quran text.
const syntheticChapter = {
  chapter: {
    id: 1,
    name_arabic: "سُورَةُ التَّدْرِيبِ",
    name_complex: "At-Tadrib",
    verses_count: 2,
    translated_name: { name: "The Synthetic Exercise" },
  },
};

const syntheticVerses = {
  verses: [
    {
      chapter_id: 1,
      id: 101,
      verse_number: 1,
      verse_key: "1:1",
      text_uthmani: "هَذِهِ جُمْلَةٌ تَعْلِيمِيَّةٌ",
      words: [
        {
          position: 1,
          id: 1001,
          text_uthmani: "هَذِهِ",
          verse_key: "1:1",
          location: "1:1:1",
          char_type_name: "word",
          audio_url: "wbw/synthetic_001.mp3",
          translation: { text: "this", language_name: "english" },
          transliteration: { text: "hadhihi", language_name: "english" },
        },
        {
          position: 2,
          id: 1002,
          text_uthmani: "جُمْلَةٌ",
          verse_key: "1:1",
          location: "1:1:2",
          char_type_name: "word",
          translation: { text: "sentence", language_name: "english" },
          transliteration: { text: "jumlatun", language_name: "english" },
        },
        {
          position: 3,
          id: 1003,
          verse_key: "1:1",
          location: "1:1:3",
          char_type_name: "end",
        },
      ],
      translations: [
        {
          id: 5001,
          resource_id: 9001,
          resource_name: "Synthetic Test Translation",
          language_name: "english",
          verse_key: "1:1",
          text: "A <strong>synthetic</strong> translation &amp; note<script>bad()</script>",
        },
      ],
      audio: {
        verse_key: "1:1",
        url: "SyntheticReciter/mp3/001001.mp3",
      },
    },
    {
      chapter_id: 1,
      id: 102,
      verse_number: 2,
      verse_key: "1:2",
      text_uthmani: "نَصٌّ مُصْطَنَعٌ لِلاِخْتِبَارِ",
      words: [
        {
          position: 1,
          id: 2001,
          text_uthmani: "نَصٌّ",
          verse_key: "1:2",
          location: "1:2:1",
          char_type_name: "word",
          translation: { text: "text", language_name: "english" },
          transliteration: { text: "nassun", language_name: "english" },
        },
      ],
      translations: [
        {
          id: 5002,
          resource_id: 9001,
          resource_name: "Synthetic Test Translation",
          language_name: "english",
          verse_key: "1:2",
          text: "Synthetic text for a contract test.",
        },
      ],
      audio: {
        verse_key: "1:2",
        url: "https://verses.quran.foundation/SyntheticReciter/mp3/001002.mp3",
      },
    },
  ],
  pagination: {
    next_page: null,
    total_records: 2,
  },
};

const syntheticRecitations = {
  recitations: [
    {
      id: 7001,
      reciter_name: "Synthetic Test Reciter",
      style: "Synthetic Style",
    },
  ],
};

const syntheticTranslations = {
  translations: [
    {
      id: 9001,
      name: "Synthetic Test Translation",
      author_name: "Synthetic Test Author",
      language_name: "english",
    },
  ],
};

function configuredProvider(fetchImplementation: typeof fetch, now?: () => number) {
  return new QuranFoundationProvider({
    environment: "prelive",
    clientId: "test-client",
    clientSecret: "test-secret",
    translationId: 9001,
    recitationId: 7001,
    services: {
      authBaseUrl: "https://auth.example.test",
      gatewayUrl: "https://api.example.test",
    },
    fetch: fetchImplementation,
    now,
    requestTimeoutMs: 1_000,
  });
}

describe("Quran Foundation provider contract", () => {
  test("reports missing server configuration without making a request", async () => {
    let calls = 0;
    const provider = createQuranFoundationProviderFromEnv(
      { QF_ENV: "prelive" },
      {
        fetch: (async () => {
          calls += 1;
          throw new Error("fetch must not run");
        }) as typeof fetch,
      },
    );

    assert.equal(provider.getStatus().status, "unconfigured");
    const result = await provider.getSurah(1);
    assert.equal(result.status, "unconfigured");
    assert.equal(result.attribution.provider, "Quran Foundation");
    assert.equal(calls, 0);
  });

  test("authenticates server-side and normalizes verified lexical content", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/oauth2/token")) {
        return jsonResponse({ access_token: "server-token", expires_in: 3600 });
      }
      if (url.includes("/chapters/1")) return jsonResponse(syntheticChapter);
      if (url.includes("/resources/translations")) return jsonResponse(syntheticTranslations);
      if (url.includes("/resources/recitations")) return jsonResponse(syntheticRecitations);
      if (url.includes("/verses/by_chapter/1")) return jsonResponse(syntheticVerses);
      return jsonResponse({}, 404);
    }) as typeof fetch;

    const result = await configuredProvider(mockFetch).getSurah(1);
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;

    assert.equal(result.surah.nameArabic, syntheticChapter.chapter.name_arabic);
    assert.equal(result.surah.verses[0]?.textUthmani, syntheticVerses.verses[0]?.text_uthmani);
    assert.equal(
      result.surah.verses[0]?.translation?.text,
      "A synthetic translation & note",
    );
    assert.equal(result.surah.verses[0]?.translation?.sourceId, 5001);
    assert.equal(result.surah.verses[0]?.words.length, 2);
    assert.deepEqual(result.surah.verses[0]?.words[0]?.reference, {
      surah: 1,
      ayah: 1,
      word: 1,
      verseKey: "1:1",
    });
    assert.equal(result.surah.verses[0]?.sourceId, 101);
    assert.equal(result.surah.verses[0]?.words[0]?.sourceId, 1001);
    assert.equal(
      result.surah.verses[0]?.words[0]?.audioUrl,
      "https://audio.qurancdn.com/wbw/synthetic_001.mp3",
    );
    assert.equal(
      result.surah.verses[0]?.audio?.url,
      "https://verses.quran.com/SyntheticReciter/mp3/001001.mp3",
    );
    assert.equal(
      result.surah.verses[1]?.audio?.url,
      "https://verses.quran.foundation/SyntheticReciter/mp3/001002.mp3",
    );
    assert.equal(result.attribution.translationName, "Synthetic Test Translation");
    assert.equal(result.attribution.translationAuthor, "Synthetic Test Author");
    assert.equal(result.attribution.translationLanguage, "english");
    assert.equal(result.attribution.wordTranslationLanguage, "english");
    assert.equal(result.attribution.recitationName, "Synthetic Test Reciter");
    assert.equal(result.attribution.recitationStyle, "Synthetic Style");

    const tokenCall = calls[0];
    assert.ok(tokenCall);
    const tokenHeaders = new Headers(tokenCall.init?.headers);
    assert.equal(
      tokenHeaders.get("Authorization"),
      `Basic ${Buffer.from("test-client:test-secret").toString("base64")}`,
    );
    assert.equal(
      String(tokenCall.init?.body),
      "grant_type=client_credentials&scope=content",
    );

    const versesCall = calls.find((call) => call.url.includes("/verses/by_chapter/1"));
    assert.ok(versesCall);
    const versesUrl = new URL(versesCall.url);
    assert.equal(versesUrl.searchParams.get("words"), "true");
    assert.equal(versesUrl.searchParams.get("translations"), "9001");
    assert.equal(versesUrl.searchParams.get("audio"), "7001");
    assert.equal(versesUrl.searchParams.get("fields"), "text_uthmani");
    assert.equal(
      versesUrl.searchParams.get("word_fields"),
      "text_uthmani,verse_key,location",
    );
    assert.equal(
      versesUrl.searchParams.get("translation_fields"),
      "id,resource_name,language_name,verse_key",
    );
    const contentHeaders = new Headers(versesCall.init?.headers);
    assert.equal(contentHeaders.get("x-auth-token"), "server-token");
    assert.equal(contentHeaders.get("x-client-id"), "test-client");
  });

  test("refreshes once after a 401 and reuses the replacement token", async () => {
    let tokenRequests = 0;
    let chapterRequests = 0;
    const chapterTokens: Array<string | null> = [];
    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/oauth2/token")) {
        tokenRequests += 1;
        return jsonResponse({ access_token: `token-${tokenRequests}`, expires_in: 3600 });
      }
      if (url.includes("/chapters/1")) {
        chapterRequests += 1;
        chapterTokens.push(new Headers(init?.headers).get("x-auth-token"));
        return chapterRequests === 1
          ? jsonResponse({ success: false }, 401)
          : jsonResponse(syntheticChapter);
      }
      if (url.includes("/resources/translations")) return jsonResponse(syntheticTranslations);
      if (url.includes("/verses/by_chapter/1")) return jsonResponse(syntheticVerses);
      return jsonResponse({}, 404);
    }) as typeof fetch;

    const provider = new QuranFoundationProvider({
      environment: "prelive",
      clientId: "test-client",
      clientSecret: "test-secret",
      translationId: 9001,
      services: {
        authBaseUrl: "https://auth.example.test",
        gatewayUrl: "https://api.example.test",
      },
      fetch: mockFetch,
    });
    const result = await provider.getSurah(1);

    assert.equal(result.status, "ready");
    assert.equal(tokenRequests, 2);
    assert.deepEqual(chapterTokens, ["token-1", "token-2"]);
  });

  test("coalesces token refreshes and never caches Quran content", async () => {
    let tokenRequests = 0;
    let verseRequests = 0;
    let now = 0;
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/oauth2/token")) {
        tokenRequests += 1;
        return jsonResponse({ access_token: `token-${tokenRequests}`, expires_in: 3600 });
      }
      if (url.includes("/chapters/1")) return jsonResponse(syntheticChapter);
      if (url.includes("/resources/translations")) return jsonResponse(syntheticTranslations);
      if (url.includes("/resources/recitations")) return jsonResponse(syntheticRecitations);
      if (url.includes("/verses/by_chapter/1")) {
        verseRequests += 1;
        return jsonResponse(syntheticVerses);
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
    const provider = configuredProvider(mockFetch, () => now);
    const results = await Promise.all([provider.getSurah(1), provider.getSurah(1)]);
    assert.ok(results.every((result) => result.status === "ready"));
    assert.equal(tokenRequests, 1);
    assert.equal(verseRequests, 2);
    now = 3_600_000;
    assert.equal((await provider.getSurah(1)).status, "ready");
    assert.equal(tokenRequests, 2);
    assert.equal(verseRequests, 3);
  });

  test("preserves exact Arabic Unicode and ignores nonlexical marker metadata", async () => {
    const input = structuredClone(syntheticVerses);
    // Decomposed alef/hamza is deliberately different from NFC; never normalize.
    const exactArabic = "\u0627\u0654\u064E\u062A\u064E\u062C\u0652\u0631\u0650\u0628\u064E\u0629";
    assert.notEqual(exactArabic, exactArabic.normalize("NFC"));
    input.verses[0]!.text_uthmani = exactArabic;
    input.verses[0]!.words[0]!.text_uthmani = exactArabic;
    delete input.verses[0]!.words[2]!.verse_key;
    delete input.verses[0]!.words[2]!.location;
    const mockFetch = (async (request: RequestInfo | URL) => {
      const url = String(request);
      if (url.endsWith("/oauth2/token")) return jsonResponse({ access_token: "token", expires_in: 3600 });
      if (url.includes("/chapters/1")) return jsonResponse(syntheticChapter);
      if (url.includes("/resources/translations")) return jsonResponse(syntheticTranslations);
      if (url.includes("/resources/recitations")) return jsonResponse(syntheticRecitations);
      if (url.includes("/verses/by_chapter/1")) return jsonResponse(input);
      return jsonResponse({}, 404);
    }) as typeof fetch;
    const result = await configuredProvider(mockFetch).getSurah(1);
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    assert.equal(result.surah.verses[0]?.textUthmani, exactArabic);
    assert.equal(result.surah.verses[0]?.words[0]?.textUthmani, exactArabic);
    assert.equal(result.surah.verses[0]?.words.length, 2);
  });

  test("bounds upstream failures and exposes safe availability reasons", async (context) => {
    for (const status of [400, 401, 403, 404, 422, 429, 500, 503]) {
      await context.test(`HTTP ${status}`, async () => {
        let tokenRequests = 0;
        let contentRequests = 0;
        const mockFetch = (async (input: RequestInfo | URL) => {
          if (String(input).endsWith("/oauth2/token")) {
            tokenRequests += 1;
            return jsonResponse({ access_token: "private-token", expires_in: 3600 });
          }
          contentRequests += 1;
          return jsonResponse({ message: "private provider response" }, status);
        }) as typeof fetch;
        const result = await configuredProvider(mockFetch).getSurah(1);
        assert.equal(result.status, "unavailable");
        assert.equal(contentRequests, status === 401 ? 2 : 1);
        assert.equal(tokenRequests, status === 401 ? 2 : 1);
        assert.doesNotMatch(JSON.stringify(result), /private-token|test-secret|private provider response/);
      });
    }
    await context.test("network timeout", async () => {
      const provider = configuredProvider((async () => {
        throw new DOMException("private network context", "TimeoutError");
      }) as typeof fetch);
      const result = await provider.getSurah(1);
      assert.equal(result.status, "unavailable");
      assert.doesNotMatch(JSON.stringify(result), /private network context/);
    });
  });

  test("keeps verified Arabic ready when optional translations and audio are absent", async () => {
    const partialContent = structuredClone(syntheticVerses);
    partialContent.verses.forEach((verse) => {
      verse.translations = [];
      delete verse.audio;
    });
    delete partialContent.verses[0]!.words[0]!.translation;
    delete partialContent.verses[0]!.words[0]!.transliteration;
    delete partialContent.verses[0]!.words[0]!.audio_url;
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/oauth2/token")) {
        return jsonResponse({ access_token: "server-token", expires_in: 3600 });
      }
      if (url.includes("/chapters/1")) return jsonResponse(syntheticChapter);
      if (url.includes("/resources/translations")) return jsonResponse(syntheticTranslations);
      if (url.includes("/resources/recitations")) return jsonResponse({ recitations: [] });
      if (url.includes("/verses/by_chapter/1")) return jsonResponse(partialContent);
      return jsonResponse({}, 404);
    }) as typeof fetch;

    const result = await configuredProvider(mockFetch).getSurah(1);
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    assert.equal(result.surah.verses[0]?.translation, undefined);
    assert.equal(result.surah.verses[0]?.audio, undefined);
    assert.equal(result.surah.verses[0]?.words[0]?.translation, undefined);
    assert.equal(result.surah.verses[0]?.words[0]?.transliteration, undefined);
    assert.equal(result.surah.verses[0]?.words[0]?.audioUrl, undefined);
  });

  test("does not use a translation ID missing from the same-environment catalog", async () => {
    let versesRequested = false;
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/oauth2/token")) {
        return jsonResponse({ access_token: "server-token", expires_in: 3600 });
      }
      if (url.includes("/chapters/1")) return jsonResponse(syntheticChapter);
      if (url.includes("/resources/translations")) {
        return jsonResponse({ translations: [] });
      }
      if (url.includes("/verses/by_chapter/1")) versesRequested = true;
      return jsonResponse({}, 404);
    }) as typeof fetch;

    const result = await configuredProvider(mockFetch).getSurah(1);
    assert.equal(result.status, "unavailable");
    assert.equal(versesRequested, false);
    if (result.status === "unavailable") {
      assert.match(result.reason, /configured Quran Foundation resource/i);
    }
  });

  test("rejects an upstream payload whose canonical Arabic field is invalid", async () => {
    const invalidVerses = structuredClone(syntheticVerses);
    invalidVerses.verses[0]!.text_uthmani = "not Arabic";
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/oauth2/token")) {
        return jsonResponse({ access_token: "server-token", expires_in: 3600 });
      }
      if (url.includes("/chapters/1")) return jsonResponse(syntheticChapter);
      if (url.includes("/resources/translations")) return jsonResponse(syntheticTranslations);
      if (url.includes("/resources/recitations")) return jsonResponse(syntheticRecitations);
      if (url.includes("/verses/by_chapter/1")) return jsonResponse(invalidVerses);
      return jsonResponse({}, 404);
    }) as typeof fetch;

    const result = await configuredProvider(mockFetch).getSurah(1);
    assert.equal(result.status, "unavailable");
    if (result.status === "unavailable") {
      assert.match(result.reason, /could not be verified/i);
    }
  });

  test("rejects mismatched upstream word and translation coordinates", async (context) => {
    const cases = [
      {
        name: "word location",
        mutate(input: typeof syntheticVerses) {
          input.verses[0]!.words[0]!.location = "1:2:1";
        },
      },
      {
        name: "translation verse key",
        mutate(input: typeof syntheticVerses) {
          input.verses[0]!.translations[0]!.verse_key = "1:2";
        },
      },
    ];

    for (const fixture of cases) {
      await context.test(fixture.name, async () => {
        const invalidCoordinates = structuredClone(syntheticVerses);
        fixture.mutate(invalidCoordinates);
        const mockFetch = (async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith("/oauth2/token")) {
            return jsonResponse({ access_token: "server-token", expires_in: 3600 });
          }
          if (url.includes("/chapters/1")) return jsonResponse(syntheticChapter);
          if (url.includes("/resources/translations")) {
            return jsonResponse(syntheticTranslations);
          }
          if (url.includes("/resources/recitations")) {
            return jsonResponse(syntheticRecitations);
          }
          if (url.includes("/verses/by_chapter/1")) {
            return jsonResponse(invalidCoordinates);
          }
          return jsonResponse({}, 404);
        }) as typeof fetch;

        const result = await configuredProvider(mockFetch).getSurah(1);
        assert.equal(result.status, "unavailable");
        if (result.status === "unavailable") {
          assert.match(result.reason, /could not be verified/i);
        }
      });
    }
  });
});

describe("Quran API routes", () => {
  const provider: QuranContentProvider = {
    getStatus: () => ({
      status: "unconfigured",
      environment: "prelive",
      reason: "Synthetic provider is intentionally unconfigured.",
      attribution: {
        provider: "Quran Foundation",
        label: "Quran data provided by Quran.Foundation",
        url: "https://quran.foundation/",
      },
    }),
    getSurah: async () => ({
      status: "unconfigured",
      reason: "Synthetic provider is intentionally unconfigured.",
      attribution: {
        provider: "Quran Foundation",
        label: "Quran data provided by Quran.Foundation",
        url: "https://quran.foundation/",
      },
    }),
  };
  const server = createApp({ quranProvider: provider }).listen(0);

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await pool.end();
  });

  function endpoint(path: string): string {
    const address = server.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}${path}`;
  }

  test("returns typed status and content unions with no-store", async () => {
    const statusResponse = await fetch(endpoint("/api/quran/status"));
    assert.equal(statusResponse.status, 200);
    assert.equal(statusResponse.headers.get("cache-control"), "no-store");
    quranProviderStatusResponseSchema.parse(await statusResponse.json());

    const contentResponse = await fetch(endpoint("/api/quran/surahs/1"));
    assert.equal(contentResponse.status, 200);
    assert.equal(contentResponse.headers.get("cache-control"), "no-store");
    const body = quranSurahResponseSchema.parse(await contentResponse.json());
    assert.equal(body.data.status, "unconfigured");
  });

  test("rejects invalid or out-of-scope surah paths without calling the provider", async () => {
    const invalid = await fetch(endpoint("/api/quran/surahs/not-a-number"));
    assert.equal(invalid.status, 400);
    assert.equal(invalid.headers.get("cache-control"), "no-store");

    const unsupported = await fetch(endpoint("/api/quran/surahs/2"));
    assert.equal(unsupported.status, 404);
    assert.equal(unsupported.headers.get("cache-control"), "no-store");
  });
});
