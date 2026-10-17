-- Additive evolution of the isolated learning lineage. No learner rows removed.
ALTER TABLE learning.profiles ADD COLUMN timezone text NOT NULL DEFAULT 'UTC';
ALTER TABLE learning.vocabulary_progress
  ADD COLUMN fsrs_card jsonb CHECK (fsrs_card IS NULL OR jsonb_typeof(fsrs_card)='object'),
  ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0);
ALTER TABLE learning.review_attempts
  ADD COLUMN expected_revision integer,
  ADD COLUMN memory_before jsonb,
  ADD COLUMN memory_after jsonb,
  ADD COLUMN scheduler_parameters jsonb,
  ADD COLUMN scheduler_log jsonb;
-- Daily learning/relearning can review a word more than once in one session.
-- Idempotency stays UNIQUE(user_id,client_attempt_id), with revision checks.
ALTER TABLE learning.review_attempts DROP CONSTRAINT review_attempts_session_id_vocabulary_id_key;
ALTER TABLE learning.review_sessions ADD COLUMN kind text NOT NULL DEFAULT 'practice' CHECK (kind IN ('practice','daily'));
DROP INDEX learning.one_active_session;
CREATE UNIQUE INDEX one_active_session ON learning.review_sessions(user_id,surah,kind) WHERE completed_at IS NULL;
ALTER TABLE learning.session_items
  ADD COLUMN available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN expected_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN review_events integer NOT NULL DEFAULT 0 CHECK (review_events >= 0),
  ADD COLUMN skipped boolean NOT NULL DEFAULT false;
