import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from '../auth/auth-context';
import { learningApi } from '../learning/learning-api';
import type { QuranAttribution } from '@/lib/api';
import { nextWorldRefresh } from './game-time';

export interface Quest { id: string; kind: string; target: number; progress: number; rewardXp: number; rewardTokens: number; completedAt: string | null; period: 'daily' | 'weekly' }
export interface Structure { key: string; title: string; required: number; description: string; eligible: boolean; unlockedAt: string | null }
export interface GameOverview { xp: number; tokens: number; level: number; levelXp: number; plants: number; mastered: number; due: number;
  serverNow: string; timezone: string | null; localDate: string | null; resetsAt: string | null; nextDueAt: string | null; sourceAvailable: boolean; questsPaused: boolean;
  policyVersion: string; masteryVersion: string; missions: Quest[]; momentum: string[]; structures: Structure[];
  cosmetics: { key: string; title: string; cost: number; owned: boolean }[] }
export interface Plant { vocabularyId: string; surah: number; ayah: number; word: number; stage: number; dueAt: string; reviews: number; lastRating: string; health: string; masteryVersion: string }
export interface GardenPage { items: Plant[]; nextCursor: string | null; serverNow: string }
export interface LedgerPage { items: { id: string; source: string; xp: number; tokens: number; createdAt: string; policyVersion: string }[]; nextCursor: string | null }
export interface Challenge { id: string; expiresAt: string; prompt: string; reference: { surah: number; ayah: number; word: number }; choices: { id: string; text: string }[]; attribution: QuranAttribution }
export interface ChallengeResult { correct: boolean; correctChoice: string; completedAt: string }
export const gameApi = <T,>(path: string, method = 'GET', body?: unknown) => learningApi<T>(`/game${path}`, method, body);
export function useGame() {
  const { session } = useAuth();
  const user = session?.user.id;
  const query = useQuery({ queryKey: ['learning', user, 'game', 'overview'], queryFn: () => gameApi<GameOverview>('/overview'),
    enabled: Boolean(session), staleTime: 15_000, retry: false });
  const { data, refetch } = query;
  useEffect(() => {
    if (!user || !data) return;
    const delay = nextWorldRefresh(data.serverNow, data.resetsAt, data.nextDueAt);
    if (delay === null) return;
    const timer = window.setTimeout(() => { void refetch(); }, delay);
    return () => window.clearTimeout(timer);
  }, [data, refetch, user]);
  return query;
}
export const plantStages = ['Seed', 'Sprout', 'Growing plant', 'Mature plant', 'Bloom'];
