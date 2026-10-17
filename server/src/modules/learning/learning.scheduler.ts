import { createEmptyCard, fsrs, generatorParameters, Rating as FsrsRating, State, type Card, type CardInput, type ReviewLog } from "ts-fsrs";
import { z } from "zod";
import type { Rating } from "./learning.schemas.js";

export const SCHEDULER_VERSION = "fsrs6-ts5.4.2-kalima1";
export const SCHEDULER_PARAMETERS = generatorParameters({ request_retention: 0.9, maximum_interval: 3650,
  enable_fuzz: false, enable_short_term: true, learning_steps: ["1m", "10m"], relearning_steps: ["10m"] });
const scheduler = fsrs(SCHEDULER_PARAMETERS);
const grades = { again: FsrsRating.Again, hard: FsrsRating.Hard, good: FsrsRating.Good, easy: FsrsRating.Easy } as const;
const cardSchema = z.object({ due: z.iso.datetime(), stability: z.number().finite().nonnegative(), difficulty: z.number().finite().min(0).max(10),
  elapsed_days: z.number().finite().nonnegative(), scheduled_days: z.number().finite().nonnegative(), learning_steps: z.number().int().nonnegative(),
  reps: z.number().int().nonnegative(), lapses: z.number().int().nonnegative(), state: z.number().int().min(0).max(3), last_review: z.iso.datetime().optional() }).strict();
export const memoryState = (state: number) => (["new", "learning", "review", "relearning"] as const)[state]!;
export function serializeCard(card: Card) { return { ...card, due: card.due.toISOString(), ...(card.last_review ? { last_review: card.last_review.toISOString() } : {}) }; }
export function restoreCard(value: unknown): Card {
  const parsed = cardSchema.parse(value);
  return { ...parsed, due: new Date(parsed.due), last_review: parsed.last_review ? new Date(parsed.last_review) : undefined };
}
export interface HistoricalReview { rating: Rating; reviewedAt: Date }
/** Reconstruct memory from real events, without changing an existing due date. */
export function bootstrapCard(history: HistoricalReview[], due: Date, now: Date): Card {
  let card = createEmptyCard(history[0]?.reviewedAt ?? now);
  for (const event of history) card = scheduler.next(card, event.reviewedAt, grades[event.rating]).card;
  return { ...card, due };
}
export function scheduleCard(card: CardInput, rating: Rating, now: Date) {
  const previous = card.last_review ? new Date(card.last_review) : undefined;
  if (previous && now < previous) throw new Error("Server review time precedes the last review");
  return scheduler.next(card, now, grades[rating]);
}
export function previewCard(card: Card, now: Date) {
  return Object.fromEntries((Object.keys(grades) as Rating[]).map((rating) => {
    const next = scheduleCard(card, rating, now).card;
    return [rating, { dueAt: next.due.toISOString(), state: memoryState(next.state) }];
  })) as Record<Rating, { dueAt: string; state: string }>;
}
export function serializeLog(log: ReviewLog) { return { ...log, due: log.due.toISOString(), review: log.review.toISOString() }; }
export const isLearning = (state: State) => state === State.Learning || state === State.Relearning;
