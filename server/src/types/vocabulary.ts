export interface VocabularyWord {
  id: string;
  english: string;
  arabic: string;
  transliteration: string;
  category: string;
  level: string;
}

export interface CreateVocabularyInput {
  english: string;
  arabic: string;
  transliteration: string;
  category: string;
  level: string;
}

export interface UpdateVocabularyInput {
  english?: string;
  arabic?: string;
  transliteration?: string;
  category?: string;
  level?: string;
}