import { z } from "zod";

import type { QuranContentProvider } from "./quran-content-provider.js";
import {
  quranProviderStatusSchema,
  quranSurahResultSchema,
  type QuranAttribution,
  type QuranProviderStatus,
  type QuranSurahResult,
} from "./quran.schemas.js";

const PROVIDER_ATTRIBUTION = {
  provider: "Quran Foundation",
  label: "Quran data provided by Quran.Foundation",
  url: "https://quran.foundation/",
} as const satisfies QuranAttribution;

const WORD_AUDIO_BASE_URL = "https://audio.qurancdn.com/";
const VERSE_AUDIO_BASE_URL = "https://verses.quran.com/";
const REQUEST_TIMEOUT_MS = 15_000;

const servicesByEnvironment = {
  prelive: {
    authBaseUrl: "https://prelive-oauth2.quran.foundation",
    gatewayUrl: "https://apis-prelive.quran.foundation",
  },
  production: {
    authBaseUrl: "https://oauth2.quran.foundation",
    gatewayUrl: "https://apis.quran.foundation",
  },
} as const;

const environmentSchema = z.enum(["prelive", "production"]);
type QuranFoundationEnvironment = z.infer<typeof environmentSchema>;

const configuredOptionsSchema = z.object({
  environment: environmentSchema,
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  translationId: z.number().int().positive(),
  recitationId: z.number().int().positive().optional(),
  services: z.object({
    authBaseUrl: z.string().url(),
    gatewayUrl: z.string().url(),
  }),
});

type ConfiguredOptions = z.infer<typeof configuredOptionsSchema>;

export interface QuranFoundationProviderOptions {
  environment?: QuranFoundationEnvironment;
  clientId?: string;
  clientSecret?: string;
  translationId?: number;
  recitationId?: number;
  services?: {
    authBaseUrl: string;
    gatewayUrl: string;
  };
  fetch?: typeof fetch;
  now?: () => number;
  requestTimeoutMs?: number;
  configurationError?: string;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

const qfChapterResponseSchema = z.object({
  chapter: z.object({
    id: z.number().int().min(1).max(114),
    name_arabic: z.string().min(1),
    name_complex: z.string().min(1),
    verses_count: z.number().int().positive(),
    translated_name: z.object({
      name: z.string().min(1),
    }),
  }),
});

const qfLocalizedTextSchema = z.object({
  text: z.string().optional().nullable(),
  language_name: z.string().optional().nullable(),
});

const qfWordSchema = z.object({
  id: z.number().int().positive(),
  position: z.number().int().positive(),
  text_uthmani: z.string().optional().nullable(),
  verse_key: z.string().optional(),
  location: z.string().optional(),
  char_type_name: z.string(),
  audio_url: z.string().optional().nullable(),
  translation: qfLocalizedTextSchema.optional().nullable(),
  transliteration: qfLocalizedTextSchema.optional().nullable(),
});

const qfTranslationSchema = z.object({
  id: z.number().int().positive(),
  resource_id: z.number().int().positive(),
  resource_name: z.string().optional().nullable(),
  language_name: z.string().optional().nullable(),
  verse_key: z.string(),
  text: z.string(),
});

const qfVerseSchema = z.object({
  id: z.number().int().positive(),
  chapter_id: z.number().int().optional(),
  verse_number: z.number().int().positive(),
  verse_key: z.string(),
  text_uthmani: z.string().min(1),
  words: z.array(qfWordSchema),
  translations: z.array(qfTranslationSchema).optional(),
  audio: z
    .object({
      verse_key: z.string().optional().nullable(),
      url: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

const qfVersesResponseSchema = z.object({
  verses: z.array(qfVerseSchema),
  pagination: z
    .object({
      next_page: z.number().int().positive().nullable(),
      total_records: z.number().int().nonnegative(),
    })
    .optional(),
});

const qfRecitationsResponseSchema = z.object({
  recitations: z.array(
    z.object({
      id: z.number().int().positive(),
      reciter_name: z.string().min(1),
      style: z.string().optional().nullable(),
    }),
  ),
});

const qfVerseRecitationResponseSchema = z.object({
  audio_files: z.array(z.object({
    verse_key: z.string(),
    url: z.string().optional().nullable(),
  })),
});

const qfTranslationsResponseSchema = z.object({
  translations: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string().min(1),
      author_name: z.string().min(1),
      language_name: z.string().min(1),
    }),
  ),
});

type ProviderErrorKind =
  | "authentication"
  | "invalid-response"
  | "not-found"
  | "rate-limited"
  | "unavailable";

class QuranFoundationRequestError extends Error {
  constructor(public readonly kind: ProviderErrorKind) {
    super(kind);
    this.name = "QuranFoundationRequestError";
  }
}

function plainTextFromHtml(value: string): string {
  const withoutExecutableContent = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withoutTags = withoutExecutableContent.replace(/<[^>]*>/g, " ");

  return withoutTags
    .replace(/&#(\d+);/g, (match, value: string) => {
      const codePoint = Number(value);
      try {
        return Number.isInteger(codePoint) ? String.fromCodePoint(codePoint) : match;
      } catch {
        return match;
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, value: string) => {
      const codePoint = Number.parseInt(value, 16);
      try {
        return Number.isInteger(codePoint) ? String.fromCodePoint(codePoint) : match;
      } catch {
        return match;
      }
    })
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (entity) => {
      const decoded: Record<string, string> = {
        "&nbsp;": " ",
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": "\"",
        "&apos;": "'",
        "&#39;": "'",
      };
      return decoded[entity.toLowerCase()] ?? entity;
    })
    .replace(/\s+/gu, " ")
    .trim();
}

function hasArabicScript(value: string): boolean {
  return /\p{Script=Arabic}/u.test(value);
}

function asHttpsUrl(value: string, baseUrl?: string): string | undefined {
  if (!value.trim()) return undefined;
  try {
    // Keep network-path references (//host/path) intact. Stripping their leading
    // slashes turns the source hostname into a path on the fallback CDN.
    const url = baseUrl === undefined ? new URL(value) : new URL(value, baseUrl);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function unavailableReason(error: unknown): string {
  if (error instanceof QuranFoundationRequestError) {
    switch (error.kind) {
      case "authentication":
        return "Quran Foundation authentication is currently unavailable.";
      case "invalid-response":
        return "Quran Foundation returned content that could not be verified.";
      case "not-found":
        return "The configured Quran Foundation resource is unavailable in this environment.";
      case "rate-limited":
        return "Quran Foundation is temporarily rate limited. Please try again later.";
      case "unavailable":
        break;
    }
  }

  return "Quran Foundation content is temporarily unavailable.";
}

function errorKindForStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return "authentication";
  if (status === 404 || status === 400 || status === 422) return "not-found";
  if (status === 429) return "rate-limited";
  return "unavailable";
}

function contentApiUrl(gatewayUrl: string, path: string): URL {
  const base = `${gatewayUrl.replace(/\/+$/, "")}/content/api/v4/`;
  return new URL(path.replace(/^\/+/, ""), base);
}

export class QuranFoundationProvider implements QuranContentProvider {
  private readonly fetchImplementation: typeof fetch;
  private readonly now: () => number;
  private readonly requestTimeoutMs: number;
  private readonly environment: QuranFoundationEnvironment;
  private readonly config?: ConfiguredOptions;
  private readonly configurationReason?: string;
  private cachedToken?: { value: string; refreshAt: number };
  private tokenRequest?: Promise<string>;

  constructor(options: QuranFoundationProviderOptions = {}) {
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;

    const environment = options.environment ?? "prelive";
    this.environment = environment;
    const services = options.services ?? servicesByEnvironment[environment];
    const parsed = configuredOptionsSchema.safeParse({
      environment,
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      translationId: options.translationId,
      recitationId: options.recitationId,
      services,
    });

    if (options.configurationError) {
      this.configurationReason = options.configurationError;
    } else if (parsed.success) {
      this.config = parsed.data;
    } else {
      this.configurationReason =
        "Set QF_CLIENT_ID, QF_CLIENT_SECRET, and QF_TRANSLATION_ID on the server to enable Quran content.";
    }
  }

  getStatus(): QuranProviderStatus {
    return quranProviderStatusSchema.parse(
      this.config
        ? {
            status: "configured",
            environment: this.environment,
            attribution: PROVIDER_ATTRIBUTION,
          }
        : {
            status: "unconfigured",
            environment: this.environment,
            reason: this.configurationReason,
            attribution: PROVIDER_ATTRIBUTION,
          },
    );
  }

  async getSurah(surahNumber: number): Promise<QuranSurahResult> {
    if (!this.config) {
      return quranSurahResultSchema.parse({
        status: "unconfigured",
        reason:
          this.configurationReason ??
          "Quran Foundation is not configured on this server.",
        attribution: PROVIDER_ATTRIBUTION,
      });
    }

    try {
      return await this.loadSurah(surahNumber, this.config);
    } catch (error) {
      return quranSurahResultSchema.parse({
        status: "unavailable",
        reason: unavailableReason(error),
        attribution: PROVIDER_ATTRIBUTION,
      });
    }
  }

  private async loadSurah(
    surahNumber: number,
    config: ConfiguredOptions,
  ): Promise<QuranSurahResult> {
    const chapterInput = await this.fetchContent(
      `chapters/${surahNumber}?language=en`,
      config,
    );
    const chapterParse = qfChapterResponseSchema.safeParse(chapterInput);
    if (!chapterParse.success || chapterParse.data.chapter.id !== surahNumber) {
      throw new QuranFoundationRequestError("invalid-response");
    }

    const translationResource = await this.findTranslation(config);
    const recitation = await this.findRecitation(config);
    const params = new URLSearchParams({
      language: "en",
      words: "true",
      translations: String(config.translationId),
      fields: "text_uthmani",
      word_fields: "text_uthmani,verse_key,location",
      translation_fields: "id,resource_name,language_name,verse_key",
      page: "1",
      per_page: "50",
    });
    if (recitation) params.set("audio", String(recitation.id));

    const versesInput = await this.fetchContent(
      `verses/by_chapter/${surahNumber}?${params.toString()}`,
      config,
    );
    const versesParse = qfVersesResponseSchema.safeParse(versesInput);
    if (!versesParse.success) {
      throw new QuranFoundationRequestError("invalid-response");
    }

    const chapter = chapterParse.data.chapter;
    const upstreamVerses = [...versesParse.data.verses].sort(
      (left, right) => left.verse_number - right.verse_number,
    );
    if (
      upstreamVerses.length !== chapter.verses_count ||
      versesParse.data.pagination?.next_page != null ||
      upstreamVerses.some(
        (verse, index) =>
          (verse.chapter_id !== undefined && verse.chapter_id !== surahNumber) ||
          verse.verse_number !== index + 1 ||
          verse.verse_key !== `${surahNumber}:${verse.verse_number}` ||
          !hasArabicScript(verse.text_uthmani),
      )
    ) {
      throw new QuranFoundationRequestError("invalid-response");
    }

    // The dedicated prelive recitation resource can publish working recordings
    // while the verses endpoint still embeds stale URLs. Prefer the returned,
    // verse-keyed recording from the same selected recitation resource.
    const recitationAudio = recitation
      ? await this.loadRecitationAudio(config, recitation.id, surahNumber, new Set(upstreamVerses.map((verse) => verse.verse_key)))
      : new Map<string, string>();
    let wordTranslationLanguage: string | undefined;
    const verses = upstreamVerses.map((verse) => {
      const upstreamTranslation = verse.translations?.find(
        (translation) => translation.resource_id === config.translationId,
      );
      const translatedText = upstreamTranslation
        ? plainTextFromHtml(upstreamTranslation.text)
        : "";
      const responseResourceName = upstreamTranslation?.resource_name?.trim();
      if (
        (responseResourceName !== undefined &&
          responseResourceName !== "" &&
          responseResourceName !== translationResource.name) ||
        (upstreamTranslation !== undefined &&
          upstreamTranslation.verse_key !== verse.verse_key)
      ) {
        throw new QuranFoundationRequestError("invalid-response");
      }

      const lexicalWords = verse.words.filter(
        (word) => word.char_type_name === "word",
      );
      if (lexicalWords.length === 0) {
        throw new QuranFoundationRequestError("invalid-response");
      }

      const positions = new Set<number>();

      const words = lexicalWords.map((word) => {
        const textUthmani = word.text_uthmani;
        const translation = plainTextFromHtml(word.translation?.text ?? "");
        const expectedLocation = `${surahNumber}:${verse.verse_number}:${word.position}`;
        if (
          !textUthmani ||
          !hasArabicScript(textUthmani) ||
          word.verse_key !== verse.verse_key ||
          word.location !== expectedLocation ||
          positions.has(word.position)
        ) {
          throw new QuranFoundationRequestError("invalid-response");
        }
        positions.add(word.position);
        const translationLanguage = word.translation?.language_name?.trim();
        if (translation && translationLanguage) {
          wordTranslationLanguage ??= translationLanguage;
        }
        const transliteration = plainTextFromHtml(word.transliteration?.text ?? "");
        const audioUrl = word.audio_url
          ? asHttpsUrl(word.audio_url, WORD_AUDIO_BASE_URL)
          : undefined;

        return {
          sourceId: word.id,
          position: word.position,
          textUthmani,
          ...(translation ? { translation } : {}),
          ...(transliteration ? { transliteration } : {}),
          ...(audioUrl ? { audioUrl } : {}),
          reference: {
            surah: surahNumber,
            ayah: verse.verse_number,
            word: word.position,
            verseKey: verse.verse_key,
          },
        };
      });

      if (words.some((word, index) => word.position !== index + 1)) {
        throw new QuranFoundationRequestError("invalid-response");
      }

      const recitationId = recitation?.id;
      // Prelive embeds { url, segments } in the validated parent verse without
      // repeating verse_key. Accept that association, but never an explicit
      // conflicting key. The recitation itself was checked against its catalog.
      const embeddedAudioUrl =
        recitationId !== undefined && verse.audio?.url &&
        (verse.audio.verse_key == null || verse.audio.verse_key === verse.verse_key)
          ? asHttpsUrl(verse.audio.url, VERSE_AUDIO_BASE_URL)
          : undefined;
      const verseAudioUrl = recitationAudio.get(verse.verse_key) ?? embeddedAudioUrl;

      return {
        sourceId: verse.id,
        number: verse.verse_number,
        verseKey: verse.verse_key,
        textUthmani: verse.text_uthmani,
        ...(translatedText
          ? {
              translation: {
                sourceId: upstreamTranslation!.id,
                text: translatedText,
                resourceId: config.translationId,
                resourceName: translationResource.name,
              },
            }
          : {}),
        ...(verseAudioUrl
          ? { audio: { url: verseAudioUrl, recitationId } }
          : {}),
        words,
      };
    });

    return quranSurahResultSchema.parse({
      status: "ready",
      surah: {
        number: chapter.id,
        nameArabic: chapter.name_arabic,
        nameTransliterated: chapter.name_complex,
        translatedName: chapter.translated_name.name,
        verses,
      },
      attribution: {
        ...PROVIDER_ATTRIBUTION,
        translationName: translationResource.name,
        translationAuthor: translationResource.author,
        translationLanguage: translationResource.language,
        ...(wordTranslationLanguage ? { wordTranslationLanguage } : {}),
        ...(recitation
          ? {
              recitationName: recitation.name,
              ...(recitation.style ? { recitationStyle: recitation.style } : {}),
            }
          : {}),
      },
    });
  }

  private async findTranslation(
    config: ConfiguredOptions,
  ): Promise<{ id: number; name: string; author: string; language: string }> {
    const input = await this.fetchContent("resources/translations?language=en", config);
    const parsed = qfTranslationsResponseSchema.safeParse(input);
    if (!parsed.success) {
      throw new QuranFoundationRequestError("invalid-response");
    }
    const resource = parsed.data.translations.find(
      (translation) => translation.id === config.translationId,
    );
    if (!resource) {
      throw new QuranFoundationRequestError("not-found");
    }
    return {
      id: resource.id,
      name: resource.name,
      author: resource.author_name,
      language: resource.language_name,
    };
  }

  private async findRecitation(
    config: ConfiguredOptions,
  ): Promise<{ id: number; name: string; style?: string } | undefined> {
    if (config.recitationId === undefined) return undefined;

    try {
      const input = await this.fetchContent("resources/recitations?language=en", config);
      const parsed = qfRecitationsResponseSchema.safeParse(input);
      if (!parsed.success) return undefined;
      const resource = parsed.data.recitations.find(
        (recitation) => recitation.id === config.recitationId,
      );
      if (!resource) return undefined;
      const style = resource.style?.trim();
      return {
        id: resource.id,
        name: resource.reciter_name,
        ...(style ? { style } : {}),
      };
    } catch {
      // Audio is optional. A failed catalog lookup must not substitute an
      // unverified resource or block otherwise verified text content.
      return undefined;
    }
  }

  private async loadRecitationAudio(
    config: ConfiguredOptions,
    recitationId: number,
    surahNumber: number,
    expectedVerseKeys: Set<string>,
  ): Promise<Map<string, string>> {
    try {
      const input = await this.fetchContent(
        `recitations/${recitationId}/by_chapter/${surahNumber}?page=1&per_page=50`,
        config,
      );
      const parsed = qfVerseRecitationResponseSchema.safeParse(input);
      if (!parsed.success) return new Map();
      const audio = new Map<string, string>();
      const duplicates = new Set<string>();
      for (const row of parsed.data.audio_files) {
        if (!expectedVerseKeys.has(row.verse_key) || !row.url) continue;
        const url = asHttpsUrl(row.url, VERSE_AUDIO_BASE_URL);
        if (!url) continue;
        if (audio.has(row.verse_key)) duplicates.add(row.verse_key);
        else audio.set(row.verse_key, url);
      }
      // Ambiguous coordinates must not associate a recording with an ayah.
      for (const key of duplicates) audio.delete(key);
      return audio;
    } catch {
      // Optional audio failures never hide otherwise valid Quranic text.
      return new Map();
    }
  }

  private async fetchContent(
    path: string,
    config: ConfiguredOptions,
  ): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await this.getAccessToken(config);
      let response: Response;
      try {
        response = await this.fetchImplementation(
          contentApiUrl(config.services.gatewayUrl, path),
          {
            headers: {
              Accept: "application/json",
              "x-auth-token": token,
              "x-client-id": config.clientId,
            },
            signal: AbortSignal.timeout(this.requestTimeoutMs),
          },
        );
      } catch {
        throw new QuranFoundationRequestError("unavailable");
      }

      if (response.status === 401 && attempt === 0) {
        this.cachedToken = undefined;
        continue;
      }
      if (!response.ok) {
        throw new QuranFoundationRequestError(errorKindForStatus(response.status));
      }

      try {
        return await response.json();
      } catch {
        throw new QuranFoundationRequestError("invalid-response");
      }
    }

    throw new QuranFoundationRequestError("authentication");
  }

  private async getAccessToken(config: ConfiguredOptions): Promise<string> {
    if (this.cachedToken && this.cachedToken.refreshAt > this.now()) {
      return this.cachedToken.value;
    }
    if (this.tokenRequest) return this.tokenRequest;

    const pending = this.requestAccessToken(config);
    this.tokenRequest = pending;
    try {
      return await pending;
    } finally {
      if (this.tokenRequest === pending) this.tokenRequest = undefined;
    }
  }

  private async requestAccessToken(config: ConfiguredOptions): Promise<string> {
    const tokenUrl = new URL(
      "/oauth2/token",
      `${config.services.authBaseUrl.replace(/\/+$/, "")}/`,
    );
    const basicAuth = Buffer.from(
      `${config.clientId}:${config.clientSecret}`,
      "utf8",
    ).toString("base64");

    let response: Response;
    try {
      response = await this.fetchImplementation(tokenUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: "content",
        }),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch {
      throw new QuranFoundationRequestError("unavailable");
    }

    if (!response.ok) {
      throw new QuranFoundationRequestError(errorKindForStatus(response.status));
    }

    let input: unknown;
    try {
      input = await response.json();
    } catch {
      throw new QuranFoundationRequestError("invalid-response");
    }
    const parsed = tokenResponseSchema.safeParse(input);
    if (!parsed.success) {
      throw new QuranFoundationRequestError("invalid-response");
    }

    const lifetimeMs = parsed.data.expires_in * 1_000;
    const earlyRefreshMs = Math.min(60_000, Math.floor(lifetimeMs / 10));
    this.cachedToken = {
      value: parsed.data.access_token,
      refreshAt: this.now() + lifetimeMs - earlyRefreshMs,
    };
    return parsed.data.access_token;
  }
}

function positiveIntegerFromEnv(
  name: string,
  value: string | undefined,
  required: boolean,
): { value?: number; error?: string } {
  if (value === undefined || value.trim() === "") {
    return required ? { error: `${name} is required.` } : {};
  }
  if (!/^\d+$/.test(value.trim())) {
    return { error: `${name} must be a positive integer.` };
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? { value: parsed }
    : { error: `${name} must be a positive integer.` };
}

export function createQuranFoundationProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: Pick<QuranFoundationProviderOptions, "fetch" | "now"> = {},
): QuranFoundationProvider {
  const environmentParse = environmentSchema.safeParse(env.QF_ENV ?? "prelive");
  const translation = positiveIntegerFromEnv(
    "QF_TRANSLATION_ID",
    env.QF_TRANSLATION_ID,
    true,
  );
  const recitation = positiveIntegerFromEnv(
    "QF_RECITATION_ID",
    env.QF_RECITATION_ID,
    false,
  );
  const configurationError =
    (!environmentParse.success
      ? "QF_ENV must be either prelive or production."
      : undefined) ??
    translation.error ??
    recitation.error;
  const environment = environmentParse.success ? environmentParse.data : "prelive";

  return new QuranFoundationProvider({
    environment,
    clientId: env.QF_CLIENT_ID,
    clientSecret: env.QF_CLIENT_SECRET,
    translationId: translation.value,
    recitationId: recitation.value,
    services: servicesByEnvironment[environment],
    configurationError,
    ...dependencies,
  });
}
