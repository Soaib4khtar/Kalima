import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { QuranSurahResult } from '../quran/quran.schemas.js';
import { AppError } from '../../utils/app-error.js';
import { COSMETICS, dailyMissions, ECONOMY, GAME_LIMITS, GAME_POLICY, MASTERY_POLICY, MASTERY_THRESHOLDS, masteryStage, STRUCTURES } from './game.policy.js';

type Ready = Extract<QuranSurahResult, { status: 'ready' }>;
type Coordinate = { surah: number; ayah: number; word: number };
type Choice = Coordinate & { id: string; sourceId: number };
type Period = { id: string; local_date: string; timezone: string; starts_at: Date; ends_at: Date };
type ReviewEvent = { id: string; vocabularyId: string; rating: string; kind: string; before: { due: string; state: number }; now: Date };
const utcDay = (now: Date) => now.toISOString().slice(0, 10);
const coordinate = (c: Coordinate) => `${c.surah}:${c.ayah}:${c.word}`;
const sourceWords = (source: Ready) => source.surah.verses.flatMap(v => v.words.filter(w => w.translation?.trim()).map(w => ({ ...w, surah: source.surah.number, ayah: v.number, word: w.position })));
function fingerprint(source: Ready, choices: Choice[]) {
  const words = sourceWords(source);
  return createHash('sha256').update(JSON.stringify(choices.map(c => {
    const w = words.find(w => coordinate(w) === coordinate(c) && w.sourceId === c.sourceId);
    return w ? [w.sourceId, w.textUthmani, w.translation, source.attribution] : null;
  }))).digest('hex');
}
export class GameRepository {
  constructor(private readonly pool: Pool, private readonly clock: () => Date = () => new Date()) {}

  private async transaction<T>(user: string, action: (db: PoolClient, now: Date) => Promise<T>) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT id FROM learning.profiles WHERE id=$1 FOR UPDATE', [user]);
      const result = await action(db, this.clock());
      await db.query('COMMIT'); return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  private async account(db: PoolClient, user: string) {
    await db.query('INSERT INTO learning.game_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING', [user]);
    // Existing progress is visible without minting rewards for historical activity.
    const initialized = await db.query('UPDATE learning.game_accounts SET initialized_at=now() WHERE user_id=$1 AND initialized_at IS NULL RETURNING user_id', [user]);
    if (initialized.rowCount) await db.query(`INSERT INTO learning.game_plants(user_id,vocabulary_id,policy_version)
      SELECT user_id,vocabulary_id,$2 FROM learning.vocabulary_progress WHERE user_id=$1 ON CONFLICT DO NOTHING`, [user, MASTERY_POLICY]);
  }

  private async award(db: PoolClient, user: string, key: string, event: string | null, xp: number, tokens: number, now: Date) {
    const old = await db.query('SELECT 1 FROM learning.reward_ledger WHERE user_id=$1 AND source_key=$2', [user, key]);
    if (old.rowCount) return { xp: 0, tokens: 0 };
    const sums = (await db.query(`SELECT COALESCE(sum(xp_delta),0)::int AS xp,
      COALESCE(sum(GREATEST(token_delta,0)),0)::int AS tokens FROM learning.reward_ledger WHERE user_id=$1 AND reward_day=$2`, [user, utcDay(now)])).rows[0];
    const earnedXp = Math.max(0, Math.min(xp, ECONOMY.dailyXpCap - sums.xp));
    const earnedTokens = tokens < 0 ? tokens : Math.max(0, Math.min(tokens, ECONOMY.dailyTokenCap - sums.tokens));
    const updated = await db.query(`UPDATE learning.game_accounts SET xp=xp+$2,tokens=tokens+$3 WHERE user_id=$1 AND tokens+$3>=0 RETURNING user_id`, [user, earnedXp, earnedTokens]);
    if (!updated.rowCount) throw new AppError(409, 'INSUFFICIENT_TOKENS', 'Not enough Build Tokens for this decoration');
    // Even capped awards consume their source key; replay cannot mint them tomorrow.
    await db.query(`INSERT INTO learning.reward_ledger(user_id,source_key,source_event_id,xp_delta,token_delta,reward_day,policy_version,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [user, key, event, earnedXp, earnedTokens, utcDay(now), GAME_POLICY, now]);
    return { xp: earnedXp, tokens: earnedTokens };
  }

  private async bounds(db: PoolClient, timezone: string, now: Date, weekly = false) {
    const start = weekly ? "date_trunc('week',$1::timestamptz AT TIME ZONE $2)" : "date_trunc('day',$1::timestamptz AT TIME ZONE $2)";
    const result = await db.query(`SELECT (${start})::date::text AS date, (${start}) AT TIME ZONE $2 AS start,
      (${start}+interval '${weekly ? '7 days' : '1 day'}') AT TIME ZONE $2 AS finish`, [now, timezone]);
    return result.rows[0] as { date: string; start: Date; finish: Date };
  }

  private async period(db: PoolClient, user: string, source: Ready | null, now: Date, weekly = false) {
    const kind = weekly ? 'weekly' : 'daily';
    const last = (await db.query<Period>('SELECT *,local_date::text FROM learning.game_periods WHERE user_id=$1 AND kind=$2 ORDER BY ends_at DESC LIMIT 1', [user, kind])).rows[0];
    if (last && (now < last.ends_at || now.getTime() < last.starts_at.getTime() + (weekly ? 144 : ECONOMY.minimumPeriodHours) * 3600_000)) return last;
    if (!source) return last ?? null;
    const timezone = (await db.query('SELECT timezone FROM learning.profiles WHERE id=$1', [user])).rows[0].timezone;
    const bounds = await this.bounds(db, timezone, now, weekly);
    // Westward travel never reissues an already completed civil date.
    if (last && bounds.date <= String(last.local_date)) return last;
    const periodStart = new Date(Math.max(bounds.start.getTime(), last?.ends_at.getTime() ?? bounds.start.getTime()));
    const words = sourceWords(source);
    if (!words.length) return last ?? null;
    const progress = (await db.query(`SELECT v.surah,v.ayah,v.word,p.last_rating,p.due_at FROM learning.vocabulary_progress p
      JOIN learning.vocabulary_items v ON v.id=p.vocabulary_id WHERE p.user_id=$1`, [user])).rows.filter(p => words.some(w => coordinate(w) === coordinate(p)));
    const due = progress.filter(p => p.due_at <= now);
    const remainingDays = (await db.query(`SELECT (($1::timestamptz AT TIME ZONE $3)::date-($2::timestamptz AT TIME ZONE $3)::date)::int AS days`, [bounds.finish, now, timezone])).rows[0].days;
    const specs = weekly ? [{ kind: 'days', target: Math.max(1, Math.min(4, remainingDays)), rewardXp: ECONOMY.weeklyXp, rewardTokens: ECONOMY.weeklyTokens }] : dailyMissions(words.length, words.length - progress.length, due.length, due.filter(p => p.last_rating === 'again').length,
      new Set(words.map(w => w.translation!.normalize('NFC').trim().toLowerCase())).size >= 2);
    const result = (await db.query<Period>(`INSERT INTO learning.game_periods(user_id,kind,local_date,timezone,starts_at,ends_at,policy_version)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *,local_date::text`, [user, kind, bounds.date, timezone, periodStart, bounds.finish, GAME_POLICY])).rows[0]!;
    for (const [slot, spec] of specs.entries()) {
      const mission = (await db.query(`INSERT INTO learning.game_missions(user_id,period_id,slot,kind,target,reward_xp,reward_tokens)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [user, result.id, slot, spec.kind, spec.target, spec.rewardXp, spec.rewardTokens])).rows[0];
      // A session may cross midnight or an outage before the new world is opened.
      // Reconcile only real post-feature events inside this issued civil period,
      // with currently available source coordinates. At most target rows are used.
      const conditions: Record<string, string> = {
        discovery: "e.kind='review' AND a.result->>'reviewCount'='1'",
        participation: "e.kind='review'",
        due: "s.kind='daily' AND a.memory_before->>'state'='2' AND (a.memory_before->>'due')::timestamptz<=e.occurred_at",
        recovery: `s.kind='daily' AND (a.memory_before->>'state')::int>0 AND (a.memory_before->>'due')::timestamptz<=e.occurred_at AND
          (SELECT prior.rating FROM learning.review_attempts prior WHERE prior.user_id=e.user_id AND prior.vocabulary_id=e.vocabulary_id
          AND (prior.reviewed_at,prior.id)<(a.reviewed_at,a.id) ORDER BY prior.reviewed_at DESC,prior.id DESC LIMIT 1)='again'`,
        challenge: "e.kind='challenge' AND c.result->>'correct'='true'",
        days: "(e.kind='review' OR c.result->>'correct'='true')",
      };
      const distinct = spec.kind === 'days' ? '(e.occurred_at AT TIME ZONE $5)::date::text' : 'e.vocabulary_id::text';
      const past = (await db.query(`SELECT DISTINCT ON (${distinct}) ${distinct} AS key,e.id FROM learning.game_events e
        JOIN learning.vocabulary_items v ON v.id=e.vocabulary_id LEFT JOIN learning.review_attempts a ON a.id=e.review_id
        LEFT JOIN learning.review_sessions s ON s.id=a.session_id LEFT JOIN learning.knowledge_challenges c ON c.id=e.id AND c.user_id=e.user_id
        WHERE e.user_id=$1 AND $5::text IS NOT NULL AND e.occurred_at>=$2 AND e.occurred_at<=$3 AND concat_ws(':',v.surah,v.ayah,v.word)=ANY($4::text[])
        AND (${conditions[spec.kind]}) ORDER BY ${distinct},e.occurred_at,e.id LIMIT $6`,
      [user, periodStart, now, words.map(coordinate), timezone, spec.target])).rows;
      for (const step of past) await db.query('INSERT INTO learning.game_mission_steps(user_id,mission_id,distinct_key,source_event_id) VALUES($1,$2,$3,$4)', [user, mission.id, step.key, step.id]);
      if (past.length) {
        const complete = past.length >= spec.target;
        await db.query('UPDATE learning.game_missions SET progress=$2,completed_at=$3 WHERE id=$1', [mission.id, past.length, complete ? now : null]);
        if (complete) await this.award(db, user, `quest:${mission.id}`, past.at(-1)!.id, spec.rewardXp, spec.rewardTokens, now);
      }
    }
    return result;
  }

  async prepare(db: PoolClient, user: string, source: Ready, now: Date) {
    await this.account(db, user);
    await this.period(db, user, source, now);
    await this.period(db, user, source, now, true);
  }

  private async missions(db: PoolClient, user: string, event: string, vocabulary: string, categories: string[], now: Date) {
    const missions = await db.query(`SELECT m.*,p.timezone FROM learning.game_missions m JOIN learning.game_periods p ON p.id=m.period_id
      WHERE m.user_id=$1 AND m.completed_at IS NULL AND p.starts_at<=$2 AND p.ends_at>$2`, [user, now]);
    for (const mission of missions.rows) {
      if (mission.kind !== 'days' && !categories.includes(mission.kind)) continue;
      const distinct = mission.kind === 'days' ? (await this.bounds(db, mission.timezone, now)).date : vocabulary;
      const inserted = await db.query(`INSERT INTO learning.game_mission_steps(user_id,mission_id,distinct_key,source_event_id)
        VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING mission_id`, [user, mission.id, distinct, event]);
      if (!inserted.rowCount) continue;
      const finished = (await db.query(`UPDATE learning.game_missions SET progress=LEAST(target,progress+1),
        completed_at=CASE WHEN progress+1>=target THEN $2::timestamptz ELSE NULL END WHERE id=$1 RETURNING completed_at`, [mission.id, now])).rows[0].completed_at;
      if (finished) await this.award(db, user, `quest:${mission.id}`, event, mission.reward_xp, mission.reward_tokens, now);
    }
  }

  private async refreshPlant(db: PoolClient, user: string, vocabulary: string) {
    const p = (await db.query('SELECT * FROM learning.vocabulary_progress WHERE user_id=$1 AND vocabulary_id=$2', [user, vocabulary])).rows[0];
    if (!p) return;
    const events = await db.query(`SELECT a.rating,a.reviewed_at,a.memory_before,s.kind FROM learning.review_attempts a
      JOIN learning.review_sessions s ON s.id=a.session_id WHERE a.user_id=$1 AND a.vocabulary_id=$2 ORDER BY a.reviewed_at,a.id`, [user, vocabulary]);
    let first: number | null = null, last: number | null = null, occasions = 0;
    for (const event of events.rows) {
      if (event.rating === 'again') continue;
      const time = event.reviewed_at.getTime();
      const scheduled = event.kind === 'daily' && event.memory_before?.state === 2 && Date.parse(event.memory_before.due) <= time;
      if (last === null || (scheduled && time - last >= MASTERY_THRESHOLDS.minimumSuccessfulGapHours * 3600_000)) { first ??= time; last = time; occasions++; }
    }
    const objective = (await db.query(`SELECT 1 FROM learning.knowledge_challenges WHERE user_id=$1 AND vocabulary_id=$2 AND result->>'correct'='true' LIMIT 1`, [user, vocabulary])).rowCount;
    const stage = masteryStage({ successfulOccasions: occasions, spanDays: first === null || last === null ? 0 : (last - first) / 86400_000,
      intervalDays: p.interval_seconds / 86400, stability: Number(p.fsrs_card?.stability ?? 0), state: p.fsrs_card?.state ?? 0,
      objectiveCorrect: Boolean(objective), latestRating: p.last_rating });
    await db.query(`INSERT INTO learning.game_plants(user_id,vocabulary_id,highest_stage,policy_version) VALUES($1,$2,$3,$4)
      ON CONFLICT(user_id,vocabulary_id) DO UPDATE SET highest_stage=GREATEST(learning.game_plants.highest_stage,EXCLUDED.highest_stage)`, [user, vocabulary, stage, MASTERY_POLICY]);
  }

  /** Called ONLY after the authentic review row is inserted, on its existing transaction. */
  async recordReview(db: PoolClient, user: string, event: ReviewEvent, source: Ready | null) {
    await this.account(db, user);
    await this.period(db, user, source, event.now);
    await this.period(db, user, source, event.now, true);
    const inserted = await db.query(`INSERT INTO learning.game_events(id,user_id,vocabulary_id,kind,review_id,occurred_at,policy_version)
      VALUES($1,$2,$3,'review',$1,$4,$5) ON CONFLICT DO NOTHING RETURNING id`, [event.id, user, event.vocabularyId, event.now, GAME_POLICY]);
    if (!inserted.rowCount) return;
    const first = (await db.query('SELECT count(*)::int AS count FROM learning.review_attempts WHERE user_id=$1 AND vocabulary_id=$2', [user, event.vocabularyId])).rows[0].count === 1;
    const due = event.kind === 'daily' && event.before.state === 2 && Date.parse(event.before.due) <= event.now.getTime();
    const categories = ['participation'];
    if (first) { categories.push('discovery'); await this.award(db, user, `introduction:${event.vocabularyId}`, event.id, ECONOMY.introductionXp, 0, event.now); }
    if (due) {
      categories.push('due');
      const previous = (await db.query(`SELECT created_at FROM learning.reward_ledger WHERE user_id=$1 AND source_key=ANY($2::text[]) ORDER BY created_at DESC LIMIT 1`, [user,
        [utcDay(event.now), utcDay(new Date(event.now.getTime() - 86400_000))].map(day => `due:${event.vocabularyId}:${day}`)])).rows[0];
      if (!previous || event.now.getTime() - previous.created_at.getTime() >= ECONOMY.dueRewardCooldownHours * 3600_000) {
        await this.award(db, user, `due:${event.vocabularyId}:${utcDay(event.now)}`, event.id, ECONOMY.dueXp, 0, event.now);
      }
    }
    // Recovery must itself be scheduled (not a rapid practice loop).
    const previousRating = (await db.query('SELECT rating FROM learning.review_attempts WHERE user_id=$1 AND vocabulary_id=$2 AND id<>$3 ORDER BY reviewed_at DESC,id DESC LIMIT 1', [user, event.vocabularyId, event.id])).rows[0]?.rating;
    if (event.kind === 'daily' && event.before.state !== 0 && Date.parse(event.before.due) <= event.now.getTime() && previousRating === 'again') categories.push('recovery');
    await this.refreshPlant(db, user, event.vocabularyId);
    await this.missions(db, user, event.id, event.vocabularyId, categories, event.now);
  }

  async eventReward(db: PoolClient, user: string, event: string) {
    return (await db.query('SELECT COALESCE(sum(xp_delta),0)::int AS xp,COALESCE(sum(token_delta),0)::int AS tokens FROM learning.reward_ledger WHERE user_id=$1 AND source_event_id=$2', [user, event])).rows[0] as { xp: number; tokens: number };
  }

  async guard(user: string, action: string) {
    const count = await this.transaction(user, async (db, now) => {
      await db.query("DELETE FROM learning.game_api_windows WHERE user_id=$1 AND window_at<$2::timestamptz-interval '1 day'", [user, now]);
      return (await db.query(`INSERT INTO learning.game_api_windows(user_id,action,window_at,requests) VALUES($1,$2,date_trunc('minute',$3::timestamptz),1)
        ON CONFLICT(user_id,action,window_at) DO UPDATE SET requests=learning.game_api_windows.requests+1 RETURNING requests`, [user, action, now])).rows[0].requests;
    });
    if (count > (action === 'challenge' ? GAME_LIMITS.challengeRequestsPerMinute : GAME_LIMITS.kingdomRequestsPerMinute)) throw new AppError(429, 'GAME_RATE_LIMIT', 'Please wait a moment before trying this action again');
  }

  async audit(user: string, code: string) {
    // Bounded categories and hourly counters only. No emails, IPs, tokens or payloads.
    if (!/^(GAME_RATE_LIMIT|CHALLENGE_|INVALID_|MILESTONE_|INSUFFICIENT_|UNKNOWN_|GARDEN_|STALE_REVIEW|ATTEMPT_ID_CONFLICT|NOT_DUE)/.test(code)) return;
    await this.transaction(user, async (db, now) => {
      await db.query("DELETE FROM learning.game_audit WHERE user_id=$1 AND window_at<$2::timestamptz-interval '30 days'", [user, now]);
      await db.query(`INSERT INTO learning.game_audit VALUES($1,$2,date_trunc('hour',$3::timestamptz),1)
        ON CONFLICT(user_id,code,window_at) DO UPDATE SET occurrences=learning.game_audit.occurrences+1`, [user, code, now]);
    });
  }

  async overview(user: string, source: Ready | null) {
    return this.transaction(user, async (db, now) => {
      await this.account(db, user);
      const daily = await this.period(db, user, source, now);
      const weekly = await this.period(db, user, source, now, true);
      const missions = (await db.query(`SELECT m.id,m.kind,m.target,m.progress,m.reward_xp AS "rewardXp",m.reward_tokens AS "rewardTokens",m.completed_at AS "completedAt",p.kind AS period
        FROM learning.game_missions m JOIN learning.game_periods p ON p.id=m.period_id WHERE m.user_id=$1 AND m.period_id=ANY($2::uuid[]) ORDER BY p.kind,m.slot`, [user, [daily?.id, weekly?.id].filter(Boolean)])).rows;
      const wallet = (await db.query('SELECT xp,tokens FROM learning.game_accounts WHERE user_id=$1', [user])).rows[0]!;
      const totals = (await db.query(`SELECT count(*)::int AS plants,count(*) FILTER(WHERE highest_stage=5)::int AS mastered,
        count(*) FILTER(WHERE p.due_at<=$2)::int AS due,min(p.due_at) FILTER(WHERE p.due_at>$2) AS "nextDueAt"
        FROM learning.game_plants g JOIN learning.vocabulary_progress p USING(user_id,vocabulary_id) WHERE g.user_id=$1`, [user, now])).rows[0];
      const unlocked = (await db.query('SELECT structure_key AS key,unlocked_at AS "unlockedAt" FROM learning.kingdom_structures WHERE user_id=$1', [user])).rows;
      const cosmetics = (await db.query('SELECT cosmetic_key FROM learning.kingdom_cosmetics WHERE user_id=$1', [user])).rows.map(r => r.cosmetic_key);
      const momentum = (await db.query(`SELECT DISTINCT (occurred_at AT TIME ZONE $2)::date::text AS day FROM (
        SELECT reviewed_at AS occurred_at FROM learning.review_attempts WHERE user_id=$1 AND reviewed_at >= $3::timestamptz-interval '7 days'
        UNION ALL SELECT occurred_at FROM learning.game_events WHERE user_id=$1 AND kind='challenge' AND occurred_at >= $3::timestamptz-interval '7 days'
        ) activity ORDER BY day`, [user, daily?.timezone ?? 'UTC', now])).rows.map(r => r.day);
      const questsPaused = Boolean(daily && daily.ends_at <= now);
      const nextReset = questsPaused ? (await this.bounds(db, (await db.query('SELECT timezone FROM learning.profiles WHERE id=$1', [user])).rows[0].timezone, now)).finish : daily?.ends_at;
      return { ...wallet, ...totals, level: Math.floor(wallet.xp / 100) + 1, levelXp: wallet.xp % 100, serverNow: now.toISOString(),
        policyVersion: GAME_POLICY, masteryVersion: MASTERY_POLICY, sourceAvailable: Boolean(source),
        timezone: daily?.timezone ?? null, localDate: daily?.local_date ?? null, resetsAt: nextReset?.toISOString() ?? null, questsPaused,
        missions, momentum, structures: STRUCTURES.map(s => ({ ...s, unlockedAt: unlocked.find(u => u.key === s.key)?.unlockedAt ?? null,
          eligible: s.key === 'garden' ? totals.plants > 0 : totals.mastered >= s.required })),
        cosmetics: COSMETICS.map(c => ({ ...c, owned: cosmetics.includes(c.key) })) };
    });
  }

  async garden(user: string, cursor?: string, stage?: number) {
    return this.transaction(user, async (db, now) => {
      await this.account(db, user);
      const result = await db.query(`SELECT g.vocabulary_id AS "vocabularyId",v.surah,v.ayah,v.word,g.highest_stage AS stage,
        p.due_at AS "dueAt",p.last_rating AS "lastRating",p.review_count AS reviews,g.policy_version AS "masteryVersion",
        CASE WHEN p.last_rating='again' OR p.fsrs_card->>'state'='3' THEN 'recovering' WHEN p.due_at<$2 THEN 'needs-attention' ELSE 'resting' END AS health
        FROM learning.game_plants g JOIN learning.vocabulary_items v ON v.id=g.vocabulary_id
        JOIN learning.vocabulary_progress p USING(user_id,vocabulary_id)
        WHERE g.user_id=$1 AND ($3::uuid IS NULL OR g.vocabulary_id>$3) AND ($4::int IS NULL OR g.highest_stage=$4)
        ORDER BY g.vocabulary_id LIMIT 25`, [user, now, cursor ?? null, stage ?? null]);
      return { items: result.rows.slice(0, 24), nextCursor: result.rows.length > 24 ? result.rows[23].vocabularyId : null, serverNow: now.toISOString() };
    });
  }

  async unlock(user: string, key: string) {
    const spec = STRUCTURES.find(s => s.key === key);
    if (!spec) throw new AppError(400, 'UNKNOWN_STRUCTURE', 'Unknown kingdom structure');
    return this.transaction(user, async (db, now) => {
      await this.account(db, user);
      const counts = (await db.query('SELECT count(*)::int AS plants,count(*) FILTER(WHERE highest_stage=5)::int AS mastered FROM learning.game_plants WHERE user_id=$1', [user])).rows[0];
      if (spec.key === 'garden' ? !counts.plants : counts.mastered < spec.required) throw new AppError(409, 'MILESTONE_LOCKED', 'Keep learning: this milestone is not earned yet');
      await db.query(`INSERT INTO learning.kingdom_structures(user_id,structure_key,unlocked_at,mastery_version) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [user, key, now, MASTERY_POLICY]);
      return { key, unlocked: true };
    });
  }

  async decorate(user: string, key: string) {
    const spec = COSMETICS.find(c => c.key === key);
    if (!spec) throw new AppError(400, 'UNKNOWN_COSMETIC', 'Unknown kingdom decoration');
    return this.transaction(user, async (db, now) => {
      await this.account(db, user);
      if ((await db.query('SELECT 1 FROM learning.kingdom_cosmetics WHERE user_id=$1 AND cosmetic_key=$2', [user, key])).rowCount) return { key, owned: true };
      if (!(await db.query("SELECT 1 FROM learning.kingdom_structures WHERE user_id=$1 AND structure_key='garden'", [user])).rowCount) throw new AppError(409, 'GARDEN_LOCKED', 'Activate your earned garden before decorating');
      await this.award(db, user, `cosmetic:${key}`, null, 0, -spec.cost, now);
      await db.query('INSERT INTO learning.kingdom_cosmetics VALUES($1,$2,$3)', [user, key, now]);
      return { key, owned: true };
    });
  }

  async ledger(user: string, cursor?: string) {
    const rows = (await this.pool.query(`SELECT id,source_key AS source,xp_delta AS xp,token_delta AS tokens,created_at AS "createdAt",policy_version AS "policyVersion"
      FROM learning.reward_ledger WHERE user_id=$1 AND ($2::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM learning.reward_ledger WHERE id=$2 AND user_id=$1))
      ORDER BY created_at DESC,id DESC LIMIT 31`, [user, cursor ?? null])).rows;
    return { items: rows.slice(0, 30), nextCursor: rows.length > 30 ? rows[29].id : null };
  }

  async issueChallenge(user: string, vocabulary: string, source: Ready) {
    return this.transaction(user, async (db, now) => {
      await this.account(db, user);
      const owned = (await db.query(`SELECT v.* FROM learning.vocabulary_progress p JOIN learning.vocabulary_items v ON v.id=p.vocabulary_id
        WHERE p.user_id=$1 AND p.vocabulary_id=$2`, [user, vocabulary])).rows[0];
      if (!owned) throw new AppError(404, 'WORD_NOT_LEARNED', 'Learn this word before trying a knowledge check');
      let challenge = (await db.query(`SELECT * FROM learning.knowledge_challenges WHERE user_id=$1 AND vocabulary_id=$2 AND completed_at IS NULL AND expires_at>$3 ORDER BY issued_at DESC LIMIT 1`, [user, vocabulary, now])).rows[0];
      const words = sourceWords(source), target = words.find(w => coordinate(w) === coordinate(owned));
      if (!target) throw new AppError(503, 'CHALLENGE_SOURCE_UNAVAILABLE', 'A verified contextual meaning is not available');
      if (!challenge) {
        const rate = (await db.query(`SELECT count(*)::int AS count FROM learning.knowledge_challenges WHERE user_id=$1 AND issued_at>$2::timestamptz-interval '1 hour'`, [user, now])).rows[0].count;
        if (rate >= GAME_LIMITS.issuedChallengesPerHour) throw new AppError(429, 'CHALLENGE_LIMIT', 'Take a little time before starting another knowledge check');
        const seen = new Set([target.translation!.normalize('NFC').trim().toLowerCase()]);
        const options = [target];
        for (const w of words) { const meaning = w.translation!.normalize('NFC').trim().toLowerCase(); if (!seen.has(meaning)) { seen.add(meaning); options.push(w); } if (options.length === 3) break; }
        if (options.length < 2) throw new AppError(503, 'CHALLENGE_ALTERNATIVES_UNAVAILABLE', 'Not enough distinct source-provided meanings for a knowledge check');
        const choices: Choice[] = options.map(w => ({ id: randomUUID(), surah: w.surah, ayah: w.ayah, word: w.word, sourceId: w.sourceId }));
        const correct = choices[0]!.id;
        for (let i = choices.length - 1; i > 0; i--) { const j = randomInt(i + 1); [choices[i], choices[j]] = [choices[j]!, choices[i]!]; }
        challenge = (await db.query(`INSERT INTO learning.knowledge_challenges(user_id,vocabulary_id,choices,correct_choice,content_hash,issued_at,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [user, vocabulary, JSON.stringify(choices), correct, fingerprint(source, choices), now, new Date(now.getTime() + GAME_LIMITS.challengeMinutes * 60_000)])).rows[0];
      }
      if (challenge.content_hash !== fingerprint(source, challenge.choices)) throw new AppError(409, 'CHALLENGE_SOURCE_CHANGED', 'Source content changed. Please try again after this check expires');
      return { id: challenge.id, expiresAt: challenge.expires_at.toISOString(), prompt: target.textUthmani, reference: { surah: target.surah, ayah: target.ayah, word: target.word },
        choices: (challenge.choices as Choice[]).map(c => ({ id: c.id, text: words.find(w => coordinate(w) === coordinate(c))!.translation! })), attribution: source.attribution };
    });
  }

  async answerChallenge(user: string, id: string, answer: string, source: Ready | null) {
    return this.transaction(user, async (db, now) => {
      const c = (await db.query('SELECT * FROM learning.knowledge_challenges WHERE user_id=$1 AND id=$2', [user, id])).rows[0];
      if (!c) throw new AppError(404, 'CHALLENGE_NOT_FOUND', 'Knowledge check not found');
      if (c.completed_at) {
        if (c.submitted_choice !== answer) throw new AppError(409, 'CHALLENGE_CONSUMED', 'This check was already completed');
        return c.result;
      }
      if (now >= c.expires_at) throw new AppError(409, 'CHALLENGE_EXPIRED', 'This knowledge check expired. Start a new one');
      if (!(c.choices as Choice[]).some(v => v.id === answer)) throw new AppError(400, 'INVALID_CHOICE', 'Choose an answer from this check');
      if (!source || c.content_hash !== fingerprint(source, c.choices)) throw new AppError(503, 'CHALLENGE_SOURCE_UNAVAILABLE', 'The source cannot currently verify this check. Your learning progress is safe');
      const correct = c.correct_choice === answer;
      const result = { correct, correctChoice: c.correct_choice, completedAt: now.toISOString() };
      await db.query('UPDATE learning.knowledge_challenges SET submitted_choice=$3,completed_at=$4,result=$5 WHERE user_id=$1 AND id=$2', [user, id, answer, now, JSON.stringify(result)]);
      await db.query(`INSERT INTO learning.game_events(id,user_id,vocabulary_id,kind,occurred_at,policy_version) VALUES($1,$2,$3,'challenge',$4,$5)`, [id, user, c.vocabulary_id, now, GAME_POLICY]);
      if (correct) {
        await this.award(db, user, `challenge:${c.vocabulary_id}:${utcDay(now)}`, id, ECONOMY.challengeXp, 0, now);
        await this.refreshPlant(db, user, c.vocabulary_id);
        await this.missions(db, user, id, c.vocabulary_id, ['challenge'], now);
      }
      return result;
    });
  }
}
