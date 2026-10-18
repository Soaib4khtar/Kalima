-- Additive only. No canonical Quran text, existing activity rewrites or retroactive XP.
CREATE TABLE learning.game_accounts (
  user_id uuid PRIMARY KEY REFERENCES learning.profiles,
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  tokens integer NOT NULL DEFAULT 0 CHECK (tokens >= 0),
  timezone_changed_at timestamptz,
  initialized_at timestamptz
);
CREATE TABLE learning.game_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES learning.profiles,
  kind text NOT NULL CHECK (kind IN ('daily','weekly')),
  local_date date NOT NULL,
  timezone text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  policy_version text NOT NULL,
  UNIQUE (user_id,kind,local_date), UNIQUE (user_id,id)
);
CREATE INDEX game_period_lookup ON learning.game_periods(user_id,kind,ends_at DESC);
CREATE TABLE learning.game_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES learning.profiles,
  period_id uuid NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 0 AND 3),
  kind text NOT NULL CHECK (kind IN ('discovery','participation','due','recovery','challenge','days')),
  target smallint NOT NULL CHECK (target > 0),
  progress smallint NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= target),
  reward_xp smallint NOT NULL CHECK (reward_xp >= 0),
  reward_tokens smallint NOT NULL CHECK (reward_tokens >= 0),
  completed_at timestamptz,
  UNIQUE (period_id,slot), UNIQUE (user_id,id),
  FOREIGN KEY (user_id,period_id) REFERENCES learning.game_periods(user_id,id)
);
CREATE TABLE learning.game_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES learning.profiles,
  vocabulary_id uuid NOT NULL REFERENCES learning.vocabulary_items,
  kind text NOT NULL CHECK (kind IN ('review','challenge')),
  review_id uuid UNIQUE REFERENCES learning.review_attempts,
  occurred_at timestamptz NOT NULL,
  policy_version text NOT NULL,
  UNIQUE (user_id,id),
  CHECK ((kind='review' AND review_id=id) OR (kind='challenge' AND review_id IS NULL))
);
CREATE INDEX game_event_owner_time ON learning.game_events(user_id,occurred_at DESC);
CREATE TABLE learning.game_mission_steps (
  user_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  distinct_key text NOT NULL,
  source_event_id uuid NOT NULL,
  PRIMARY KEY (mission_id,distinct_key),
  FOREIGN KEY (user_id,mission_id) REFERENCES learning.game_missions(user_id,id),
  FOREIGN KEY (user_id,source_event_id) REFERENCES learning.game_events(user_id,id)
);
CREATE TABLE learning.reward_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES learning.profiles,
  source_key text NOT NULL,
  source_event_id uuid,
  xp_delta integer NOT NULL CHECK (xp_delta >= 0),
  token_delta integer NOT NULL,
  reward_day date NOT NULL,
  policy_version text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (user_id,source_key),
  FOREIGN KEY (user_id,source_event_id) REFERENCES learning.game_events(user_id,id)
);
CREATE INDEX reward_daily_cap ON learning.reward_ledger(user_id,reward_day);
CREATE FUNCTION learning.immutable_rewards() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Reward ledger is append-only'; END;
$$;
CREATE TRIGGER reward_no_rewrite BEFORE UPDATE OR DELETE ON learning.reward_ledger
FOR EACH ROW EXECUTE FUNCTION learning.immutable_rewards();
CREATE TABLE learning.game_plants (
  user_id uuid NOT NULL REFERENCES learning.profiles,
  vocabulary_id uuid NOT NULL REFERENCES learning.vocabulary_items,
  highest_stage smallint NOT NULL DEFAULT 1 CHECK (highest_stage BETWEEN 1 AND 5),
  policy_version text NOT NULL,
  PRIMARY KEY (user_id,vocabulary_id)
);
CREATE TABLE learning.kingdom_structures (
  user_id uuid NOT NULL REFERENCES learning.profiles,
  structure_key text NOT NULL CHECK (structure_key IN ('garden','library','bridge','academy','castle')),
  unlocked_at timestamptz NOT NULL,
  mastery_version text NOT NULL,
  PRIMARY KEY (user_id,structure_key)
);
CREATE TABLE learning.kingdom_cosmetics (
  user_id uuid NOT NULL REFERENCES learning.profiles,
  cosmetic_key text NOT NULL CHECK (cosmetic_key IN ('lanterns','fountain')),
  purchased_at timestamptz NOT NULL,
  PRIMARY KEY (user_id,cosmetic_key)
);
CREATE TABLE learning.knowledge_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES learning.profiles,
  vocabulary_id uuid NOT NULL REFERENCES learning.vocabulary_items,
  -- Coordinates, opaque choice IDs and a change-detection hash only; no provider text.
  choices jsonb NOT NULL CHECK (jsonb_typeof(choices)='array'),
  correct_choice uuid NOT NULL,
  content_hash text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > issued_at),
  submitted_choice uuid,
  completed_at timestamptz,
  result jsonb,
  UNIQUE (user_id,id)
);
CREATE INDEX challenge_rate ON learning.knowledge_challenges(user_id,issued_at DESC);
CREATE INDEX mastery_history ON learning.review_attempts(user_id,vocabulary_id,reviewed_at,id);
CREATE TABLE learning.game_api_windows (
  user_id uuid NOT NULL REFERENCES learning.profiles,
  action text NOT NULL,
  window_at timestamptz NOT NULL,
  requests integer NOT NULL CHECK (requests > 0),
  PRIMARY KEY (user_id,action,window_at)
);
CREATE TABLE learning.game_audit (
  user_id uuid NOT NULL REFERENCES learning.profiles,
  code text NOT NULL,
  window_at timestamptz NOT NULL,
  occurrences integer NOT NULL CHECK (occurrences > 0),
  PRIMARY KEY (user_id,code,window_at)
);
