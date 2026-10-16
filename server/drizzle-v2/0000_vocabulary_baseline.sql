-- Prepared for isolated testing only; not executed during file preparation.
-- Run through the explicitly configured v2 migrator, which supplies a transaction.
-- Existing vocabulary data and the legacy ledger must never be rewritten here.

SET LOCAL search_path = pg_catalog;
--> statement-breakpoint
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint

DO $kalima_v2$
DECLARE
    vocabulary_oid oid := to_regclass('public.vocabulary');
    legacy_oid oid := to_regclass('drizzle.__drizzle_migrations');

    legacy_history jsonb;
    actual_columns jsonb;
    primary_index_oid oid;
BEGIN
    IF to_regnamespace('public') IS NULL THEN
        RAISE EXCEPTION 'Expected public schema is missing';
    END IF;

    -- Recognize a fresh installation or the verified legacy installation.
    IF (vocabulary_oid IS NULL) <> (legacy_oid IS NULL) THEN
        RAISE EXCEPTION
            'Unexpected installation: vocabulary and legacy ledger must both exist or both be absent';
    END IF;

    -- The approved public schema contains only vocabulary.
    -- Indexes and the table's automatic row type are checked separately.
    IF EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p', 'f', 'v', 'm', 'S')
          AND c.oid IS DISTINCT FROM vocabulary_oid
    ) THEN
        RAISE EXCEPTION 'Unexpected relation in public schema';
    END IF;

    IF legacy_oid IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM pg_class
            WHERE oid IN (vocabulary_oid, legacy_oid)
              AND relkind <> 'r'
        ) THEN
            RAISE EXCEPTION
                'Vocabulary and legacy ledger must be ordinary tables';
        END IF;

        -- Briefly prevent concurrent writes and structural changes.
        LOCK TABLE public.vocabulary,
                   drizzle.__drizzle_migrations
        IN SHARE MODE;

        IF to_regclass('public.vocabulary')::oid
               IS DISTINCT FROM vocabulary_oid
           OR to_regclass('drizzle.__drizzle_migrations')::oid
               IS DISTINCT FROM legacy_oid
        THEN
            RAISE EXCEPTION 'Database objects changed during validation';
        END IF;

        -- Read the original ledger; never update or recreate its records.
        SELECT jsonb_agg(
            jsonb_build_array(m.hash, m.created_at)
            ORDER BY m.created_at, m.hash
        )
        INTO legacy_history
        FROM drizzle.__drizzle_migrations m;

        IF legacy_history IS DISTINCT FROM $history$[
            [
                "a75b82bf26c76fab144eb50271f0d9334a0ffcde06f71fc13cc260d781dbe727",
                1791373243332
            ],
            [
                "69a013a6a33abedbb22cf3f544b39739ff8142590644f89775f3238d79c3136a",
                1791373812790
            ],
            [
                "a02213178ab681b4d6fdb40d9a8acd68542b2995dcddd017f6b5b34d7f19983b",
                1791718399884
            ]
        ]$history$::jsonb THEN
            RAISE EXCEPTION
                'Legacy migration history does not match the approved history';
        END IF;
    ELSE
        CREATE TABLE public.vocabulary (
            id uuid PRIMARY KEY NOT NULL,
            english text NOT NULL,
            arabic text NOT NULL,
            transliteration text NOT NULL,
            category text NOT NULL,
            level text NOT NULL,
            created_at timestamp with time zone DEFAULT now() NOT NULL,
            updated_at timestamp with time zone DEFAULT now() NOT NULL
        );

        vocabulary_oid := 'public.vocabulary'::regclass;
    END IF;

    -- Require the ordinary, permanent table currently defined by Kalima.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        WHERE c.oid = vocabulary_oid
          AND c.relkind = 'r'
          AND c.relpersistence = 'p'
          AND NOT c.relispartition
          AND c.reloftype = 0
          AND NOT c.relrowsecurity
          AND NOT c.relforcerowsecurity
          AND c.relreplident = 'd'
          AND coalesce(cardinality(c.reloptions), 0) = 0
    ) OR EXISTS (
        SELECT 1
        FROM pg_inherits
        WHERE inhrelid = vocabulary_oid
           OR inhparent = vocabulary_oid
    ) THEN
        RAISE EXCEPTION 'Vocabulary table properties are incompatible';
    END IF;

    -- Compare column order, names, types, nullability, defaults,
    -- identity settings and generated-column settings.
    SELECT jsonb_agg(
        jsonb_build_array(
            a.attname,
            format_type(a.atttypid, a.atttypmod),
            a.attnotnull,
            pg_get_expr(d.adbin, d.adrelid),
            a.attidentity,
            a.attgenerated
        )
        ORDER BY a.attnum
    )
    INTO actual_columns
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d
        ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = vocabulary_oid
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF actual_columns IS DISTINCT FROM $columns$[
        ["id",              "uuid",                     true, null,    "", ""],
        ["english",         "text",                     true, null,    "", ""],
        ["arabic",          "text",                     true, null,    "", ""],
        ["transliteration", "text",                     true, null,    "", ""],
        ["category",        "text",                     true, null,    "", ""],
        ["level",           "text",                     true, null,    "", ""],
        ["created_at",      "timestamp with time zone", true, "now()", "", ""],
        ["updated_at",      "timestamp with time zone", true, "now()", "", ""]
    ]$columns$::jsonb THEN
        RAISE EXCEPTION 'Vocabulary columns do not match the baseline';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_attribute a
        WHERE a.attrelid = vocabulary_oid
          AND a.attnum > 0
          AND a.attisdropped
    ) OR EXISTS (
        SELECT 1
        FROM pg_attribute a
        JOIN pg_type t ON t.oid = a.atttypid
        WHERE a.attrelid = vocabulary_oid
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND a.attcollation <> t.typcollation
    ) THEN
        RAISE EXCEPTION
            'Unexpected dropped columns or column collations';
    END IF;

    -- PostgreSQL 18 also records NOT NULL constraints as type n.
    IF (
        SELECT count(*)
        FROM pg_constraint
        WHERE conrelid = vocabulary_oid AND contype = 'p'
    ) <> 1 OR EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = vocabulary_oid
          AND (
              contype NOT IN ('p', 'n')
              OR NOT convalidated
          )
    ) OR EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE confrelid = vocabulary_oid AND contype = 'f'
    ) THEN
        RAISE EXCEPTION 'Unexpected vocabulary constraints';
    END IF;

    SELECT indexrelid
    INTO primary_index_oid
    FROM pg_index
    WHERE indrelid = vocabulary_oid
      AND indisprimary
      AND indisunique
      AND indisvalid
      AND indisready
      AND indislive;

    IF (
        SELECT count(*)
        FROM pg_index
        WHERE indrelid = vocabulary_oid
    ) <> 1
       OR primary_index_oid IS NULL
       OR pg_get_indexdef(primary_index_oid) IS DISTINCT FROM
          'CREATE UNIQUE INDEX vocabulary_pkey ON public.vocabulary USING btree (id)'
    THEN
        RAISE EXCEPTION 'Vocabulary indexes do not match the baseline';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = vocabulary_oid
          AND contype = 'p'
          AND conname = 'vocabulary_pkey'
          AND conkey = ARRAY[1]::smallint[]
          AND conindid = primary_index_oid
          AND convalidated
          AND NOT condeferrable
          AND NOT condeferred
    ) THEN
        RAISE EXCEPTION 'Vocabulary primary key is incompatible';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = vocabulary_oid AND NOT tgisinternal
    ) OR EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = vocabulary_oid
    ) OR EXISTS (
        SELECT 1 FROM pg_rewrite
        WHERE ev_class = vocabulary_oid
    ) THEN
        RAISE EXCEPTION 'Unexpected vocabulary triggers, policies or rules';
    END IF;
END;
$kalima_v2$;
