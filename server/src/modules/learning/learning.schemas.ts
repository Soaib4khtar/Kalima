import { z } from "zod";

export const coordinateSchema = z.object({
  surah: z.literal(1), ayah: z.number().int().min(1).max(7), word: z.number().int().min(1).max(100),
}).strict();
export type Coordinate = z.infer<typeof coordinateSchema>;
export const ratingSchema = z.enum(["again", "hard", "good", "easy"]);
export type Rating = z.infer<typeof ratingSchema>;
export const attemptSchema = z.object({
  clientAttemptId: z.uuid(), sessionId: z.uuid(), vocabularyId: z.uuid(), rating: ratingSchema,
  expectedRevision: z.number().int().nonnegative().optional(),
}).strict();
export type AttemptInput = z.infer<typeof attemptSchema>;
export interface ReferenceInput extends Coordinate { sourceWordId: string; sourceVerseId: string; environment: "prelive" | "production" }
export interface LearningItem extends Coordinate { vocabularyId: string; reviewed: boolean; revision: number; availableAt: string; skipped: boolean; reviewEvents: number }
export interface LearningSession { id: string; surah: number; kind: "practice" | "daily"; completed: boolean; items: LearningItem[]; serverNow?: string }
export interface AttemptResult {
  attemptId: string; reviewedAt: string; dueAt: string; reviewCount: number;
  schedulerVersion: string; session: LearningSession;
}
export const timezoneSchema = z.string().min(1).max(100).refine((value) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "An IANA timezone is required");
