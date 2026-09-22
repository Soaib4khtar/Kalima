export interface VocabularyWord {
  id: string;
  english: string;
  arabic: string;
  transliteration: string;
  category: string;
  level: string; 
}

export const vocabulary: VocabularyWord[] = [
  {
    id: "word-1",
    english: "Book",
    arabic: "كِتَاب",
    transliteration: "Kitab",
    category: "Everyday",
    level: "A1",
  },
  {
    id: "word-2",
    english: "House",
    arabic: "بَيْت",
    transliteration: "Bayt",
    category: "Everyday",
    level: "A1",
  },
  {
    id: "word-3",
    english: "Water",
    arabic: "مَاء",
    transliteration: "Māʾ",
    category: "Everyday",
    level: "A1",
  },
];