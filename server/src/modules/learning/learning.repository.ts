import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { LearnerIdentity } from "../auth/auth.js";
import { AppError } from "../../utils/app-error.js";
import { type AttemptInput, type AttemptResult, type LearningItem, type LearningSession, type ReferenceInput } from "./learning.schemas.js";
import { bootstrapCard, restoreCard, scheduleCard, serializeCard, serializeLog, previewCard, isLearning, memoryState, SCHEDULER_PARAMETERS, SCHEDULER_VERSION } from "./learning.scheduler.js";

type Sql = Pick<Pool, "query"> | PoolClient;
export class LearningRepository {
  constructor(private readonly pool: Pool, private readonly clock: () => Date = () => new Date()) {}

  async profile(identity: LearnerIdentity) {
    const { rows } = await this.pool.query<{ id: string; displayName: string | null; timezone: string }>(
      `INSERT INTO learning.profiles(auth_issuer,auth_subject) VALUES($1,$2)
       ON CONFLICT(auth_issuer,auth_subject) DO UPDATE SET auth_subject=EXCLUDED.auth_subject
       RETURNING id,display_name AS "displayName",timezone`, [identity.issuer, identity.subject]);
    return rows[0]!;
  }

  async updateProfile(user: string, displayName: string | null | undefined, timezone?: string) {
    if (timezone && !(await this.pool.query("SELECT 1 FROM pg_timezone_names WHERE name=$1", [timezone])).rowCount) throw new AppError(400, "INVALID_TIMEZONE", "Select a supported IANA timezone");
    const result = await this.pool.query(`UPDATE learning.profiles SET display_name=CASE WHEN $2 THEN $3 ELSE display_name END,
      timezone=COALESCE($4,timezone) WHERE id=$1 RETURNING id,display_name AS "displayName",timezone`, [user, displayName !== undefined, displayName ?? null, timezone ?? null]);
    return result.rows[0];
  }

  private async transaction<T>(user: string, action: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      // Serialize each learner's mutations, including concurrent retries and
      // requests from different devices. Different learners do not block.
      await db.query("SELECT id FROM learning.profiles WHERE id=$1 FOR UPDATE", [user]);
      const result = await action(db);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally { db.release(); }
  }

  private async reference(db: Sql, ref: ReferenceInput): Promise<string> {
    const coordinate = [ref.surah, ref.ayah, ref.word];
    await db.query("INSERT INTO learning.word_occurrences(surah,ayah,word) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", coordinate);
    await db.query(`INSERT INTO learning.occurrence_sources(surah,ayah,word,provider,environment,external_word_id,external_verse_id)
      VALUES($1,$2,$3,'quran-foundation',$4,$5,$6) ON CONFLICT(surah,ayah,word,provider,environment)
      DO UPDATE SET external_word_id=EXCLUDED.external_word_id,external_verse_id=EXCLUDED.external_verse_id,observed_at=now()`,
    [...coordinate, ref.environment, ref.sourceWordId, ref.sourceVerseId]);
    const { rows } = await db.query<{ id: string }>(`INSERT INTO learning.vocabulary_items(identity_kind,surah,ayah,word)
      VALUES('occurrence',$1,$2,$3) ON CONFLICT(surah,ayah,word) DO UPDATE SET surah=EXCLUDED.surah RETURNING id`, coordinate);
    return rows[0]!.id;
  }

  async bookmark(user: string, ref: ReferenceInput) {
    return this.transaction(user, async (db) => {
      const vocabularyId = await this.reference(db, ref);
      await db.query("INSERT INTO learning.bookmarks(user_id,vocabulary_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [user, vocabularyId]);
      return { vocabularyId, surah: ref.surah, ayah: ref.ayah, word: ref.word };
    });
  }

  async removeBookmark(user: string, vocabularyId: string) {
    const result = await this.pool.query("DELETE FROM learning.bookmarks WHERE user_id=$1 AND vocabulary_id=$2", [user, vocabularyId]);
    return { removed: result.rowCount === 1 };
  }

  async bookmarks(user: string, cursor?: string) {
    const { rows } = await this.pool.query(`SELECT v.id AS "vocabularyId",v.surah,v.ayah,v.word,b.created_at AS "createdAt",
      (SELECT jsonb_agg(jsonb_build_object('provider',s.provider,'environment',s.environment,
        'wordId',s.external_word_id,'verseId',s.external_verse_id)) FROM learning.occurrence_sources s
        WHERE (s.surah,s.ayah,s.word)=(v.surah,v.ayah,v.word)) AS sources
      FROM learning.bookmarks b JOIN learning.vocabulary_items v ON v.id=b.vocabulary_id
      WHERE b.user_id=$1 AND ($2::uuid IS NULL OR v.id>$2) ORDER BY v.id LIMIT 100`, [user, cursor ?? null]);
    return { items: rows, nextCursor: rows.length === 100 ? rows.at(-1)!.vocabularyId : null };
  }

  private async session(db: Sql, user: string, id?: string, kind = "practice", now = this.clock()): Promise<LearningSession | null> {
    const { rows } = await db.query<{ id: string; surah: number; kind: "practice" | "daily"; completed: boolean }>(`SELECT id,surah,kind,completed_at IS NOT NULL AS completed
      FROM learning.review_sessions WHERE user_id=$1 AND
      (($2::uuid IS NULL AND surah=1 AND kind=$3 AND completed_at IS NULL) OR id=$2) ORDER BY created_at DESC LIMIT 1`, [user, id ?? null, kind]);
    const found = rows[0];
    if (!found) return null;
    const items = await db.query<Omit<LearningItem, "availableAt"> & { availableAt: Date }>(`SELECT v.id AS "vocabularyId",v.surah,v.ayah,v.word,i.reviewed_at IS NOT NULL AS reviewed,
      COALESCE(p.revision,0) AS revision,i.available_at AS "availableAt",i.skipped,i.review_events AS "reviewEvents"
      FROM learning.session_items i JOIN learning.vocabulary_items v ON v.id=i.vocabulary_id
      LEFT JOIN learning.vocabulary_progress p ON p.vocabulary_id=v.id AND p.user_id=$2
      WHERE i.session_id=$1 ORDER BY CASE WHEN $3='daily' THEN i.available_at END,i.ordinal`, [found.id, user, found.kind]);
    return { ...found, items: items.rows.map((item) => ({ ...item, availableAt: item.availableAt.toISOString() })),
      ...(found.kind === "daily" ? { serverNow: now.toISOString() } : {}) };
  }

  currentSession(user: string, kind: "practice" | "daily" = "practice") {
    return this.transaction(user, async (db) => {
      const now = this.clock();
      if (kind === "daily") await this.refreshDaily(db, user, now);
      return this.session(db, user, undefined, kind, now);
    });
  }

  private async refreshDaily(db: Sql, user: string, now: Date) {
    // Reviews from another session/device invalidate stale queue revisions.
    await db.query(`UPDATE learning.session_items i SET available_at=p.due_at,expected_revision=p.revision,
      reviewed_at=CASE WHEN p.fsrs_card->>'state'='2' AND p.due_at>$2 THEN $2::timestamptz ELSE NULL END
      FROM learning.vocabulary_progress p,learning.review_sessions s WHERE s.user_id=$1 AND s.kind='daily' AND s.completed_at IS NULL
      AND i.session_id=s.id AND i.reviewed_at IS NULL AND p.user_id=$1 AND p.vocabulary_id=i.vocabulary_id AND i.expected_revision<>p.revision`, [user, now]);
    await db.query(`UPDATE learning.review_sessions s SET completed_at=$2 WHERE s.user_id=$1 AND s.kind='daily' AND s.completed_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM learning.session_items i WHERE i.session_id=s.id AND i.reviewed_at IS NULL)`, [user, now]);
  }

  private async memory(db: Sql, user: string, vocabularyId: string, now: Date) {
    const result = await db.query<{ fsrs_card: unknown; due_at: Date; review_count: number; revision: number }>(
      "SELECT fsrs_card,due_at,review_count,revision FROM learning.vocabulary_progress WHERE user_id=$1 AND vocabulary_id=$2", [user, vocabularyId]);
    const progress = result.rows[0];
    if (progress?.fsrs_card) return { card: restoreCard(progress.fsrs_card), revision: progress.revision };
    const events = await db.query<{ rating: "again" | "hard" | "good" | "easy"; reviewedAt: Date }>(
      'SELECT rating,reviewed_at AS "reviewedAt" FROM learning.review_attempts WHERE user_id=$1 AND vocabulary_id=$2 ORDER BY reviewed_at,id', [user, vocabularyId]);
    if (events.rows.length !== (progress?.review_count ?? 0)) throw new AppError(503, "REVIEW_HISTORY_INCOMPLETE", "Review history needs repair before scheduling. Existing progress is safe");
    return { card: bootstrapCard(events.rows, progress?.due_at ?? now, now), revision: progress?.revision ?? 0 };
  }

  private currentItem(session: LearningSession, now: Date) {
    return session.items.find((item) => !item.reviewed && (session.kind !== "daily" || Date.parse(item.availableAt) <= now.getTime()));
  }

  async reviewPreview(user: string, sessionId: string, vocabularyId: string) {
    return this.transaction(user, async (db) => {
      const now = this.clock(); await this.refreshDaily(db, user, now);
      const session = await this.session(db, user, sessionId, "daily", now);
      if (!session || session.kind !== "daily") throw new AppError(404, "SESSION_NOT_FOUND", "Learning session not found");
      const current = this.currentItem(session, now);
      if (!current || current.vocabularyId !== vocabularyId) throw new AppError(409, "NOT_DUE", "Refresh your session; this word is not currently due");
      const { card, revision } = await this.memory(db, user, vocabularyId, now);
      return { revision, serverNow: now.toISOString(), schedulerVersion: SCHEDULER_VERSION, ratings: previewCard(card, now) };
    });
  }

  async dayBounds(db: Sql, timezone: string, now: Date) {
    const result = await db.query<{ localDate: string; startAt: Date; endAt: Date }>(`SELECT
      (($1::timestamptz AT TIME ZONE $2)::date)::text AS "localDate",
      (($1::timestamptz AT TIME ZONE $2)::date::timestamp AT TIME ZONE $2) AS "startAt",
      ((($1::timestamptz AT TIME ZONE $2)::date+1)::timestamp AT TIME ZONE $2) AS "endAt"`, [now, timezone]);
    return result.rows[0]!;
  }

  async inbox(user: string) {
    return this.transaction(user, async (db) => {
      const now = this.clock(); await this.refreshDaily(db, user, now);
      const timezone = (await db.query<{ timezone: string }>("SELECT timezone FROM learning.profiles WHERE id=$1", [user])).rows[0]!.timezone;
      const bounds = await this.dayBounds(db, timezone, now);
      const rows = await db.query<{ vocabularyId: string; surah: number; ayah: number; word: number; dueAt: Date | null; reviewCount: number; state: number | null; schedulerVersion: string | null }>(`SELECT v.id AS "vocabularyId",v.surah,v.ayah,v.word,
        p.due_at AS "dueAt",COALESCE(p.review_count,0) AS "reviewCount",(p.fsrs_card->>'state')::int AS state,p.scheduler_version AS "schedulerVersion"
        FROM learning.vocabulary_items v LEFT JOIN learning.vocabulary_progress p ON p.vocabulary_id=v.id AND p.user_id=$1
        LEFT JOIN learning.bookmarks b ON b.vocabulary_id=v.id AND b.user_id=$1 WHERE v.surah=1 AND (p.user_id IS NOT NULL OR b.user_id IS NOT NULL)
        ORDER BY p.due_at NULLS LAST,v.ayah,v.word LIMIT 100`, [user]);
      const items = rows.rows.map((row) => ({ ...row, dueAt: row.dueAt?.toISOString() ?? null,
        state: row.state === null ? row.reviewCount ? "legacy" : "new" : memoryState(row.state) }));
      const today = await db.query<{ attempts: number; words: number }>(`SELECT count(*)::int AS attempts,count(DISTINCT vocabulary_id)::int AS words
        FROM learning.review_attempts WHERE user_id=$1 AND reviewed_at>=$2 AND reviewed_at<$3`, [user, bounds.startAt, bounds.endAt]);
      return { timezone, localDate: bounds.localDate, dayStart: bounds.startAt.toISOString(), dayEnd: bounds.endAt.toISOString(), serverNow: now.toISOString(),
        dueNow: items.filter((item) => item.dueAt && Date.parse(item.dueAt) <= now.getTime()).length,
        overdue: items.filter((item) => item.dueAt && Date.parse(item.dueAt) < bounds.startAt.getTime()).length,
        laterToday: items.filter((item) => item.dueAt && Date.parse(item.dueAt) > now.getTime() && Date.parse(item.dueAt) < bounds.endAt.getTime()).length,
        newWords: items.filter((item) => !item.dueAt).length, reviewedToday: today.rows[0]!,
        nextDueAt: items.filter((item) => item.dueAt && Date.parse(item.dueAt) > now.getTime())[0]?.dueAt ?? null,
        items: items.filter((item) => !item.dueAt || Date.parse(item.dueAt) < bounds.endAt.getTime()),
        session: await this.session(db, user, undefined, "daily", now) };
    });
  }

  async startDaily(user: string, references: ReferenceInput[], includeNew: boolean) {
    return this.transaction(user, async (db) => {
      const now = this.clock(); await this.refreshDaily(db, user, now);
      const active = await this.session(db, user, undefined, "daily", now);
      if (active) return { session: active, unavailableWords: 0 };
      const candidates = await db.query<{ id: string; ayah: number; word: number; due: Date | null; revision: number }>(`SELECT v.id,v.ayah,v.word,p.due_at AS due,COALESCE(p.revision,0) AS revision
        FROM learning.vocabulary_items v LEFT JOIN learning.vocabulary_progress p ON p.vocabulary_id=v.id AND p.user_id=$1
        LEFT JOIN learning.bookmarks b ON b.vocabulary_id=v.id AND b.user_id=$1 WHERE v.surah=1 AND
        (p.due_at<=$2 OR ($3 AND p.user_id IS NULL AND b.user_id IS NOT NULL)) ORDER BY p.due_at NULLS LAST,v.ayah,v.word LIMIT 100`, [user, now, includeNew]);
      const eligible = candidates.rows.filter((item) => references.some((ref) => ref.ayah === item.ayah && ref.word === item.word));
      if (!eligible.length) return { session: null, unavailableWords: candidates.rows.length };
      const id = randomUUID();
      await db.query("INSERT INTO learning.review_sessions(id,user_id,surah,kind,created_at) VALUES($1,$2,1,'daily',$3)", [id, user, now]);
      for (const [ordinal, item] of eligible.entries()) await db.query(`INSERT INTO learning.session_items(session_id,vocabulary_id,ordinal,available_at,expected_revision)
        VALUES($1,$2,$3,$4,$5)`, [id, item.id, ordinal, item.due ?? now, item.revision]);
      return { session: await this.session(db, user, id, "daily", now), unavailableWords: candidates.rows.length - eligible.length };
    });
  }

  async skipDaily(user: string, sessionId: string, vocabularyId: string, revision: number) {
    return this.transaction(user, async (db) => {
      const now = this.clock(); await this.refreshDaily(db, user, now);
      const session = await this.session(db, user, sessionId, "daily", now);
      if (!session || session.kind !== "daily") throw new AppError(404, "SESSION_NOT_FOUND", "Learning session not found");
      const current = this.currentItem(session, now);
      if (!current || current.vocabularyId !== vocabularyId || current.revision !== revision) throw new AppError(409, "STALE_REVIEW", "Refresh the saved session before continuing");
      await db.query("UPDATE learning.session_items SET reviewed_at=$3,skipped=true WHERE session_id=$1 AND vocabulary_id=$2", [sessionId, vocabularyId, now]);
      await this.refreshDaily(db, user, now);
      return this.session(db, user, sessionId, "daily", now);
    });
  }

  async startSession(user: string, references: ReferenceInput[], dueOnly: boolean) {
    return this.transaction(user, async (db) => {
      const now = this.clock();
      const active = await this.session(db, user);
      if (active) return active;
      const ids: string[] = [];
      for (const ref of references) {
        const id = await this.reference(db, ref);
        const progress = await db.query("SELECT 1 FROM learning.vocabulary_progress WHERE user_id=$1 AND vocabulary_id=$2 AND due_at>$3", [user, id, now]);
        if (!dueOnly || progress.rowCount === 0) ids.push(id);
      }
      if (!ids.length) return null;
      const { rows } = await db.query<{ id: string }>("INSERT INTO learning.review_sessions(user_id,surah,created_at) VALUES($1,1,$2) RETURNING id", [user, now]);
      for (const [ordinal, id] of ids.entries()) {
        await db.query("INSERT INTO learning.session_items(session_id,vocabulary_id,ordinal,available_at) VALUES($1,$2,$3,$4)", [rows[0]!.id, id, ordinal, now]);
      }
      return (await this.session(db, user, rows[0]!.id))!;
    });
  }

  async attempt(user: string, input: AttemptInput): Promise<AttemptResult> {
    return this.transaction(user, async (db) => {
      const previous = await db.query<{ session_id: string; vocabulary_id: string; rating: string; expected_revision: number | null; result: AttemptResult }>(
        "SELECT session_id,vocabulary_id,rating,expected_revision,result FROM learning.review_attempts WHERE user_id=$1 AND client_attempt_id=$2", [user, input.clientAttemptId]);
      const saved = previous.rows[0];
      if (saved) {
        if (saved.session_id !== input.sessionId || saved.vocabulary_id !== input.vocabularyId || saved.rating !== input.rating || saved.expected_revision !== (input.expectedRevision ?? null)) {
          throw new AppError(409, "ATTEMPT_ID_CONFLICT", "This attempt ID was already used for another submission");
        }
        return saved.result;
      }
      const now = this.clock(); await this.refreshDaily(db, user, now);
      const session = await this.session(db, user, input.sessionId, "practice", now);
      if (!session) throw new AppError(404, "SESSION_NOT_FOUND", "Learning session not found");
      if (session.kind === "daily" && input.expectedRevision === undefined) throw new AppError(400, "REVISION_REQUIRED", "A daily review requires the current card revision");
      const current = this.currentItem(session, now);
      if (!current || current.vocabularyId !== input.vocabularyId) {
        throw new AppError(409, "STALE_REVIEW", "This word is no longer current. Refresh your session");
      }
      const memory = await this.memory(db, user, input.vocabularyId, now);
      if (input.expectedRevision !== undefined && input.expectedRevision !== memory.revision) throw new AppError(409, "STALE_REVIEW", "This schedule changed on another device. Refresh your session");
      if (memory.card.last_review && now < memory.card.last_review) throw new AppError(409, "CLOCK_CHANGED", "Server review time changed. Please retry later");
      const scheduled = scheduleCard(memory.card, input.rating, now);
      const interval = Math.max(1, Math.ceil((scheduled.card.due.getTime() - now.getTime()) / 1000));
      const updated = await db.query<{ dueAt: Date; reviewedAt: Date; reviewCount: number }>(`INSERT INTO learning.vocabulary_progress
        (user_id,vocabulary_id,review_count,lapses,last_rating,last_reviewed_at,due_at,interval_seconds,fsrs_card,revision,scheduler_version)
        VALUES($1,$2,1,$3,$4,$5,$6,$7,$8,1,$9)
        ON CONFLICT(user_id,vocabulary_id) DO UPDATE SET review_count=learning.vocabulary_progress.review_count+1,
        lapses=learning.vocabulary_progress.lapses+EXCLUDED.lapses,last_rating=EXCLUDED.last_rating,
        last_reviewed_at=EXCLUDED.last_reviewed_at,due_at=EXCLUDED.due_at,interval_seconds=EXCLUDED.interval_seconds,
        fsrs_card=EXCLUDED.fsrs_card,revision=learning.vocabulary_progress.revision+1,scheduler_version=EXCLUDED.scheduler_version
        RETURNING due_at AS "dueAt",last_reviewed_at AS "reviewedAt",review_count AS "reviewCount"`,
      [user, input.vocabularyId, input.rating === "again" ? 1 : 0, input.rating, now, scheduled.card.due, interval, JSON.stringify(serializeCard(scheduled.card)), SCHEDULER_VERSION]);
      await db.query(`UPDATE learning.session_items SET reviewed_at=$3,available_at=$4,expected_revision=$5,review_events=review_events+1,skipped=false
        WHERE session_id=$1 AND vocabulary_id=$2`, [session.id, input.vocabularyId, session.kind === "daily" && isLearning(scheduled.card.state) ? null : now, scheduled.card.due, memory.revision + 1]);
      await db.query(`UPDATE learning.review_sessions SET completed_at=$3 WHERE id=$1 AND user_id=$2 AND
        NOT EXISTS(SELECT 1 FROM learning.session_items WHERE session_id=$1 AND reviewed_at IS NULL)`, [session.id, user, now]);
      const row = updated.rows[0]!;
      const result: AttemptResult = { attemptId: randomUUID(), dueAt: row.dueAt.toISOString(), reviewedAt: row.reviewedAt.toISOString(),
        reviewCount: row.reviewCount, schedulerVersion: SCHEDULER_VERSION, session: (await this.session(db, user, session.id, session.kind, now))! };
      await db.query(`INSERT INTO learning.review_attempts(id,user_id,client_attempt_id,session_id,vocabulary_id,rating,scheduler_version,result,
        expected_revision,memory_before,memory_after,scheduler_parameters,scheduler_log,reviewed_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [result.attemptId, user, input.clientAttemptId, session.id, input.vocabularyId,
        input.rating, SCHEDULER_VERSION, JSON.stringify(result), input.expectedRevision ?? null, JSON.stringify(serializeCard(memory.card)),
        JSON.stringify(serializeCard(scheduled.card)), JSON.stringify(SCHEDULER_PARAMETERS), JSON.stringify(serializeLog(scheduled.log)), now]);
      return result;
    });
  }

  async history(user: string, cursor?: string) {
    const { rows } = await this.pool.query(`SELECT a.id,a.rating,a.reviewed_at AS "reviewedAt",a.scheduler_version AS "schedulerVersion",
      v.id AS "vocabularyId",v.surah,v.ayah,v.word FROM learning.review_attempts a
      JOIN learning.vocabulary_items v ON v.id=a.vocabulary_id WHERE a.user_id=$1 AND
      ($2::uuid IS NULL OR (a.reviewed_at,a.id)<(SELECT reviewed_at,id FROM learning.review_attempts WHERE id=$2 AND user_id=$1))
      ORDER BY a.reviewed_at DESC,a.id DESC LIMIT 50`, [user, cursor ?? null]);
    return { items: rows, nextCursor: rows.length === 50 ? rows.at(-1)!.id : null };
  }

  async progress(user: string) {
    return this.transaction(user, async (db) => {
      const { rows } = await db.query(`SELECT p.vocabulary_id AS "vocabularyId",v.surah,v.ayah,v.word,
        p.review_count AS "reviewCount",p.lapses,p.last_rating AS "lastRating",p.last_reviewed_at AS "lastReviewedAt",
        p.due_at AS "dueAt",p.interval_seconds AS "intervalSeconds",p.scheduler_version AS "schedulerVersion",p.revision,
        p.fsrs_card->>'state' AS "memoryState",p.fsrs_card->>'stability' AS stability,p.fsrs_card->>'difficulty' AS difficulty
        FROM learning.vocabulary_progress p JOIN learning.vocabulary_items v ON v.id=p.vocabulary_id
        WHERE p.user_id=$1 ORDER BY v.surah,v.ayah,v.word LIMIT 100`, [user]);
      const { rows: totals } = await db.query(`SELECT
        (SELECT count(*)::int FROM learning.review_attempts WHERE user_id=$1) AS "totalReviews",
        (SELECT count(*)::int FROM learning.vocabulary_progress WHERE user_id=$1) AS "reviewedWords",
        (SELECT count(*)::int FROM learning.vocabulary_progress WHERE user_id=$1 AND due_at<=$2) AS "dueWords",
        (SELECT count(*)::int FROM learning.bookmarks WHERE user_id=$1) AS "bookmarkedWords"`, [user, this.clock()]);
      return { items: rows, ...totals[0] };
    });
  }
}
