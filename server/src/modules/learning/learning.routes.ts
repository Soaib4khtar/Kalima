import { Router, type ErrorRequestHandler } from "express";
import { z } from "zod";
import type { AuthVerifier } from "../auth/auth.js";
import type { QuranContentProvider } from "../quran/quran-content-provider.js";
import { AppError } from "../../utils/app-error.js";
import { LearningRepository } from "./learning.repository.js";
import { attemptSchema, coordinateSchema, type ReferenceInput } from "./learning.schemas.js";

export function createLearningRouter(auth: AuthVerifier, repository: LearningRepository | undefined, provider: QuranContentProvider) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  router.get("/status", (_req, res) => res.json({ success: true, data: {
    authConfigured: auth.configured, storageConfigured: Boolean(repository),
  } }));
  router.use(async (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization || !/^Bearer \S+$/i.test(authorization) || authorization.length > 16_384) {
      throw new AppError(401, "SIGN_IN_REQUIRED", "Sign in to save your learning");
    }
    const identity = await auth.verify(authorization.slice(7));
    if (!repository) throw new AppError(503, "LEARNING_UNCONFIGURED", "Persistent learning storage is not configured");
    const profile = await repository.profile(identity);
    res.locals.learnerId = profile.id;
    res.locals.profile = profile;
    next();
  });
  // Only source-approved coordinates/IDs are registered. No canonical strings
  // are written to learner storage. No trust is placed in client source IDs.
  async function references(): Promise<ReferenceInput[]> {
    const result = await provider.getSurah(1);
    if (result.status !== "ready") throw new AppError(503, "QURAN_SOURCE_UNAVAILABLE", "Quran source is unavailable. Your existing progress is safe");
    const environment = provider.getStatus().environment;
    return result.surah.verses.flatMap((verse) => verse.words.map((word) => ({
      surah: 1 as const, ayah: verse.number, word: word.position, sourceWordId: String(word.sourceId),
      sourceVerseId: String(verse.sourceId), environment,
    })));
  }
  const uuid = (value: unknown) => z.uuid().parse(value);
  router.get("/profile", async (_req, res) => res.json({ success: true, data: res.locals.profile }));
  router.patch("/profile", async (req, res) => {
    const body = z.object({ displayName: z.string().trim().min(1).max(80).nullable() }).strict().parse(req.body);
    res.json({ success: true, data: await repository!.updateProfile(res.locals.learnerId, body.displayName) });
  });
  router.get("/bookmarks", async (req, res) => {
    const cursor = req.query.cursor === undefined ? undefined : uuid(req.query.cursor);
    res.json({ success: true, data: await repository!.bookmarks(res.locals.learnerId, cursor) });
  });
  router.post("/bookmarks", async (req, res) => {
    const coordinate = coordinateSchema.parse(req.body);
    const ref = (await references()).find((row) => row.ayah === coordinate.ayah && row.word === coordinate.word);
    if (!ref) throw new AppError(422, "UNKNOWN_OCCURRENCE", "This word occurrence was not returned by the Quran source");
    res.json({ success: true, data: await repository!.bookmark(res.locals.learnerId, ref) });
  });
  router.delete("/bookmarks/:vocabularyId", async (req, res) => res.json({ success: true,
    data: await repository!.removeBookmark(res.locals.learnerId, uuid(req.params.vocabularyId)) }));
  router.get("/sessions/current", async (_req, res) => res.json({ success: true, data: await repository!.currentSession(res.locals.learnerId) }));
  router.post("/sessions", async (req, res) => {
    const body = z.object({ dueOnly: z.boolean().default(false) }).strict().parse(req.body);
    const result = await provider.getSurah(1);
    if (result.status !== "ready") throw new AppError(503, "QURAN_SOURCE_UNAVAILABLE", "Verified word meanings are unavailable. Please try again later");
    const learnable = new Set(result.surah.verses.flatMap((verse) => verse.words.filter((word) => word.translation?.trim()).map((word) => `${verse.number}:${word.position}`)));
    const environment = provider.getStatus().environment;
    const refs = result.surah.verses.flatMap((verse) => verse.words.filter((word) => learnable.has(`${verse.number}:${word.position}`)).map((word) => ({
      surah: 1 as const, ayah: verse.number, word: word.position, sourceWordId: String(word.sourceId), sourceVerseId: String(verse.sourceId), environment,
    })));
    res.json({ success: true, data: await repository!.startSession(res.locals.learnerId, refs, body.dueOnly) });
  });
  router.post("/attempts", async (req, res) => res.json({ success: true,
    data: await repository!.attempt(res.locals.learnerId, attemptSchema.parse(req.body)) }));
  router.get("/history", async (req, res) => res.json({ success: true,
    data: await repository!.history(res.locals.learnerId, req.query.cursor === undefined ? undefined : uuid(req.query.cursor)) }));
  router.get("/progress", async (_req, res) => res.json({ success: true, data: await repository!.progress(res.locals.learnerId) }));
  const errors: ErrorRequestHandler = (error, _req, _res, next) => {
    if (error instanceof z.ZodError) return next(new AppError(400, "INVALID_LEARNING_INPUT", "Invalid learning request"));
    if (error instanceof AppError) return next(error);
    next(new AppError(503, "LEARNING_UNAVAILABLE", "Learning storage is temporarily unavailable. Please retry"));
  };
  router.use(errors);
  return router;
}
