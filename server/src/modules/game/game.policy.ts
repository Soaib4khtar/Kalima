/** Versioned rules, not a second scheduler. FSRS remains the only schedule writer. */
export const GAME_POLICY = 'growing-kingdom-v1';
export const MASTERY_POLICY = 'spaced-evidence-v1';
export const ECONOMY = { introductionXp: 5, dueXp: 10, challengeXp: 5, questXp: 15, questTokens: 1,
  dailyXpCap: 200, dailyTokenCap: 6, timezoneCooldownDays: 7, minimumPeriodHours: 20, dueRewardCooldownHours: 24,
  weeklyXp: 40, weeklyTokens: 2 } as const;
export const GAME_LIMITS = { challengeMinutes: 15, issuedChallengesPerHour: 12, challengeRequestsPerMinute: 20, kingdomRequestsPerMinute: 60 } as const;
export const MASTERY_THRESHOLDS = {
  growing: { occasions: 3, spanDays: 3, intervalDays: 3 },
  mature: { occasions: 4, spanDays: 14, intervalDays: 14, stability: 14 },
  bloom: { occasions: 5, spanDays: 30, intervalDays: 30, stability: 30 },
  minimumSuccessfulGapHours: 24,
} as const;
export const STRUCTURES = [
  { key: 'garden', title: 'Memory Garden', required: 0, description: 'A quiet place for every word you begin.' },
  { key: 'library', title: 'Library of Wisdom', required: 10, description: 'A home for durable knowledge.' },
  { key: 'bridge', title: 'Bridge of Recall', required: 25, description: 'Connect what you know with what comes next.' },
  { key: 'academy', title: 'Academy Tower', required: 50, description: 'A landmark of patient practice.' },
  { key: 'castle', title: 'Castle of Mastery', required: 100, description: 'Built one remembered word at a time.' },
] as const;
export const COSMETICS = [{ key: 'lanterns', title: 'Pathway lanterns', cost: 3 }, { key: 'fountain', title: 'Garden fountain', cost: 6 }] as const;
export interface MasteryEvidence { successfulOccasions: number; spanDays: number; intervalDays: number; stability: number;
  state: number; objectiveCorrect: boolean; latestRating: string | null }
export function masteryStage(e: MasteryEvidence): number {
  const { growing, mature, bloom } = MASTERY_THRESHOLDS;
  if (e.latestRating === 'again' || e.state === 3) return 1;
  if (e.successfulOccasions >= bloom.occasions && e.spanDays >= bloom.spanDays && e.intervalDays >= bloom.intervalDays && e.stability >= bloom.stability && e.state === 2 && e.objectiveCorrect) return 5;
  if (e.successfulOccasions >= mature.occasions && e.spanDays >= mature.spanDays && e.intervalDays >= mature.intervalDays && e.stability >= mature.stability && e.state === 2) return 4;
  if (e.successfulOccasions >= growing.occasions && e.spanDays >= growing.spanDays && e.intervalDays >= growing.intervalDays && e.state === 2) return 3;
  return e.successfulOccasions >= 1 ? 2 : 1;
}
export interface MissionSpec { kind: string; target: number; rewardXp: number; rewardTokens: number }
export function dailyMissions(available: number, newWords: number, due: number, difficult: number, challenge: boolean): MissionSpec[] {
  if (!available && !due) return []; // Honest unavailable state, not three impossible tasks.
  const spec = (kind: string, target: number): MissionSpec => ({ kind, target: Math.max(1, target), rewardXp: ECONOMY.questXp, rewardTokens: ECONOMY.questTokens });
  return [newWords ? spec('discovery', Math.min(2, newWords)) : due ? spec('due', Math.min(5, due)) : spec('participation', 1),
    difficult ? spec('recovery', Math.min(2, difficult)) : spec('participation', Math.min(3, Math.max(1, due + newWords))),
    challenge ? spec('challenge', 1) : spec('participation', 1)];
}
