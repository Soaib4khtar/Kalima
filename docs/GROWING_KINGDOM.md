# The Growing Kingdom — development MVP

Implemented 2026-10-18 on the existing Supabase/FSRS learning system. This is
working application code, not seeded game progress. The original database,
Google configuration and Quran Foundation adapter are unchanged. Nothing was
deployed. The new game flows have **automated isolated acceptance and genuine
two-Google-account development acceptance**, not production security certification.

Real-account game acceptance passed on 2026-10-18; see [verified reward balances,
recovery, isolation, anti-cheat evidence and remaining limits](GROWING_KINGDOM_LIVE_ACCEPTANCE.md).

## Screens

- Signed-in `/`: learning overview, level, XP, due count, Today’s Quests, world
  preview, next milestone, weekly challenge and gentle Learning Momentum.
- `/quests`: three persisted personalized daily quests and a weekly challenge.
- `/garden`: 24 occurrence-based plants per page, growth filtering, source-backed
  RTL Arabic/details/audio, review links and server-graded knowledge checks.
- `/kingdom`: illustrated island, earned/unearned structures, free milestone
  unlocks and optional permanent lantern/fountain decorations.
- `/progress`: persistent XP, tokens, historical mastery, momentum, achievements
  and paginated append-only reward history.
- `/reviews` and signed-in Quran recall: compact reward feedback after commit.
  Neither loads the Garden renderer. Public Quran reading stays unauthenticated.
- `/practice`: the existing browser-local general-Arabic prototype. It is also
  still the anonymous homepage; its client-only actions earn no game rewards.

Supabase remains the authentication authority; the independent isolated learning
PostgreSQL database remains the activity/game store. Private queries share the
existing learner-keyed cache and are removed on account changes/sign-out.

## Authoritative flow

1. The existing endpoint verifies Supabase JWT/ownership and review revision.
2. The existing per-learner row lock serializes writes across devices.
3. FSRS updates the schedule and the original review event is inserted.
4. Within **that same transaction**, the game consumes this event, updates plant
   evidence, records distinct quest steps and automatically grants capped awards.
5. Ledger, wallet, quest progress and learning state commit together. The saved
   review result includes its actual XP/token deltas; retries return that result.
6. The client invalidates private queries. Graphics are presentation, not proof
   that any reward or unlock was authorized.

Provider-backed session creation and the world overview prepare quests. When an
interrupted session crosses midnight or a source outage delays issuance, committed
post-feature events inside the new period are reconciled once against currently
available coordinates. New periods never overlap the previous period, including
after travel, so the same activity cannot be replayed into a shifted day. **No
additional provider request is made when a rating is submitted.** An optional
illustration/UI failure does not block review APIs. A database/reward transaction
failure rolls everything back and the existing same-attempt retry can recover.

The implementation follows PostgreSQL [row-lock semantics](https://www.postgresql.org/docs/current/explicit-locking.html)
and [unique/check/foreign-key constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).
There is no additional scheduler, identity bypass, client event import or public
reward-claim/wallet-mutation endpoint.

## Economy (`growing-kingdom-v1`)

All amounts are integer configuration in `server/src/modules/game/game.policy.ts`.

| Source | Award and limits |
| --- | --- |
| First recorded recall of an occurrence | 5 XP once per learner/occurrence, including an honest Again |
| Daily scheduled Review-state card genuinely due before grading | 10 XP independent of rating; once per occurrence/UTC day and at least 24 hours between these awards |
| Correct source-backed knowledge check | 5 XP once per occurrence/UTC day |
| Daily quest completion | Up to 15 XP + 1 token, automatically once per quest |
| Weekly distinct-day goal | Up to 40 XP + 2 tokens, automatically once per week |
| Pathway lanterns / fountain | Spend 3 / 6 tokens once; no learning benefit |

Total newly earned rewards are capped at **200 XP and 6 tokens per server UTC
day**, regardless of quest timezone. Spending tokens does not replenish an earning
cap. A capped award still consumes its source identity; replay tomorrow cannot
mint it. Balances cannot go negative. Ledger UPDATE/DELETE is rejected by a
database trigger. Corrections require explicit compensating records, not edits.
There is no automatic correction/admin-credit endpoint.

Bookmark toggles, skips, opening a page, early practice, rapid learning/relearning
repeats and stale requests earn no new **base** XP. Honest supported practice may
advance a daily participation quest once per distinct word. Again/Hard/Good/Easy
give equal participation; Easy is not a currency multiplier. New source events
cannot replay an already consumed introduction/daily-word/quest award.

## Quest dates, availability and travel

Three daily tasks use only existing source-backed activities: discovery,
distinct-word practice, genuinely due review, difficult-word recovery and meaning
association checks. Targets are bounded by actual available words/due cards.
There are no due-review tasks when none are due. A new learner can begin in
Al-Fatihah without first having bookmarks. A weekly target is at most four days,
reduced to the calendar days remaining when first issued.

An issued period freezes the saved IANA timezone, civil date and server-derived
bounds. Refreshes/devices reuse it; midnight/DST use PostgreSQL timezone math.
Timezone may change once in seven days, with idempotent re-saving of the current
zone allowed. It does not regenerate the current daily/weekly set. Dates cannot
go backwards to reissue a completed set; a short travel transition may temporarily
retain an expired set (shown paused) until the next eligible period. A minimum
20-hour daily / six-day weekly boundary guard and independent UTC earning caps
bound timezone shifts. Ordinary DST days of 23/25 hours remain valid.

An unavailable provider cannot manufacture tasks or answer keys. Existing quests
are retained; new quests wait for available content. If content disappears, the UI
reports the gap rather than awarding an unsupported task. Weekly/day counters
derive from actual events, not the device clock, an open tab or frontend counts.

## Shared mastery (`spaced-evidence-v1`)

The same conservative evidence policy controls plants, mastered-word statistics,
mastery achievements and all building eligibility. It never writes FSRS values.

| Stage | Evidence |
| --- | --- |
| Seed | A recorded learning occurrence |
| Sprout | One successful self-reported recall |
| Growing | 3 successful occasions, spanning 3+ days; current Review state and 3+ day interval |
| Mature | 4 occasions across 14+ days; Review state, interval and FSRS stability at least 14 days |
| Bloom (historical mastery milestone) | 5 occasions across 30+ days; Review state, interval/stability at least 30 days, plus a correct server-graded check |

After the first success, qualifying occasions must be **daily Review-state cards
actually due**, separated by at least 24 hours from the previous qualifying
success. Repeated practice, learning-step tapping, timezone/day-label changes or
one Easy cannot bloom a plant. A recent Again/relearning prevents a new high-stage
award. The highest earned stage/version is retained; current health independently
shows overdue attention or recovery. A lapse never deletes a plant or earned
building. Returning is encouraged, with no XP/streak punishment.

Historical activity remains immutable and receives **no retroactive currency**.
Existing learned occurrences are conservatively seeded on first game access;
their historical evidence is evaluated on their next recorded recall/check.
No fabricated progress, lemma identity, category or Quran content is introduced.
Occurrence cards are not merged merely because their Arabic spelling matches.

Memory Garden unlocks with a learned word; Library requires 10 historical blooms,
Bridge 25, Academy 50 and Castle 100. The first three are fully illustrated and
interactive. All eligibility is server-side/configured; unlocking is free,
transactional and idempotent. The Academy/Castle use a shared future tower module.
Earned structure records remain permanent after forgetting/inactivity.

## Knowledge checks and fair-play boundaries

Checks are owner-bound, opaque, single-answer instances valid for 15 minutes.
Issuing an existing active check restores the same choices. Meanings come directly
from distinct available provider glosses; no distractor translation is invented.
Only opaque choice IDs and texts reach the browser: the answer-coordinate mapping
is withheld until grading. The server retains coordinates/source word IDs and a
content-change digest, **not Quran text, glosses, audio or tokens**. A source
outage/change or an expired check cannot create a result/reward. An exact completed
retry returns its original result even during a later provider outage; a changed
answer is rejected. Wrong answers provide feedback, not currency or punishment.

These are exact **source-association** exercises, not a comprehensive semantic
exam. Editorial review of distractor ambiguity and broader assessment design is
still appropriate before public release. The vocabulary is publicly readable
elsewhere in the app: checks **do not prove unaided knowledge**. Self-reported
ratings and FSRS retrievability are estimates/evidence, not proof of memory.

It is impossible to guarantee that someone cannot cheat at self-assessment or
look up an answer. What is enforced is the technical economy: the browser cannot
mint balances, accelerate the scheduler, change mastery, supply timestamps,
choose award amounts, replay rewards or act as another learner. No webcam,
fingerprinting, hidden monitoring, punitive ban or paid currency is introduced.

Challenge issuance is capped at 12/hour. Durable per-learner PostgreSQL windows
limit challenge mutations to 20/minute and kingdom mutations to 60/minute, shared
across application processes. Limits supplement, not replace, transactions and
constraints. Privacy-conscious hourly rejection counters contain only learner ID,
reviewed reason code and count, pruned on use after 30 days (rate windows: one day).
No emails, IP addresses, access tokens, raw request payloads or OAuth secrets are
logged. Repeated stale/conflicting review submissions are also audited safely.

## API surface

All routes below are under authenticated `/api/learning/game`, inherit `no-store`
and derive identity from the existing verified session. Strict bodies reject XP,
user IDs, percentages, correctness flags, unknown structure keys and timestamps.

| Method / path | Capability |
| --- | --- |
| GET `/overview` | Wallet/level, stable daily/weekly quests, momentum, garden totals, kingdom eligibility/cosmetics |
| GET `/garden?cursor=&stage=` | At most 24 owner-scoped plants, opaque keyset cursor and growth filter |
| GET `/ledger?cursor=` | At most 30 owner-scoped ledger records; foreign cursors disclose nothing |
| POST `/kingdom/:key/unlock` `{}` | Validate an earned structure; persist once |
| POST `/cosmetics/:key` `{}` | Validate garden ownership and atomic one-time token spend |
| POST `/challenges` `{vocabularyId}` | Issue/restore an owned, learned, source-verifiable check |
| POST `/challenges/:id/answer` `{choiceId}` | Server grading, single-use completion and capped award |

Existing `POST /api/learning/attempts` now returns an optional `gamification`
delta in the immutable stored result. Other existing API fields remain intact.
Profile timezone PATCH now enforces the documented seven-day cooldown. There is
no user-selectable game owner in any route/body. Foreign checks return 404.

## Additive database change and safe operation

`server/learning-migrations/0003_growing_kingdom.sql` creates game accounts,
periods, missions, events, distinct mission steps, reward ledger, plants, structures,
cosmetics, knowledge checks and bounded audit/rate counters, with ownership FKs,
uniqueness, balance checks and query indexes. Historical migration files 0001/0002
and the dangerous legacy migration chain are untouched.

Migration 3 was tested on disposable databases, then applied to **only the existing
loopback `kalima_learning_dev:55439`**. Before/after in-memory hashes confirmed all
rows of the nine existing learning tables unchanged. Retained: 2 profiles,
4 bookmarks, 3 word-progress rows, 4 review events, 3 total sessions / 31 session
items, and the 29 occurrence/reference records. The original database was never
opened by the upgrade helper. There is no retroactive game-event import/reset.

From the repository root:

```powershell
npm run game:db:check       # read-only, redacted identity/activity check
npm run game:db:upgrade     # additive v3; exact dev store only, idempotent
npm --prefix server run dev
# In a separate terminal:
npm run dev
```

For future upgrades, stop development activity first so the before/after comparison
is not confused by concurrent legitimate reviews. A failed verification is a
reason to inspect activity, never permission to reset anything. Paid/cloud resources,
the original database and production deployment remain out of scope.

Production adoption still needs a reviewed runtime database role (no DDL/ledger
rewrite privileges), backup/restore/privacy/export/deletion strategy and secure
deployment configuration. The isolated development admin connection is **not** a
production least-privilege deployment. The ledger's deliberate no-delete policy
must be reconciled with the future account-deletion/retention policy before launch.

## Verification and performance

### Code map

| Area | Created / updated files |
| --- | --- |
| Additive storage | `server/learning-migrations/0003_growing_kingdom.sql`; `server/scripts/learning-migrate.mjs`; new `server/scripts/game-development-upgrade.mjs` |
| Rules, rewards, APIs | New `server/src/modules/game/game.policy.ts`, `game.repository.ts`, `game.routes.ts` |
| Existing review integration | `server/src/modules/learning/learning.repository.ts`, `learning.routes.ts`, `learning.schemas.ts` |
| World UI | New `src/features/game/` typed query/time adapters, layout, quest board, SVG art, Home/Garden/Kingdom/Progress pages and styles |
| Existing UI integration | `src/App.tsx`, `src/App.css`, `src/features/learning/learning-api.ts`, `PersistentRecall.tsx`, `pages/DailyReviewsPage.tsx` |
| Verification | New `server/tests/game.test.ts`, `tests/game-time.test.ts`, `e2e/game.spec.ts`; updated isolated fixture, migration expectations and Playwright config |
| Entry points / docs | Root/server `package.json`; README, persistent-learning/adaptive-review guides and this document |

### Commands and results

```powershell
npm test
npm --prefix server test
npm run test:game
$env:PLAYWRIGHT_CHANNEL='chrome'  # installed Chrome, if bundled Chromium absent
npm run test:learning:e2e
npm run test:e2e
npm run lint
npm run build
npm --prefix server run build
```

Executed: 26 frontend unit cases; the full backend suite (87 cases, including
the complete 17-case game suite); all 18 learning/
auth/game browser cases; all 10 public Quran browser cases. TypeScript, lint and
both builds passed. The final execution totals are in the handoff. Initial sandbox
process errors were resolved by using the required local helper execution
permissions; installed Chrome was used instead of downloading another browser.
No automated test is represented as a real hosted sign-in.

Adversarial coverage includes forged XP/identity/timestamp/correctness input,
direct-wallet denial, cross-user reads/mutations, consumed/expired/changed-source
challenges, concurrent retries/spends/unlocks, stale revisions, Again loops,
bookmark toggles, local midnight/DST/travel, UTC caps after spending, large-garden
pagination and atomic rollback after a reward write fails. A browser test commits
a real isolated review then drops its acknowledgement: retry recovers one reward.
A multi-week **synthetic-clock test only** grows ten words via actual FSRS due
reviews, unlocks Library and verifies a subsequent lapse preserves milestones.

The Garden/Kingdom/Progress are lazy-loaded. The measured build added about
2.2 kB minified / 0.7 kB gzip to the previously recorded main JS bundle; optional
screen chunks were 3.4–17.2 kB minified each, with a separate ~11 kB CSS chunk.
No dependencies, raster asset pack, WebGL or animation framework were added.
Only 24 plant SVGs are rendered per page; ledger/history are paginated; no game
polling loop is introduced. A one-shot timer refreshes the overview at the next
server-issued due/reset boundary, so an open homepage can cross midnight. It is
not a client authority for awards; overdue/invalid boundaries cannot cause a loop.
Ambient animations pause offscreen/when hidden, use
transform/opacity and obey reduced motion. Desktop/mobile overflow and reduced
motion were tested, and synthetic Kingdom captures visually inspected. FPS,
real-phone memory and production-scale latency have **not** been benchmarked.
The pre-existing >500 kB main-bundle warning remains a separate optimization task.

Before public release: privately validate the new XP/quests/cosmetic cycle with
the two real development accounts, complete editorial challenge review, test on a
physical lower-powered phone, and review the production privacy/security/runtime
role strategy. Broader mastery thresholds cannot be reached honestly by waiting
minutes; do not manufacture real-user history or move live clocks to demonstrate
unlocks. Additional regions, sounds, haptics, social/seasonal systems, more surahs
and advanced building upgrades remain optional later slices.
