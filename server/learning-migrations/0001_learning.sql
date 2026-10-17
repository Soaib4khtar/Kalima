CREATE SCHEMA IF NOT EXISTS learning;

CREATE TABLE learning.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_issuer text NOT NULL,
  auth_subject uuid NOT NULL,
  display_name varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_issuer, auth_subject)
);

-- Coordinates are canonical identities, not copies of provider text.
CREATE TABLE learning.word_occurrences (
  surah smallint NOT NULL CHECK (surah BETWEEN 1 AND 114),
  ayah smallint NOT NULL CHECK (ayah > 0),
  word smallint NOT NULL CHECK (word > 0),
  PRIMARY KEY (surah, ayah, word)
);
CREATE TABLE learning.occurrence_sources (
  surah smallint NOT NULL,
  ayah smallint NOT NULL,
  word smallint NOT NULL,
  provider text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('prelive', 'production')),
  external_word_id text NOT NULL,
  external_verse_id text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (surah, ayah, word, provider, environment),
  FOREIGN KEY (surah, ayah, word) REFERENCES learning.word_occurrences
);

-- No guessed lemma/lexeme identity: this milestone uses occurrence cards.
-- Future reusable lexeme cards require a source-scoped annotation identity.
CREATE TABLE learning.vocabulary_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_kind text NOT NULL CHECK (identity_kind IN ('occurrence', 'lexeme')),
  surah smallint,
  ayah smallint,
  word smallint,
  lexeme_provider text,
  lexeme_release text,
  lexeme_external_id text,
  CHECK (
    (identity_kind = 'occurrence' AND surah IS NOT NULL AND ayah IS NOT NULL AND word IS NOT NULL
      AND lexeme_provider IS NULL AND lexeme_release IS NULL AND lexeme_external_id IS NULL)
    OR (identity_kind = 'lexeme' AND surah IS NULL AND ayah IS NULL AND word IS NULL
      AND lexeme_provider IS NOT NULL AND lexeme_release IS NOT NULL AND lexeme_external_id IS NOT NULL)
  ),
  UNIQUE (surah, ayah, word),
  UNIQUE (lexeme_provider, lexeme_release, lexeme_external_id),
  FOREIGN KEY (surah, ayah, word) REFERENCES learning.word_occurrences
);
CREATE TABLE learning.bookmarks (
  user_id uuid NOT NULL REFERENCES learning.profiles ON DELETE CASCADE,
  vocabulary_id uuid NOT NULL REFERENCES learning.vocabulary_items,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, vocabulary_id)
);
CREATE TABLE learning.review_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES learning.profiles ON DELETE CASCADE,
  surah smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, id)
);
CREATE UNIQUE INDEX one_active_session ON learning.review_sessions(user_id, surah) WHERE completed_at IS NULL;
CREATE TABLE learning.session_items (
  session_id uuid NOT NULL REFERENCES learning.review_sessions ON DELETE CASCADE,
  vocabulary_id uuid NOT NULL REFERENCES learning.vocabulary_items,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  reviewed_at timestamptz,
  PRIMARY KEY (session_id, vocabulary_id),
  UNIQUE (session_id, ordinal)
);
CREATE TABLE learning.vocabulary_progress (
  user_id uuid NOT NULL REFERENCES learning.profiles ON DELETE CASCADE,
  vocabulary_id uuid NOT NULL REFERENCES learning.vocabulary_items,
  review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  lapses integer NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  last_rating text CHECK (last_rating IN ('again','hard','good','easy')),
  last_reviewed_at timestamptz,
  due_at timestamptz NOT NULL DEFAULT now(),
  interval_seconds integer NOT NULL DEFAULT 0 CHECK (interval_seconds >= 0),
  scheduler_version text NOT NULL DEFAULT 'starter-v1',
  PRIMARY KEY (user_id, vocabulary_id)
);
CREATE INDEX progress_due ON learning.vocabulary_progress(user_id, due_at);
CREATE TABLE learning.review_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES learning.profiles ON DELETE CASCADE,
  client_attempt_id uuid NOT NULL,
  session_id uuid NOT NULL,
  vocabulary_id uuid NOT NULL REFERENCES learning.vocabulary_items,
  rating text NOT NULL CHECK (rating IN ('again','hard','good','easy')),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  scheduler_version text NOT NULL,
  result jsonb NOT NULL,
  UNIQUE (user_id, client_attempt_id),
  UNIQUE (session_id, vocabulary_id),
  FOREIGN KEY (user_id, session_id) REFERENCES learning.review_sessions(user_id, id),
  FOREIGN KEY (session_id, vocabulary_id) REFERENCES learning.session_items(session_id, vocabulary_id)
);
CREATE INDEX review_history ON learning.review_attempts(user_id, reviewed_at DESC, id DESC);
