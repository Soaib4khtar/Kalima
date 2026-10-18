import { Router, type ErrorRequestHandler } from "express";
import { z } from "zod";
import type { AuthVerifier } from "../auth/auth.js";
import type { QuranContentProvider } from "../quran/quran-content-provider.js";
import { AppError } from "../../utils/app-error.js";
import { LearningRepository } from "./learning.repository.js";
import { attemptSchema, coordinateSchema, timezoneSchema, type ReferenceInput } from "./learning.schemas.js";
import { createGameRouter } from '../game/game.routes.js';

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
  if (repository) router.use('/game', createGameRouter(repository.game, provider));
  router.get("/profile", async (_req, res) => res.json({ success: true, data: res.locals.profile }));
  router.patch("/profile", async (req, res) => {
    const body = z.object({ displayName: z.string().trim().min(1).max(80).nullable().optional(), timezone: timezoneSchema.optional() })
      .strict().refine((value) => value.displayName !== undefined || value.timezone !== undefined).parse(req.body);
    res.json({ success: true, data: await repository!.updateProfile(res.locals.learnerId, body.displayName, body.timezone) });
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
    res.json({ success: true, data: await repository!.startSession(res.locals.learnerId, refs, body.dueOnly, result) });
  });
  router.post("/attempts", async (req, res) => {
    const input = attemptSchema.parse(req.body);
    // No provider network call is added to a review. Quests are prepared when
    // source-backed sessions are issued (or when the world overview is opened).
    res.json({ success: true, data: await repository!.attempt(res.locals.learnerId, input) });
  });
  router.get("/history", async (req, res) => res.json({ success: true,
    data: await repository!.history(res.locals.learnerId, req.query.cursor === undefined ? undefined : uuid(req.query.cursor)) }));
  router.get("/progress", async (_req, res) => res.json({ success: true, data: await repository!.progress(res.locals.learnerId) }));
  router.get("/reviews/inbox", async (_req, res) => res.json({ success: true, data: await repository!.inbox(res.locals.learnerId) }));
  router.get("/review-sessions/current", async (_req, res) => res.json({ success: true, data: await repository!.currentSession(res.locals.learnerId, "daily") }));
  router.post("/review-sessions", async (req, res) => {
    const { includeNew } = z.object({ includeNew: z.boolean().default(false) }).strict().parse(req.body);
    const active = await repository!.currentSession(res.locals.learnerId, "daily");
    if (active) return res.json({ success: true, data: { session: active, unavailableWords: 0 } });
    const result = await provider.getSurah(1);
    if (result.status !== "ready") throw new AppError(503, "QURAN_SOURCE_UNAVAILABLE", "The Quran source is unavailable. Schedules and progress are safe");
    const environment = provider.getStatus().environment;
    const refs = result.surah.verses.flatMap((verse) => verse.words.filter((word) => word.translation?.trim()).map((word) => ({
      surah: 1 as const, ayah: verse.number, word: word.position, sourceWordId: String(word.sourceId), sourceVerseId: String(verse.sourceId), environment,
    })));
    res.json({ success: true, data: await repository!.startDaily(res.locals.learnerId, refs, includeNew, result) });
  });
  router.get("/review-sessions/preview", async (req, res) => {
    const query = z.object({ sessionId: z.uuid(), vocabularyId: z.uuid() }).strict().parse(req.query);
    res.json({ success: true, data: await repository!.reviewPreview(res.locals.learnerId, query.sessionId, query.vocabularyId) });
  });
  router.post("/review-sessions/skip", async (req, res) => {
    const body = z.object({ sessionId: z.uuid(), vocabularyId: z.uuid(), expectedRevision: z.number().int().nonnegative() }).strict().parse(req.body);
    res.json({ success: true, data: await repository!.skipDaily(res.locals.learnerId, body.sessionId, body.vocabularyId, body.expectedRevision) });
  });
  const errors: ErrorRequestHandler = (error, _req, res, next) => {
    if (error instanceof z.ZodError) return next(new AppError(400, "INVALID_LEARNING_INPUT", "Invalid learning request"));
    if (error instanceof AppError) {
      if (res.locals.learnerId) void repository?.game.audit(res.locals.learnerId, error.code).catch(() => {});
      return next(error);
    }
    next(new AppError(503, "LEARNING_UNAVAILABLE", "Learning storage is temporarily unavailable. Please retry"));
  };
  router.use(errors);
  return router;
}
