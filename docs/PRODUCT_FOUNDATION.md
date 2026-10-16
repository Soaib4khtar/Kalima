# Kalima product foundation

Status: initial repository audit and first safe implementation increment  
Research checked: 16 October 2026

## Executive decision

Kalima should evolve as a TypeScript modular monolith: React/Vite in the browser,
an Express REST API, PostgreSQL, and Drizzle. The current stack is suitable; the
data model and product boundaries are not. The existing application is a polished
general-Arabic flashcard prototype backed by one flat `vocabulary` table. It has
no trusted Quranic corpus, provenance, verse context, authentication, durable
learning history, spaced repetition, or safe production write boundary.

The first product slice should be a read-only, source-pinned Al-Fatiha journey:
discover an exact word occurrence, see it highlighted in its ayah, inspect its
contextual meaning and verified linguistic annotations, then recall it in a
short lesson. Audio should enter that slice only after one recording and its
coverage/rights have been audited.

Do not adopt or execute the historical migration chain. Because the existing 20
generic words are disposable and the frozen v2 baseline only preserves that
obsolete model, the recommended production path is a clean migration lineage in
a new isolated database. Preserve the original database, backups, and frozen v2
artifacts until the new baseline has been generated, tested, restored, and a
cutover is explicitly approved.

## 1. Current assessment

### Keep

- React, Vite, TypeScript, React Router, TanStack Query, Tailwind, and the current
  feature-folder layout.
- Express 5 and PostgreSQL. A framework migration would add work without solving
  a current product problem.
- Drizzle for typed schema/query work, provided a new safe migration lineage is
  established.
- The existing responsive visual direction, dark mode, loading/error/empty
  states, skip link, RTL/language attributes, keyboard shortcuts, reduced-motion
  handling, and pure review reducer.

### Improve

- Split the backend by capability (`corpus`, `learning`, `progress`, `audio`,
  `ingestion`, `auth`) while keeping one deployable service.
- Replace all-at-once vocabulary reads with bounded pagination, filters, and
  server-created learning sessions.
- Add shared runtime-validated API contracts, cancellation, typed errors, and
  integration tests. The current API client can overwrite its composed headers
  because `options` is spread after `headers`.
- Add startup environment validation, a narrow CORS allowlist, request limits,
  structured/redacted logs, and authenticated authorization.
- Add route title/focus management, field-level accessible errors, larger small
  text/touch targets, a Quran-capable Arabic font, and UI/a11y tests.

### Replace

- The flat generic word record with exact word occurrences, lexemes, roots,
  source-scoped morphology, contextual meanings, verse translations, and source
  releases.
- The public “Add word” concept with “Save/bookmark trusted word.” Private learner
  notes must never be stored as canonical Quranic content.
- Browser-tab `sessionStorage` progress and self-declared “learned” state with
  authenticated, idempotent review attempts and an FSRS-based schedule.
- CRUD-shaped APIs with product APIs: verse exploration, contextual word detail,
  due review sessions, attempt submission, and progress summaries.

### Remove or quarantine

- Never run `server/drizzle/0001_chilly_smasher.sql`; it drops `vocabulary` with
  `CASCADE`. The default migrate command now refuses to run.
- Retain the byte-pinned v2 baseline and runner as historical safety work, but do
  not activate them unless preserving the original database becomes a deliberate
  requirement and its pending isolated runner test succeeds.
- Retire the arbitrary generic seed content, duplicate schema copies, empty word
  detail page, unused static vocabulary, starter assets, and unused UI components
  during bounded follow-up work—not by an uncontrolled cleanup.

### Critical exposure blockers

The current POST/PATCH/DELETE vocabulary routes are unauthenticated, CORS is
unrestricted, reads are unpaginated, and there is no user-data isolation. The
service is suitable only for local development until those are addressed. It
must not be deployed publicly in its current form.

## 2. Recommended technology stack

| Layer | Decision | Reason |
| --- | --- | --- |
| Web | Keep React + Vite + TypeScript | Fast, maintainable, already working; no SSR requirement for the authenticated learning app. |
| UI | Keep Tailwind/current primitives; consolidate gradually | Preserve good existing work and avoid a design-system rewrite before the learning model exists. |
| API | Keep Express 5; organize as a modular monolith | Small operational surface, future-mobile friendly, and enough for the expected load. |
| Contracts | Zod at boundaries; publish OpenAPI later | Runtime safety for external datasets and clients without introducing a second type system. |
| Database | PostgreSQL + Drizzle | Strong relational constraints fit corpus coordinates, provenance, and user progress. |
| Search | PostgreSQL indexes first; FTS/trigram on derived search text later | Complete Quran scale does not justify a separate search service. Never search-normalize the canonical field in place. |
| Auth | Supabase Auth/OIDC-compatible JWT in milestone 4 | Good web/mobile path and low operational load. Keep authorization rules in the API/database so the provider can change. |
| Scheduling | FSRS after durable attempts exist | Proven adaptive scheduling; avoid pretending the current in-session queue is SRS. |
| Audio | Approved upstream/CDN references first | Avoid storing or redistributing recordings until source rights and coverage are verified. |
| Delivery | Responsive web, then PWA | Validate the learning loop before funding a native application. |

There is no MVP justification for NestJS, microservices, Kafka, Elasticsearch,
GraphQL, or a framework rewrite.

## 3. Proposed architecture

```text
React web / future mobile client
              |
         versioned REST API
              |
  Express modular monolith
  ├─ corpus + search
  ├─ learning sessions + FSRS
  ├─ progress + gamification
  ├─ audio metadata
  ├─ auth/authorization
  └─ ingestion/admin (not public)
              |
          PostgreSQL

Approved source artifacts
              |
 checksum → validate → reconcile → quarantine/plan → transaction → activate
```

Corpus data and learner data remain separate. Import adapters may fetch and
transform approved releases, but the core pipeline accepts only a versioned
package whose exact inputs, license snapshot, attribution, hashes, counts, and
coordinates validate. An importer must stage a release, reconcile counts and
numbering conventions, and activate it atomically; it must not silently edit the
currently active corpus.

## 4. Quranic data-source decision

Research used primary provider documentation. “Verified” below means the stated
access and terms were visible on 16 October 2026; it is not legal advice.

| Need | Preferred source | Decision and caveat |
| --- | --- | --- |
| Operational text, metadata, surface tokens, word translations | [Quran Foundation Content API](https://api-docs.quran.foundation/docs/content_apis_versioned/4.0.0/content-apis/) via [Content Sync](https://api-docs.quran.foundation/docs/tutorials/content-sync/getting-started/) | Preferred MVP source after production application approval. Durable local storage must use Content Sync, not ordinary API caching. Follow the [developer terms](https://api-docs.quran.foundation/legal/developer-terms/) and attribution guidance. |
| Canonical verification oracle | [King Fahd Complex developer resources](https://qurancomplex.gov.sa/en/techquran/dev/) | Use Hafs Uthmanic v13 to reconcile every ayah. The public page does not provide a sufficiently clear general redistribution license, so use as verification unless package terms or written permission say more. |
| Independent text comparison/fallback | [Tanzil text](https://tanzil.net/docs/download), [license](https://tanzil.net/docs/Text_License), [metadata](https://tanzil.net/docs/Quran_Metadata) | Technically strong and verified against the Medina Mushaf. Its no-change/attribution conditions and separate noncommercial language need commercial-use review. |
| Lemma and part of speech | [QuranMorph](https://sina.birzeit.edu/quran/) | 2025 manually reviewed layer, listed as CC BY 4.0. Reconcile its 6,235-verse convention before joining; do not infer roots it does not provide. |
| Roots and fine morphology | [Quranic Arabic Corpus](https://corpus.quran.com/download/) | Rich `(surah:ayah:word:segment)` data. Its page combines GPL wording with additional no-change conditions; keep it source-scoped and block production import pending rights review. |
| Verse translation | [QuranEnc](https://quranenc.com/en/home/api) or a named Quran Foundation edition | QuranEnc provides versioned downloads and reuse conditions requiring no modification, attribution, version retention, and updates. Select one named edition only after content and rights review. |
| Recitation, isolated word audio, timings | Quran Foundation [recitation endpoint](https://api-docs.quran.foundation/docs/content_apis_versioned/4.0.0/chapter-reciter-audio-file/) and [verse/word SDK](https://api-docs.quran.foundation/docs/sdk/javascript/verses/) | Preferred if the chosen reciter has audited full coverage. Timings are resource-specific and must be checked across all verses/lexical words. |
| Official playback fallback | [KFGQPC audio rights](https://qc-dev.qurancomplex.gov.sa/quran-audios/) and [downloads](https://qurancomplex.gov.sa/category/kfgqpc-quran-audio/recite/) | Explicitly permits broad application/site use. No structured word-timing API was found, so use for verse playback only unless separately aligned and validated. |

Important modeling rule: Quran Foundation's documented token rows include pause,
verse-end, sajdah, rub, and other display tokens. They are not all lexical words.
Kalima must preserve display tokens separately and assign learning coordinates
only to lexical occurrences. Likewise, a surface occurrence is not the same as
a QAC morphological segment.

Recommended acquisition sequence:

1. Obtain Quran Foundation production approval and select exact resource IDs.
2. Sync core/Mushaf, one word translation, one verse translation, and one
   recitation release; store required attribution.
3. Verify canonical ayahs against KFGQPC and compare with Tanzil. Quarantine any
   mismatch instead of choosing one silently.
4. Add QuranMorph and, only after rights review, QAC as independent annotation
   releases. They must never overwrite canonical text.
5. Audit audio URLs, rights, checksums, reciter identity, and word-index coverage
   before the UI claims word playback or synchronized highlighting.

## 5. Database design and integrity rules

The prepared draft in `server/src/db/corpus.schema.ts` is intentionally inactive
until migration strategy is approved. It models:

- Source datasets and immutable source releases, including upstream resource ID,
  version, retrieval/terms-check dates, license snapshot, attribution, and raw
  artifact SHA-256.
- Validated corpus packages and separate import attempts, allowing retry history
  without pretending a failed run completed.
- Surahs and ayahs with exact coordinates, source release, canonical UTF-8 text,
  and text digest.
- Lexical word occurrences distinct from display tokens.
- Source-scoped roots, lexemes, and morphological segments.
- Named translation editions, verse translations, and contextual word meanings.
- Named recitation releases, verse audio, and source-scoped word timings.

Critical rules:

- Ayah identity is `(surah_number, ayah_number)`.
- Lexical occurrence identity is `(surah_number, ayah_number,
  lexical_word_position)`.
- Morphological identity also includes annotation source release and segment
  position; conflicting analyses can coexist.
- Timing identity includes timing source, recitation release, and lexical
  occurrence.
- Canonical source strings are never Unicode-normalized in place. Derived search
  fields may be normalized and rebuilt.
- Foreign keys prevent orphan words, translations, morphology, and timings.
- Import completion and active-release switching must be transactional.
- A package cannot approve its own source claims. Production import requires an
  operator-controlled allowlist matching source release, role, digest, and terms.
- User-created notes/bookmarks can reference corpus records but cannot update
  them.

Learning tables in the next schema increment should include users/preferences,
bookmarks, lesson definitions/items, user-lexeme progress, FSRS card state,
idempotent review attempts (`user_id + client_attempt_id` unique), daily goals,
and awarded achievements. Store the scheduling decision with every attempt so
progress can be audited and replayed.

## 6. Learning experience

The core loop is:

1. **Discover:** a bounded daily lesson introduces a high-value word occurrence.
2. **Understand:** show exact Arabic, contextual meaning, lemma/root only when
   sourced, and visible attribution.
3. **Listen:** play an approved word clip or a clearly labeled verse recording.
4. **Recall:** prompt before revealing; do not award mastery for passive views.
5. **Practice in context:** highlight the occurrence in its authentic ayah and
   later show another verified occurrence of the lexeme.
6. **Review:** persist an idempotent attempt and schedule with FSRS.
7. **Master:** raise mastery only from repeated, spaced evidence; keep difficulty
   and uncertainty visible to the learner.

XP, streaks, levels, and achievements should derive from accepted learning
events, not raw clicks or repeated guesses. A wrong answer remains useful: it
updates scheduling and can trigger a short explanation/context step.

## 7. MVP definition

A useful first release includes:

- Authenticated learner accounts and isolated progress.
- A verified, attributed initial corpus slice with surah/ayah/lexical coordinates
  and one approved English verse/word translation.
- Verse browser and contextual word detail with Arabic highlighting.
- Search by Arabic/English plus browse by surah and ayah.
- Bookmarking and a bounded daily lesson.
- At least two recall interactions and persistent FSRS reviews.
- One audited recitation/word-audio path, or honest verse-only playback if word
  coverage is not proven.
- Basic progress, daily goal, and streak based on accepted attempts.
- Mobile/keyboard accessibility, error states, content attribution, API tests,
  ingestion integrity tests, and critical UI tests.

Not in the first MVP: automated pronunciation scoring, user-authored Quranic
content, social leaderboards, multiple courses/languages, native mobile apps,
offline full-corpus audio, or elaborate mini-games.

## 8. Roadmap

1. **Foundation (1–2 weeks):** choose clean migration lineage, validate it in a
   disposable database, add env/auth boundaries and CI, finalize source approvals.
2. **Trusted Al-Fatiha slice (3–5 weeks):** source adapter, reconciliation,
   import, corpus API, contextual UI, attribution, and tests.
3. **Core learning (3–4 weeks):** lesson API, recall interactions, approved audio,
   bookmarks, and accessible mobile polish.
4. **Persistent personalization (3–5 weeks):** auth, review attempts, FSRS, due
   sessions, progress, and authorization tests.
5. **Interactive MVP (3–4 weeks):** goals/streaks/XP, onboarding, dashboards,
   complete journey tests, observability, and security hardening.
6. **Corpus expansion (ongoing, 3–6+ weeks initially):** full-source ingestion,
   mismatch review, search/index tuning, more contexts and activities.
7. **Pronunciation pilot (later):** recording/replay first; scoring only after
   Arabic/phoneme evaluation proves it is trustworthy.

## 9. Effort and risks

For one experienced full-stack engineer working full time, a credible early-user
MVP is approximately 16–24 engineer-weeks. A source-pinned Al-Fatiha vertical
slice is approximately 4–7 weeks after access/rights decisions. Add time for
Arabic linguistic review, legal review, visual design, and production operations
if those are separate roles.

Largest schedule risks:

- API approval and dataset/audio redistribution terms.
- Token, basmala, ayah-count, and morphology-coordinate reconciliation.
- Finding one reciter with complete, accurate word alignment.
- Safe database cutover from the legacy migration history.
- Authentication/authorization and duplicate attempt handling.
- Arabic typography, RTL/a11y testing, and qualified content review.

## 10. Implementation increment completed

- Added `server/src/modules/corpus/corpus-package.ts`, a strict read-only package
  contract and semantic validator. It verifies provenance references, roles,
  exact UTF-8 canonical digests, counts, coordinates, contiguous ayah/word
  positions, complete-Quran scope claims, licensing state, and operator source
  allowlisting. Synthetic fixtures can never become production Quranic imports.
- Added `server/src/modules/corpus/validate-corpus-file.ts` and
  `npm run corpus:validate -- <file>` for DB-free preflight. It imports no env or
  database module and prints no corpus payload.
- Added the inactive typed schema described above without changing the byte-pinned
  `server/src/db/schema.ts`.
- Added eight corpus integrity tests using explicitly synthetic, non-Quranic
  Arabic test text.
- Replaced the dangerous default `db:migrate` command with an explicit refusal.
  No database connection is attempted.
- Restricted browser CORS to configured/local origins, bounded JSON bodies,
  removed database-identity startup logging, and added a credential-free env
  template. Authentication remains a public-deployment blocker.
- Fixed the frontend API header merge so caller options cannot discard composed
  headers and GET requests no longer claim to contain JSON bodies.

Validation results for this increment:

- Server TypeScript build: passed.
- Corpus integrity tests: 8/8 passed.
- Existing review reducer tests: 8/8 passed.
- Migration safety gate: intentionally exits non-zero with a warning; no database
  connection or mutation occurred.
- Existing frozen v2 file hashes still match their runner pins, and its separate
  TypeScript check passes. Its database behavior remains untested as documented.
- Frontend TypeScript and the full Vite production build pass.
- Repository lint passes after cleaning stale generated imports and unused UI
  variant exports. There are still no component, API integration, or end-to-end
  tests.

No database was connected to or changed. No external dataset was downloaded or
presented as imported. No site was deployed.

## Next safe increment

1. Obtain/confirm Quran Foundation application approval and exact resource IDs.
2. Freeze an operator-owned approved-source catalog with exact terms snapshots
   and checksums.
3. Generate a clean migration baseline from the corpus plus minimal learning
   schema in a separate lineage; validate create, rerun/refusal, backup, and
   restore against a clearly disposable database.
4. Implement a source adapter that produces the validated package and a dry-run
   reconciliation report for Al-Fatiha.
5. Only then add read-only corpus endpoints and the contextual learning UI.

Changing the original database, activating a replacement connection, or
deploying publicly remains an explicit approval point.
