// ─────────────────────────────────────────────────────────────────
// src/lib/api.ts
// This is the frontend's "API client" — a single place that knows
// how to talk to our Express backend.
//
// Why a dedicated file? Because if the backend URL ever changes,
// or you want to add auth headers, you only change it in ONE place.
// ─────────────────────────────────────────────────────────────────

// The base URL of our backend.
// import.meta.env = Vite's way of reading environment variables.
// VITE_API_URL comes from a .env file in the root of the project.
// If it's not set, we fall back to localhost:5000 (our dev server).
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

// ─────────────────────────────────────────────────────────────────
// TYPES
// These mirror the shape of the data our backend sends back.
// They're slightly different from the frontend VocabularyWord type
// because the backend uses snake_case (created_at) while the DB
// returns that way too. We'll map these carefully.
// ─────────────────────────────────────────────────────────────────

// This is what one word looks like when it comes FROM the server.
// Notice snake_case: that's what PostgreSQL/Express returns.
export interface ApiVocabularyWord {
  id: string;
  english: string;
  arabic: string;
  transliteration: string;
  category: string;
  level: string;
  created_at: string;
  updated_at: string;
}

// This is the shape of EVERY successful API response from our backend.
// Our Express server always wraps data in { success: true, data: ... }
interface ApiResponse<T> {
  success: true;
  data: T;
}

// Query params we can pass to GET /api/vocabulary
export interface VocabularyQueryParams {
  search?: string;
  category?: string;
}

export interface QuranWordOccurrence {
  sourceId: number;
  position: number;
  textUthmani: string;
  translation?: string;
  transliteration?: string;
  audioUrl?: string;
  reference: {
    surah: number;
    ayah: number;
    word: number;
    verseKey: string;
  };
}

export interface QuranVerseTranslation {
  sourceId: number;
  text: string;
  resourceId: number;
  resourceName: string;
}

export interface QuranVerseAudio {
  url: string;
  recitationId?: number;
}

export interface QuranVerse {
  sourceId: number;
  number: number;
  verseKey: string;
  textUthmani: string;
  translation?: QuranVerseTranslation;
  audio?: QuranVerseAudio;
  words: QuranWordOccurrence[];
}

export interface QuranSurah {
  number: number;
  nameArabic: string;
  nameTransliterated: string;
  translatedName: string;
  verses: QuranVerse[];
}

export interface QuranAttribution {
  provider: "Quran Foundation";
  label: "Quran data provided by Quran.Foundation";
  url: string;
  translationName?: string;
  translationAuthor?: string;
  translationLanguage?: string;
  wordTranslationLanguage?: string;
  recitationName?: string;
  recitationStyle?: string;
}

export interface QuranSurahReady {
  status: "ready";
  surah: QuranSurah;
  attribution: QuranAttribution;
}

export interface QuranSurahNotReady {
  status: "unconfigured" | "unavailable";
  reason: string;
  attribution: QuranAttribution;
}

export type QuranSurahResult = QuranSurahReady | QuranSurahNotReady;

// ─────────────────────────────────────────────────────────────────
// HELPER: apiFetch
// A thin wrapper around the native fetch() that:
//   1. Prepends the base URL automatically
//   2. Throws a proper Error if the HTTP status is not 2xx
//      (native fetch() does NOT throw on 4xx/5xx — it only throws
//       on network failure. This is a common gotcha.)
// ─────────────────────────────────────────────────────────────────
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set("Accept", "application/json");
  if (options?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // If the server returned a non-2xx status (400, 404, 500, etc.)
  // we manually throw — because fetch() won't do this for us
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message ?? `API error: ${response.status}`,
    );
  }

  // Parse and return the JSON body
  return response.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────
// API FUNCTIONS
// Each function corresponds to one endpoint in our Express backend.
// These are what TanStack Query will call.
// ─────────────────────────────────────────────────────────────────

/**
 * GET /api/vocabulary
 * Fetches all vocabulary words, with optional search and category filters.
 */
export async function fetchVocabulary(
  params: VocabularyQueryParams = {},
): Promise<ApiVocabularyWord[]> {
  // URLSearchParams is the browser-native way to build query strings.
  // It handles encoding special characters for you.
  // e.g. { search: "book", category: "Everyday" }
  //   → "?search=book&category=Everyday"
  const query = new URLSearchParams();

  if (params.search) query.set("search", params.search);
  if (params.category && params.category !== "all")
    query.set("category", params.category);

  // query.toString() produces the "search=book&category=Everyday" string
  const queryString = query.toString();
  const path = queryString
    ? `/api/vocabulary?${queryString}`
    : "/api/vocabulary";

  const response = await apiFetch<ApiResponse<ApiVocabularyWord[]>>(path);

  // Unwrap from { success: true, data: [...] } → just the array
  return response.data;
}

/**
 * GET /api/vocabulary/:id
 * Fetches a single word by its UUID.
 */
export async function fetchVocabularyWord(
  id: string,
): Promise<ApiVocabularyWord> {
  const response = await apiFetch<ApiResponse<ApiVocabularyWord>>(
    `/api/vocabulary/${id}`,
  );
  return response.data;
}

/**
 * POST /api/vocabulary
 * Creates a new vocabulary word.
 */
export async function createVocabularyWord(input: {
  english: string;
  arabic: string;
  transliteration: string;
  category: string;
  level: "A1" | "A2" | "B1";
}): Promise<ApiVocabularyWord> {
  const response = await apiFetch<ApiResponse<ApiVocabularyWord>>(
    "/api/vocabulary",
    {
      method: "POST",
      // JSON.stringify() converts the JS object to a JSON string
      // that the server can read
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

/**
 * GET /api/quran/surahs/1
 * Fetches source-provided Al-Fatihah content. A successful request may still
 * report an unavailable provider; callers must inspect the result status.
 */
export async function fetchAlFatihah(signal?: AbortSignal): Promise<QuranSurahResult> {
  const response = await apiFetch<ApiResponse<QuranSurahResult>>(
    "/api/quran/surahs/1",
    { signal, cache: "no-store" },
  );
  return response.data;
}
