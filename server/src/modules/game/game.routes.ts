import { Router } from 'express';
import { z } from 'zod';
import type { GameRepository } from './game.repository.js';
import type { QuranContentProvider } from '../quran/quran-content-provider.js';
import { AppError } from '../../utils/app-error.js';

/** Mounted after the existing verified Supabase identity middleware. */
export function createGameRouter(repository: GameRepository, provider: QuranContentProvider) {
  const router = Router();
  const empty = z.object({}).strict();
  const uuid = (input: unknown) => z.uuid().parse(input);
  async function source() { try { const result = await provider.getSurah(1); return result.status === 'ready' ? result : null; } catch { return null; } }
  router.use(async (req, res, next) => {
    if (req.method !== 'GET') await repository.guard(res.locals.learnerId, req.path.startsWith('/challenges') ? 'challenge' : 'kingdom');
    next();
  });
  router.get('/overview', async (_req, res) => res.json({ success: true, data: await repository.overview(res.locals.learnerId, await source()) }));
  router.get('/garden', async (req, res) => {
    const q = z.object({ cursor: z.uuid().optional(), stage: z.coerce.number().int().min(1).max(5).optional() }).strict().parse(req.query);
    res.json({ success: true, data: await repository.garden(res.locals.learnerId, q.cursor, q.stage) });
  });
  router.get('/ledger', async (req, res) => {
    const q = z.object({ cursor: z.uuid().optional() }).strict().parse(req.query);
    res.json({ success: true, data: await repository.ledger(res.locals.learnerId, q.cursor) });
  });
  router.post('/kingdom/:key/unlock', async (req, res) => {
    empty.parse(req.body); res.json({ success: true, data: await repository.unlock(res.locals.learnerId, String(req.params.key)) });
  });
  router.post('/cosmetics/:key', async (req, res) => {
    empty.parse(req.body); res.json({ success: true, data: await repository.decorate(res.locals.learnerId, String(req.params.key)) });
  });
  router.post('/challenges', async (req, res) => {
    const body = z.object({ vocabularyId: z.uuid() }).strict().parse(req.body);
    const ready = await source();
    if (!ready) throw new AppError(503, 'CHALLENGE_SOURCE_UNAVAILABLE', 'Verified source meanings are unavailable. Please try again later');
    res.json({ success: true, data: await repository.issueChallenge(res.locals.learnerId, body.vocabularyId, ready) });
  });
  router.post('/challenges/:id/answer', async (req, res) => {
    const body = z.object({ choiceId: z.uuid() }).strict().parse(req.body);
    res.json({ success: true, data: await repository.answerChallenge(res.locals.learnerId, uuid(req.params.id), body.choiceId, await source()) });
  });
  router.use((error: unknown, _req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    const safe = error instanceof z.ZodError ? new AppError(400, 'INVALID_GAME_INPUT', 'Invalid game action') : error;
    if (safe instanceof AppError) void repository.audit(res.locals.learnerId, safe.code).catch(() => {});
    next(safe);
  });
  return router;
}
