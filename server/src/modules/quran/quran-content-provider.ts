import type {
  QuranProviderStatus,
  QuranSurahResult,
} from "./quran.schemas.js";

/**
 * Application-facing boundary for Quranic content. Implementations must return
 * an honest availability state instead of substituting or inventing content.
 */
export interface QuranContentProvider {
  getStatus(): QuranProviderStatus;
  getSurah(surahNumber: number): Promise<QuranSurahResult>;
}
