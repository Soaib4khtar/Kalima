import { Router } from "express";

import type { QuranContentProvider } from "./quran-content-provider.js";
import { quranProviderStatusResponseSchema, quranSurahResponseSchema } from "./quran.schemas.js";

export function createQuranRouter(provider: QuranContentProvider): Router {
  const router = Router();

  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/status", (_req, res) => {
    res.json(
      quranProviderStatusResponseSchema.parse({
        success: true,
        data: provider.getStatus(),
      }),
    );
  });

  router.get("/surahs/:surahNumber", async (req, res) => {
    const rawSurahNumber = req.params.surahNumber;
    if (!/^\d+$/.test(rawSurahNumber)) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_SURAH_NUMBER",
          message: "Surah number must be a positive integer",
        },
      });
      return;
    }

    const surahNumber = Number(rawSurahNumber);
    if (surahNumber !== 1) {
      res.status(404).json({
        success: false,
        error: {
          code: "SURAH_NOT_IMPLEMENTED",
          message: "Only Surah Al-Fatihah is available in this learning milestone",
        },
      });
      return;
    }

    const result = await provider.getSurah(surahNumber);
    res.json(
      quranSurahResponseSchema.parse({
        success: true,
        data: result,
      }),
    );
  });

  return router;
}
