import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { LearnerIdentity } from "../auth/auth.js";
import { AppError } from "../../utils/app-error.js";
import { nextInterval, type AttemptInput, type AttemptResult, type LearningItem, type LearningSession, type ReferenceInput } from "./learning.schemas.js";

type Sql = Pick<Pool, "query"> | PoolClient;
export class LearningRepository {
  constructor(private readonly pool: Pool) {}

  async profile(identity: LearnerIdentity) {
    const { rows } = await this.pool.query<{ id: string; displayName: string | null }>(
      `INSERT INTO learning.profiles(auth_issuer,auth_subject) VALUES($1,$2)
       ON CONFLICT(auth_issuer,auth_subject) DO UPDATE SET auth_subject=EXCLUDED.auth_subject
       RETURNING id,display_name AS "displayName"`, [identity.issuer, identity.subject]);
    return rows[0]!;
  }

  async updateProfile(user: string, displayName: string | null) {
    await this.pool.query("UPDATE learning.profiles SET display_name=$2 WHERE id=$1", [user, displayName]);
    return { displayName };
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

  private async session(db: Sql, user: string, id?: string): Promise<LearningSession | null> {
    const { rows } = await db.query<{ id: string; surah: number; completed: boolean }>(`SELECT id,surah,completed_at IS NOT NULL AS completed
      FROM learning.review_sessions WHERE user_id=$1 AND
      (($2::uuid IS NULL AND surah=1 AND completed_at IS NULL) OR id=$2) ORDER BY created_at DESC LIMIT 1`, [user, id ?? null]);
    const found = rows[0];
    if (!found) return null;
    const items = await db.query<LearningItem>(`SELECT v.id AS "vocabularyId",v.surah,v.ayah,v.word,i.reviewed_at IS NOT NULL AS reviewed
      FROM learning.session_items i JOIN learning.vocabulary_items v ON v.id=i.vocabulary_id
      WHERE i.session_id=$1 ORDER BY i.ordinal`, [found.id]);
    return { ...found, items: items.rows };
  }

  currentSession(user: string) { return this.session(this.pool, user); }

  async startSession(user: string, references: ReferenceInput[], dueOnly: boolean) {
    return this.transaction(user, async (db) => {
      const active = await this.session(db, user);
      if (active) return active;
      const ids: string[] = [];
      for (const ref of references) {
        const id = await this.reference(db, ref);
        const progress = await db.query("SELECT 1 FROM learning.vocabulary_progress WHERE user_id=$1 AND vocabulary_id=$2 AND due_at>now()", [user, id]);
        if (!dueOnly || progress.rowCount === 0) ids.push(id);
      }
      if (!ids.length) return null;
      const { rows } = await db.query<{ id: string }>("INSERT INTO learning.review_sessions(user_id,surah) VALUES($1,1) RETURNING id", [user]);
      for (const [ordinal, id] of ids.entries()) {
        await db.query("INSERT INTO learning.session_items(session_id,vocabulary_id,ordinal) VALUES($1,$2,$3)", [rows[0]!.id, id, ordinal]);
      }
      return (await this.session(db, user, rows[0]!.id))!;
    });
  }

  async attempt(user: string, input: AttemptInput): Promise<AttemptResult> {
    return this.transaction(user, async (db) => {
      const previous = await db.query<{ session_id: string; vocabulary_id: string; rating: string; result: AttemptResult }>(
        "SELECT session_id,vocabulary_id,rating,result FROM learning.review_attempts WHERE user_id=$1 AND client_attempt_id=$2", [user, input.clientAttemptId]);
      const saved = previous.rows[0];
      if (saved) {
        if (saved.session_id !== input.sessionId || saved.vocabulary_id !== input.vocabularyId || saved.rating !== input.rating) {
          throw new AppError(409, "ATTEMPT_ID_CONFLICT", "This attempt ID was already used for another submission");
        }
        return saved.result;
      }
      const session = await this.session(db, user, input.sessionId);
      if (!session) throw new AppError(404, "SESSION_NOT_FOUND", "Learning session not found");
      const current = session.items.find((item) => !item.reviewed);
      if (!current || current.vocabularyId !== input.vocabularyId) {
        throw new AppError(409, "STALE_REVIEW", "This word is no longer current. Refresh your session");
      }
      const { rows: progress } = await db.query<{ interval_seconds: number }>(
        "SELECT interval_seconds FROM learning.vocabulary_progress WHERE user_id=$1 AND vocabulary_id=$2", [user, input.vocabularyId]);
      const interval = nextInterval(input.rating, progress[0]?.interval_seconds ?? 0);
      const updated = await db.query<{ dueAt: Date; reviewedAt: Date; reviewCount: number }>(`INSERT INTO learning.vocabulary_progress
        (user_id,vocabulary_id,review_count,lapses,last_rating,last_reviewed_at,due_at,interval_seconds)
        VALUES($1,$2,1,$3,$4,now(),now()+$5*interval '1 second',$5)
        ON CONFLICT(user_id,vocabulary_id) DO UPDATE SET review_count=learning.vocabulary_progress.review_count+1,
        lapses=learning.vocabulary_progress.lapses+EXCLUDED.lapses,last_rating=EXCLUDED.last_rating,
        last_reviewed_at=now(),due_at=EXCLUDED.due_at,interval_seconds=EXCLUDED.interval_seconds,scheduler_version='starter-v1'
        RETURNING due_at AS "dueAt",last_reviewed_at AS "reviewedAt",review_count AS "reviewCount"`,
      [user, input.vocabularyId, input.rating === "again" ? 1 : 0, input.rating, interval]);
      await db.query("UPDATE learning.session_items SET reviewed_at=now() WHERE session_id=$1 AND vocabulary_id=$2", [session.id, input.vocabularyId]);
      await db.query(`UPDATE learning.review_sessions SET completed_at=now() WHERE id=$1 AND user_id=$2 AND
        NOT EXISTS(SELECT 1 FROM learning.session_items WHERE session_id=$1 AND reviewed_at IS NULL)`, [session.id, user]);
      const row = updated.rows[0]!;
      const result: AttemptResult = { attemptId: randomUUID(), dueAt: row.dueAt.toISOString(), reviewedAt: row.reviewedAt.toISOString(),
        reviewCount: row.reviewCount, schedulerVersion: "starter-v1", session: (await this.session(db, user, session.id))! };
      await db.query(`INSERT INTO learning.review_attempts(id,user_id,client_attempt_id,session_id,vocabulary_id,rating,scheduler_version,result)
        VALUES($1,$2,$3,$4,$5,$6,'starter-v1',$7)`, [result.attemptId, user, input.clientAttemptId, session.id, input.vocabularyId, input.rating, JSON.stringify(result)]);
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
    const { rows } = await this.pool.query(`SELECT p.vocabulary_id AS "vocabularyId",v.surah,v.ayah,v.word,
      p.review_count AS "reviewCount",p.lapses,p.last_rating AS "lastRating",p.last_reviewed_at AS "lastReviewedAt",
      p.due_at AS "dueAt",p.interval_seconds AS "intervalSeconds",p.scheduler_version AS "schedulerVersion"
      FROM learning.vocabulary_progress p JOIN learning.vocabulary_items v ON v.id=p.vocabulary_id
      WHERE p.user_id=$1 ORDER BY v.surah,v.ayah,v.word LIMIT 100`, [user]);
    const { rows: totals } = await this.pool.query(`SELECT
      (SELECT count(*)::int FROM learning.review_attempts WHERE user_id=$1) AS "totalReviews",
      (SELECT count(*)::int FROM learning.vocabulary_progress WHERE user_id=$1) AS "reviewedWords",
      (SELECT count(*)::int FROM learning.vocabulary_progress WHERE user_id=$1 AND due_at<=now()) AS "dueWords",
      (SELECT count(*)::int FROM learning.bookmarks WHERE user_id=$1) AS "bookmarkedWords"`, [user]);
    return { items: rows, ...totals[0] };
  }
}
