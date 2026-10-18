# Adaptive reviews and daily inbox

Implemented 2026-10-17. Open **Reviews** (`/reviews`), sign in, and choose
**Review due words**. To introduce new vocabulary, bookmark an occurrence while
reading Al-Fatihah and choose **Learn saved words**. Existing optional reading
practice remains available and also updates the same per-occurrence schedule.
The legacy general-Arabic prototype is separate and has not been adopted.

## Scheduler choice

The backend uses **FSRS-6**, through the pinned MIT-licensed **ts-fsrs 5.4.2**
package. Its maintained TypeScript implementation provides the four required
ratings, difficulty/stability state, and learning/relearning transitions. This
fits the requested adaptive review experience better than extending the previous
fixed multipliers or adding a second custom SM-2 implementation. See the
[official library](https://github.com/open-spaced-repetition/ts-fsrs) and
[FSRS algorithm project](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler).

Policy `fsrs6-ts5.4.2-kalima1` uses default FSRS weights, requested retention
**0.9**, maximum interval **3,650 days**, short-term learning enabled, learning
steps **1m / 10m**, and relearning **10m**. Fuzz is off for reproducibility;
future load-balancing can be a separately versioned policy. The parameters,
model state before/after, FSRS log, rating, due instant and server review time
are recorded for every new event. FSRS adapts individual cards from ratings and
elapsed time; parameters are **not trained per learner** in this milestone.
Retention is a model target, not a guaranteed outcome or mastery measurement.

Again means the contextual meaning was forgotten; Hard means remembered with
effort; Good means remembered correctly; Easy means remembered instantly.
All four map directly to the library's corresponding grade. Current next-review
previews appear after revealing the answer. Hard is not treated as a failed recall.
The library controls resulting intervals and learning/relearning transitions.

## Daily workflow

- The inbox separates **due now**, overdue, **later today**, reviewed-today words
  and new bookmarks. Future-day cards are not pulled forward.
- Due sessions review only scheduled, due cards. Learning saved words also admits
  unreviewed bookmarks; it does not introduce every word in the corpus automatically.
- Learning/relearning cards remain in the session until they graduate. They become
  available at their actual due instant, not immediately after pressing Again.
  A waiting screen shows the next return time; leaving/reloading loses no queue.
- Daily and one-pass reading-practice sessions coexist. Cross-session changes
  reconcile queue revisions; stale clients must refresh before grading.
- A missing contextual meaning excludes a card from a new queue and leaves it in
  the inbox. If source content disappears in an active queue, **Leave due and move
  on** skips it for that session without a rating or schedule change. "Handled"
  session progress includes skips; reviewed-today counts include real events only.
- Arabic, contextual meanings, transliteration, ayah context, attribution and audio
  come from the existing live Quran provider. No Quran content or recordings are
  copied into learning storage. Audio appears only when the source supplies an
  acceptable HTTPS URL. Source outages never manufacture answers or erase progress.

## Time and data integrity

The profile has a saved **IANA timezone**, initially **UTC**. Choose it explicitly
in the inbox or use the device-timezone shortcut; changing devices/travelling does
not silently change the saved zone. All persisted due/review timestamps are UTC
instants. The server owns review time. PostgreSQL's timezone conversion determines
local midnight and next midnight using a half-open `[start,end)` civil day, including
23-/25-hour DST days. A timezone change regroups the inbox without rewriting dues.
FSRS day intervals remain elapsed-time schedules rather than arbitrary local
midnight snaps. Browser countdowns use server time plus a monotonic timer; the
device wall clock cannot authorize early reviews. Queries refresh every 15 seconds
and when the tab regains focus. There is no cron, email reminder or background sync
requirement for a due card to become visible.

Private endpoints still verify Supabase signatures/issuer/audience/expiry/role.
Learner identity never comes from request bodies. Daily attempts require a current
schedule revision and a UUID idempotency key. A per-learner transaction lock commits
memory state, due date, counters, queue position and immutable review event together.
Identical retries return the original result; conflicting ID reuse and stale or
not-yet-due cards return 409. Multiple devices cannot double-grade one revision.
The UI retains an unconfirmed submission's UUID for retries. Refreshing a failed
submission reconciles with the committed server session before another answer.

## Safe schema evolution

`0001_learning.sql` is unchanged. **0002_adaptive_reviews.sql** adds profile timezone,
FSRS memory/revision, event snapshots/parameters, session kind and queue availability,
review-count and skip fields. The per-session/per-word event uniqueness constraint
is replaced by revision enforcement so a relearning word can produce multiple real
events in one session; `(user_id,client_attempt_id)` stays unique. Active-session
uniqueness now includes session kind. No learner rows are deleted.

The learning migrator handles contiguous checksum-verified versions 1 and 2 within
one transaction/advisory lock. It still refuses original/remote/production targets,
URL query overrides, untracked tables, mismatched checksums and unknown history.
It never loads the historical Drizzle migration chain or draft corpus baseline.
Run `npm --prefix server run learning:migrate` on an already prepared isolated store;
repeated execution is a no-op. New isolated stores can use `learning:db` as before.

Starter-era history, JSON retry results and due dates remain unchanged. FSRS state
is bootstrapped lazily from actual ordered rating/time events at the next review,
preserving the existing due instant until then. No ratings or stability values are
invented during migration. Incomplete historical counts fail safely rather than
silently resetting memory. Old unfinished practice sessions remain resumable.

Migration 2 was first tested against disposable databases, including a seeded
version-1 upgrade. It was then applied to **kalima_learning_dev:55439**. Hashes of
all pre-existing columns/rows matched before and after: one learner, one bookmark,
one review/progress record, and the existing 29-item unfinished practice session
were preserved. Original `kalima` was not queried or modified. No deployment.

## API additions

All paths below `/api/learning` are authenticated and `no-store`:

| Method/path | Behavior |
| --- | --- |
| GET `/reviews/inbox` | Server-clock counts, civil-day bounds, timezone, reference-only items and daily session |
| GET `/review-sessions/current` | Resume/reconcile daily session |
| POST `/review-sessions` | Start/resume `{includeNew?: boolean}` |
| GET `/review-sessions/preview?sessionId=…&vocabularyId=…` | Four due-time/state previews and current revision |
| POST `/review-sessions/skip` | `{sessionId,vocabularyId,expectedRevision}`; leave schedule unchanged |
| POST `/attempts` | Existing payload plus `expectedRevision`, required for daily sessions |
| PATCH `/profile` | Optional validated `timezone` and/or existing nullable `displayName` |

## Validation and remaining work

- Backend **67 tests**: FSRS grading, graduation/lapse/overdue behavior, deterministic
  previews and serialization, history replay, day boundaries/DST, timezone updates,
  isolation, duplicates/conflicts, concurrent devices, early review rejection,
  unavailable source data, transaction rollback, and preserved v1-to-v2 activity.
- Frontend unit **19 tests**; learning browser **10 tests**, public-reading browser
  **10 tests** across desktop/mobile; TypeScript, builds and lint pass. The build's
  existing bundle-size warning is non-blocking.
- Browser tests use explicit synthetic content and signed test identities with
  real disposable PostgreSQL persistence. A test-host-only clock advances learning
  waits; production routes expose no clock or identity override. Synthetic
  databases are discarded; the real development learner's activity is retained.
- Previous genuine QF/Supabase acceptance remains recorded in
  [PERSISTENT_LEARNING.md](PERSISTENT_LEARNING.md). No new hosted OTP acceptance or
  full live QF/audio sweep was claimed for this scheduler milestone.

### Real-account daily acceptance

For the primary Google flow, use the [Google authentication guide](GOOGLE_AUTH.md)
and `npm run auth:google:accept -- --confirm-development`. It reuses the daily
review checks with genuine JWTs and independently user-controlled Google sign-ins,
without depending on SMTP. The email-specific command and historical delivery
failure below remain relevant only to the optional OTP fallback.

With the existing isolated cluster already running, close other development
processes on port 5173 and run from the repository root:

```powershell
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run reviews:accept -- --confirm-development
```

This reuses the hosted acceptance command's development/project/store gates,
normal Supabase verification, real Quran Foundation prelive provider, and server
wall clock. It runs no migrations and explicitly forbids original-database access.
Enter email codes privately in the visible browser. When a review appears, recall
the word, reveal the answer and choose an **honest** rating yourself; the command
does not supply a rating to make a test pass. Only real learning events are saved.

The command checks the source-backed bookmark; actual submitted rating, FSRS
state/log/parameters and due instant in PostgreSQL; API history; concurrent exact
retries, stale revisions and conflicting IDs; early due rejection; reload;
sign-out; and independent recovery in a clean browser context using a second
email-code sign-in to the **same** account. It observes a natural due transition
if the next learning step is within 11 minutes, otherwise reports that check as
unperformed without moving the clock. Existing review events are compared for
preservation. Public Quran reading is checked before login and after sign-out.
No screenshots, traces, storage snapshots, credentials, JWTs or Quran responses
are written to files. Result output contains outcomes and ratings only.

The default run needs **two** email deliveries. `--two-users` adds a third delivery
and requires an already approved different development account plus sufficient
SMTP quota. Do not use it to bypass Supabase's delivery restrictions. It compares
both accounts' API results with their own stored bookmarks/history/progress after
a real learner-selected review for each, and rejects attempts in both directions
to preview, grade or skip the other account's session or use its history cursor. A
skipped second-user check stays explicitly pending. Separate browser contexts are
not a physical second-device test. Failed or interrupted runs retain legitimate
development activity; never reset a due date or delete history to rerun acceptance.

Latest live attempt, **2026-10-17**: hosted configuration/discovery and public
authentic reading passed, but the learner reported email-code delivery failure.
The project owner identified **SMTP/sending HTTP 500** in Auth logs and confirmed
custom SMTP is enabled; those administrative logs were not independently accessed
by the acceptance command. The owner subsequently identified **Resend** and the
failure category **sender or recipient not verified/authorized**. The exact sender
domain, recipient restriction and provider configuration were not inspected.
No successful hosted sign-in or new daily review is claimed for this attempt.
A read-only isolated-store check still showed the pre-existing one learner,
one bookmark and one historical review, zero FSRS events and zero daily sessions,
with schema version 2. No migrations or new learning records were created.
The approved second real account is available, but its live isolation check is
blocked behind primary email delivery. Do not resend repeatedly or disable
confirmation/authentication checks to get past this blocker.

The app now classifies SDK code-less 5xx/429 and network failures without echoing
raw provider messages. Future acceptance runs print only a reviewed error-code
allowlist and numeric HTTP status, never provider messages/headers/identities.
Post-fix validation: **20 frontend unit tests**, **9 auth/preflight tests**, and
**2 focused desktop/mobile delivery-error browser tests** passed; TypeScript and
lint passed. The browser cases are synthetic and send no real emails. Earlier
focused scheduling/auth regressions passed **17 tests**. Follow the provider's
SMTP configuration and [Supabase delivery troubleshooting](https://supabase.com/docs/guides/troubleshooting/not-receiving-auth-emails-from-the-supabase-project-OFSNzw)
before resuming the opt-in live command. Earlier genuine authentication acceptance
remains historical evidence, not proof that this new attempt passed.

For this reported Resend authorization blocker, inspect **Resend Domains** and
the development Supabase project's **Authentication > Email > SMTP Settings**:

- If the sender is `onboarding@resend.dev`, Resend's test-domain restriction
  permits delivery only to the address associated with the Resend account. It
  does not authorize a second learner merely because Kalima approves that account.
  See [Resend's testing-domain restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
- To deliver to both real test learners, use an already verified, authorized
  sending domain in the correct Resend team. Supabase's Sender email must use
  that **exact** verified domain/subdomain; a verified subdomain does not authorize
  its parent as the sender. See [domain mismatch guidance](https://resend.com/docs/knowledge-base/403-error-domain-mismatch).
- The official [Supabase SMTP setup](https://resend.com/docs/send-with-supabase-smtp)
  uses host `smtp.resend.com`, port `465`, username `resend`, and the appropriate
  Resend API key as the password, entered privately in Supabase. Confirm that the
  key can send from the selected domain/team. Do not copy it into `VITE_*`, logs,
  chat or documentation. SMTP-only corrections require no Kalima env/key changes.
- If no sending domain is verified, adding one needs authorized DNS verification.
  Prefer an approved development subdomain, follow Resend's displayed records,
  and do not remove/overwrite existing production MX/SPF records or buy resources
  without approval. Do not use a simulated Resend delivery address as a real
  learner or claim it proves hosted login.
- After correction and checking quota, request **one** code manually in Kalima
  for the primary real learner. Resume independent re-login and the second-user
  flow only after real delivery succeeds. No automatic email retries are used.

### Proposed next slice: a small, auditable reward ledger

Implement this only after real-account acceptance. Rewards must be derived in the
same transaction from the committed review's **before** state, not client claims
or the rating label. An immutable ledger links each grant to its unique event and
eligibility cycle; exact retries, rejected stale writes, skips, bookmark toggles
and extra practice earn nothing. Suggested initial policy:

- **5 XP once per occurrence** for introducing a new card; deleting/re-saving a
  bookmark never resets eligibility. Cap rewarded new introductions at 10/day.
- **10 XP for a genuinely due mature review**, regardless of honest Again/Hard/
  Good/Easy. Learning/relearning repetitions are part of the same cycle, not new
  rewards; require at least 24 hours between mature-review rewards for a card.
- Cap total earned XP at **200 per server UTC day** without limiting reviews.
  Persist policy version and eligibility evidence; timezone changes cannot reset
  a reward cap. Do not award XP for simply choosing Easy or graduating a card.
- A streak needs one eligible review/introduction per study day, not an open tab
  or skip. Use one fixed streak timezone established at enrollment; changing the
  inbox timezone must not change streak days. Any later streak-timezone change
  needs an explicit non-retroactive policy before implementation.
- Grant achievements once for unique introduced occurrences, distinct eligible
  review days and due-review milestones. Do not label self-ratings as Quranic
  mastery or tie rewards to claimed retention.

Before UI badges, test concurrent grant attempts, duplicate requests, repeated
learning steps, re-bookmarking, timezone/DST boundaries, daily caps and replay of
the same event. Rewards should encourage returning, not discourage honest lapses.

Real-account daily review and **two-different-real-Google-user isolation passed
on 2026-10-18**; see [hosted evidence](GOOGLE_AUTH.md). Before gamification, observe real review
history and calibrate parameters before claiming personalized retention; define
reward rules for extra practice, skips and repeated learning events. This milestone
awards no XP, streaks or mastery. Reminders, offline review, parameter training,
more surahs, due-list pagination beyond the current 29-word scope, and production
privacy/export/deletion/backup/security work remain separate milestones.
