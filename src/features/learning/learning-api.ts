import { apiFetch } from "@/lib/api";
import { authClient } from "../auth/auth-client";

export interface Coordinate { surah: number; ayah: number; word: number }
export interface Bookmark extends Coordinate { vocabularyId: string; createdAt: string }
export interface PersistentSession { id: string; surah: number; kind: "practice" | "daily"; completed: boolean; serverNow?: string;
  items: (Coordinate & { vocabularyId: string; reviewed: boolean; revision: number; availableAt: string; reviewEvents: number; skipped: boolean })[] }
export type Rating = "again" | "hard" | "good" | "easy";
export interface AttemptSubmission { clientAttemptId: string; sessionId: string; vocabularyId: string; rating: Rating; expectedRevision?: number }
export interface SavedAttempt { attemptId: string; reviewedAt: string; dueAt: string; reviewCount: number; session: PersistentSession }
export interface LearningProgress {
  totalReviews: number; reviewedWords: number; dueWords: number; bookmarkedWords: number;
  items: (Coordinate & { vocabularyId: string; reviewCount: number; dueAt: string; lastRating: Rating })[];
}
export interface HistoryItem extends Coordinate { id: string; rating: Rating; reviewedAt: string }
export interface ReviewInbox {
  timezone: string; localDate: string; dayStart: string; dayEnd: string; serverNow: string;
  dueNow: number; overdue: number; laterToday: number; newWords: number; nextDueAt: string | null;
  reviewedToday: { attempts: number; words: number }; session: PersistentSession | null;
  items: (Coordinate & { vocabularyId: string; dueAt: string | null; reviewCount: number; state: string; schedulerVersion: string | null })[];
}
export interface ReviewPreview { revision: number; serverNow: string; schedulerVersion: string; ratings: Record<Rating, { dueAt: string; state: string }> }

export async function learningApi<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const { data, error } = authClient ? await authClient.auth.getSession() : { data: { session: null }, error: null };
  if (error || !data.session) throw new Error("Sign in to save your learning");
  const response = await apiFetch<{ success: true; data: T }>(`/api/learning${path}`, {
    method, headers: { Authorization: `Bearer ${data.session.access_token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: "no-store",
  });
  return response.data;
}
