export type LearningStatus = "new" | "learning" | "mastered";

export type PartOfSpeech = "noun" | "verb" | "adjective";

export type Level = "A1" | "A2" | "B1";

export interface VocabularyWord {
  id: string;
  english: string;
  arabic: string;
  transliteration: string;
  category: string;
  level: string; 
  partOfSpeech: PartOfSpeech;
  example: {
    english: string;
    arabic: string;
  };
  status: LearningStatus;
}

export const vocabulary: VocabularyWord[] = [
  {
    id: "word-1",
    english: "Book",
    arabic: "كِتَاب",
    transliteration: "Kitab",
    category: "Everyday",
    level: "A1",
    partOfSpeech: "noun",
    example: {
      english: "This is a book.",
      arabic: "هٰذَا كِتَاب",
    },
    status: "new",
  },
  {
    id: "word-2",
    english: "House",
    arabic: "بَيْت",
    transliteration: "Bayt",
    category: "Everyday",
    level: "A1",
    partOfSpeech: "noun",
    example: {
      english: "My house is big.",
      arabic: "بَيْتِي كَبِير",
    },
    status: "learning",
  },
  {
    id: "word-3",
    english: "Water",
    arabic: "مَاء",
    transliteration: "Māʾ",
    category: "Everyday",
    level: "A1",
    partOfSpeech: "noun",
    example: {
      english: "I drink water.",
      arabic: "أَشْرَبُ الْمَاء",
    },
    status: "mastered",
  },
  {
    id: "word-4",
    english: "Food",
    arabic: "طَعَام",
    transliteration: "Ṭaʿām",
    category: "Food",
    level: "A1",
    partOfSpeech: "noun",
    example: {
      english: "The food is good.",
      arabic: "الطَّعَامُ جَيِّد",
    },
    status: "new",
  },
  {
    id: "word-5",
    english: "School",
    arabic: "مَدْرَسَة",
    transliteration: "Madrasa",
    category: "Places",
    level: "A1",
    partOfSpeech: "noun",
    example: {
      english: "The school is near.",
      arabic: "الْمَدْرَسَةُ قَرِيبَة",
    },
    status: "learning",
  },
  {
    id: "word-6",
    english: "Friend",
    arabic: "صَدِيق",
    transliteration: "Ṣadīq",
    category: "People",
    level: "A1",
    partOfSpeech: "noun",
    example: {
      english: "He is my friend.",
      arabic: "هُوَ صَدِيقِي",
    },
    status: "new",
  },
  {
    id: "word-7",
    english: "Door",
    arabic: "بَاب",
    transliteration: "Bāb",
    category: "Everyday",
    level: "A1",
    partOfSpeech: "noun",
    example: {
      english: "Open the door.",
      arabic: "اِفْتَحِ الْبَاب",
    },
    status: "new",
  },
  {
    id: "word-8",
    english: "Beautiful",
    arabic: "جَمِيل",
    transliteration: "Jamīl",
    category: "Descriptions",
    level: "A1",
    partOfSpeech: "adjective",
    example: {
      english: "The house is beautiful.",
      arabic: "الْبَيْتُ جَمِيل",
    },
    status: "learning",
  },
];