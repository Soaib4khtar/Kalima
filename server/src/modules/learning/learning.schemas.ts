import { z } from "zod";

export const coordinateSchema = z.object({
  surah: z.literal(1), ayah: z.number().int().min(1).max(7), word: z.number().int().min(1).max(100),
}).strict();
export type Coordinate = z.infer<typeof coordinateSchema>;
export const ratingSchema = z.enum(["again", "hard", "good", "easy"]);
export type Rating = z.infer<typeof ratingSchema>;
export const attemptSchema = z.object({
  clientAttemptId: z.uuid(), sessionId: z.uuid(), vocabularyId: z.uuid(), rating: ratingSchema,
}).strict();
export type AttemptInput = z.infer<typeof attemptSchema>;
export interface ReferenceInput extends Coordinate { sourceWordId: string; sourceVerseId: string; environment: "prelive" | "production" }
export interface LearningItem extends Coordinate { vocabularyId: string; reviewed: boolean }
export interface LearningSession { id: string; surah: number; completed: boolean; items: LearningItem[] }
export interface AttemptResult {
  attemptId: string; reviewedAt: string; dueAt: string; reviewCount: number;
  schedulerVersion: string; session: LearningSession;
}

/** Transparent starter intervals, not FSRS or a mastery score. */
export function nextInterval(rating: Rating, previousSeconds: number): number {
  if (rating === "again") return 600;
  if (rating === "hard") return Math.min(31_536_000, Math.max(3_600, Math.round(previousSeconds * 1.2)));
  if (rating === "good") return Math.min(31_536_000, Math.max(86_400, previousSeconds * 2));
  return Math.min(31_536_000, Math.max(259_200, previousSeconds * 3));
}
