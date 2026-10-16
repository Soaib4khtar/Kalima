import type { QuranSurah } from "@/lib/api";

export interface QuranRecallCard {
  id: string;
  textUthmani: string;
  meaning: string;
  transliteration?: string;
  reference: string;
}

export interface QuranRecallSession {
  cardIds: string[];
  currentIndex: number;
  revealed: boolean;
  complete: boolean;
}

export type QuranRecallAction =
  | { type: "reveal" }
  | { type: "next" }
  | { type: "restart"; cardIds?: string[] };

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

export function occurrenceId(
  surahNumber: number,
  verseNumber: number,
  wordPosition: number,
): string {
  return `${surahNumber}:${verseNumber}:${wordPosition}`;
}

export function createQuranRecallCards(surah: QuranSurah): QuranRecallCard[] {
  return surah.verses.flatMap((verse) =>
    verse.words.flatMap((word) => {
      if (!hasText(word.translation) || !hasText(word.textUthmani)) return [];

      return [{
        id: occurrenceId(surah.number, verse.number, word.position),
        textUthmani: word.textUthmani,
        meaning: word.translation,
        ...(hasText(word.transliteration) ? { transliteration: word.transliteration } : {}),
        reference: `${word.reference.verseKey} · Word ${word.reference.word}`,
      }];
    }),
  );
}

export function createQuranRecallSession(cardIds: string[]): QuranRecallSession {
  const uniqueCardIds = [...new Set(cardIds)];
  return {
    cardIds: uniqueCardIds,
    currentIndex: 0,
    revealed: false,
    complete: uniqueCardIds.length === 0,
  };
}

export function quranRecallReducer(
  state: QuranRecallSession,
  action: QuranRecallAction,
): QuranRecallSession {
  if (action.type === "restart") {
    return createQuranRecallSession(action.cardIds ?? state.cardIds);
  }

  if (state.complete) return state;
  if (action.type === "reveal") {
    return state.revealed ? state : { ...state, revealed: true };
  }

  if (!state.revealed) return state;
  if (state.currentIndex >= state.cardIds.length - 1) {
    return { ...state, revealed: false, complete: true };
  }

  return {
    ...state,
    currentIndex: state.currentIndex + 1,
    revealed: false,
  };
}

export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
