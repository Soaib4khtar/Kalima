import { Router } from "express";

const router = Router();

interface VocabularyWord {
  id: string;
  english: string;
  arabic: string;
  transliteration: string;
  category: string;
  level: string;
}

const vocabulary: VocabularyWord[] = [
  {
    id: "word-1",
    english: "Book",
    arabic: "كِتَاب",
    transliteration: "Kitāb",
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
    category: "Food",
    level: "A1",
  },
];

router.get("/", (req, res) => {
  const { search, category } = req.query;

  let results = [...vocabulary];

  if (typeof search === "string" && search.trim() !== "") {
    const searchTerm = search.toLocaleLowerCase().trim();

    results = results.filter((word) => {
      return (
        word.english.toLocaleLowerCase().includes(searchTerm) ||
        word.arabic.includes(searchTerm)
      );
    });
  }

  if (typeof category === "string" && category !== "all") {
    results = results.filter(
      (word) => word.category === category
    );
  }

  res.json({
    success: true,
    data: results,
  });
});

router.get("/:id", (req, res) => {
  const word = vocabulary.find(
    (item) => item.id === req.params.id
  );

  if (!word) {
    res.status(404).json({
      success: false,
      message: "Vocabulary word not found",
    });

    return;
  }

  res.json({
    success: true,
    data: word,
  });
});

router.post("/", (req, res) => {
  const {
    english,
    arabic,
    transliteration,
    category,
    level,
  } = req.body;

  if (
    !english ||
    !arabic ||
    !transliteration ||
    !category ||
    !level
  ) {
    res.status(400).json({
      success: false,
      message: "All vocabulary fields are required",
    });

    return;
  }

  const newWord: VocabularyWord = {
    id: `word-${Date.now()}`,
    english,
    arabic,
    transliteration,
    category,
    level,
  };

  vocabulary.push(newWord);

  res.status(201).json({
    success: true,
    data: newWord,
  });
});

router.patch("/:id", (req, res) => {
  const word = vocabulary.find(
    (item) => item.id === req.params.id
  );

  if (!word) {
    res.status(404).json({
      success: false,
      message: "Vocabulary word not found",
    });

    return;
  }

  const {
    english,
    arabic,
    transliteration,
    category,
    level,
  } = req.body;

  if (english !== undefined) {
    word.english = english;
  }

  if (arabic !== undefined) {
    word.arabic = arabic;
  }

  if (transliteration !== undefined) {
    word.transliteration = transliteration;
  }

  if (category !== undefined) {
    word.category = category;
  }

  if (level !== undefined) {
    word.level = level;
  }

  res.json({
    success: true,
    data: word,
  });
});

router.delete("/:id", (req, res) => {
  const index = vocabulary.findIndex(
    (item) => item.id === req.params.id
  );

  if (index === -1) {
    res.status(404).json({
      success: false,
      message: "Vocabulary word not found",
    });

    return;
  }

  const deletedWord = vocabulary.splice(index, 1)[0];

  res.json({
    success: true,
    data: deletedWord,
  });
});

export default router;