import { Router } from "express";

const router = Router();

const vocabulary = [
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

router.get("/", (_req, res) => {
    res.json({
        success: true,
        data: vocabulary,
    });
});

export default router;