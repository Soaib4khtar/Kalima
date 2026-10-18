# Growing Kingdom hosted acceptance — 2026-10-18

Status: **passed with two real Google development accounts**. The regular-browser
checker exited successfully after the final sign-out/public-reading/preservation
checks. This is scoped development acceptance, not production certification.

## Verified with real accounts

- Private configuration checks found matching Supabase settings, Google enabled,
  anonymous sign-in disabled and supported ES256 public signing keys. No secrets,
  project identifiers or access tokens were printed.
- The existing schema is version 3 on the isolated loopback
  `kalima_learning_dev:55439`. No migrations/reset were run for this milestone.
  The first-run preservation baseline included five bookmarks and five review
  events. After genuine learner activity the resumed read-only baseline contains
  six bookmarks and seven reviews; no earlier count was assumed current.
- A genuine Google-linked OAuth JWT passed the unchanged backend verifier.
  The primary Home API returned three daily quests and the existing **45 XP,
  2 Build Tokens and 3 plants**. These are baseline records, not new acceptance
  rewards.
- Genuine primary activity is now saved: an Easy review with no additional
  reward, and a new Again-rated occurrence review with **20 XP / 1 token**
  (including its automatically completed quest). Again is useful participation;
  it is not treated as mastery. The saved FSRS memory/log/due instant, review/game
  attribution, immutable result and transaction-specific ledger deltas passed.
- The primary completed a correct source-backed knowledge check. Its saved
  coordinates and content fingerprint match the genuine current prelive
  response. Exact concurrent challenge/review retries returned the original
  results; conflicting/stale submissions, forged currency/correctness, direct
  wallet writes and unearned building requests were rejected without rewards.
  Re-saving the existing bookmark did not generate XP or tokens.
- After those real actions the primary has **85 XP, 4 Build Tokens, 4 plants and
  6 reward ledger entries**. The wallet, garden, quest steps and history agree with
  PostgreSQL.
- The owner then purchased Pathway lanterns once using those naturally earned
  tokens. The original browser request and two concurrent normal authenticated
  retries succeeded idempotently, with exactly one **-3 token** spending entry.
  The saved state is **85 XP, 1 Build Token, 4 plants and 7 reward entries**;
  no currency was credited to make the purchase possible.
- Primary reload and fresh Google sign-in recovery passed: a distinct signed
  Supabase session reached the unchanged backend verifier, the owner confirmed
  all five world screens, and ledger/decorations remained identical. The primary
  remained signed in in regular Chrome while the second account used an
  independent incognito context.
- The second distinct real Google account completed genuine bookmarking, a
  learner-selected review and a correct source-backed knowledge check. The same
  FSRS/source/replay/reward audits passed. The observed Hard-rated review committed
  **45 XP / 2 tokens**, including automatically earned quests. Its saved state is
  **85 XP, 4 Build Tokens, 3 plants and 6 reward entries**, separate from the
  primary's lantern purchase.
- Bidirectional real-account game isolation passed. Wallets, plants, quests,
  reward history, buildings and decorations matched each authenticated owner in
  SQL. Foreign challenge answers returned 404, foreign reward cursors disclosed
  no entries, and arbitrary/foreign claims or forged owner/currency requests
  could not change either ledger.
- Both identity-switch recoveries passed. Regular Chrome changed primary to
  second and incognito changed second to primary. Both owners created fresh
  verified Supabase OAuth sessions, recovered their own persisted game state and
  privately confirmed no previous account's cached wallet/quests/garden/history.
  Backend reward histories and balances were unchanged by reloads/sign-ins.
- The checker obtained genuine public seven-ayah Al-Fatihah without authentication
  and verified anonymous game overview access is rejected.
- Both contexts were finally signed out. The owner confirmed public Al-Fatihah
  reading and Garden/Reviews sign-in gates in each. The checker repeated the
  anonymous seven-ayah/API-denial checks and verified every pre-existing review,
  reward, bookmark, structure and cosmetic in its resumed baseline was unchanged.
  Its temporary API/frontend servers closed successfully; PostgreSQL and the
  original development backend were not stopped.

Final reconciled balances (no private identifiers):

| Account | XP | Build Tokens | Plants | Reward entries | Decoration |
| --- | ---: | ---: | ---: | ---: | --- |
| Primary | 85 | 1 | 4 | 7 | Pathway lanterns, one 3-token spend |
| Second | 85 | 4 | 3 | 6 | No purchase required |

No FSRS timestamps, genuine ratings, clocks or mastery thresholds were overridden.
No database schema changes were needed during acceptance. Hosted refresh was not
unnecessarily repeated; it remains covered by the previous genuine Google
authentication acceptance. Fresh sign-in and identity-switch restoration were
reverified here with both actual accounts.

## Acceptance utility

```powershell
npm run game:accept -- --confirm-development
```

If the checker times out after primary learning, resume without repeating it:

```powershell
npm run game:accept -- --confirm-development --resume-game-primary
```

The first run timed out waiting for the optional decoration click, not during a
learning transaction. The explicit resume option uses SELECT-only reconciliation
of the newly verified owner's existing bookmarked daily review and completed
correct challenge. It reruns normal immutable-retry/source/ledger checks without
generating a review, answer or token. Reconciled records are reported separately
from new browser-observed actions. Missing owner-bound activity fails closed.

This extends the existing regular-browser hosted runner. Use regular Chrome,
never automation-disguising flags. Authentication and honest ratings/answers are
performed privately by the owner. The checker observes successful protected API
responses and retains verified bearers **only in process memory**. No screenshots,
traces, session files or canonical provider-response dumps are created.

The original database pool is explicitly blocked. The helper uses only normal
authenticated application APIs for mutations, actual server time and read-only
SQL for auditing. No synthetic identities/history or forced mastery are inserted.
Pre-existing review/ledger/bookmark/building/cosmetic records are retained in an
in-memory comparison baseline and checked again before success.

The primary workflow checks real bookmarks, FSRS memory/log/due dates, game-event
attribution, immutable review reward deltas, wallet/ledger agreement, quest steps,
garden ownership, genuine source-backed checks and replay protection. It rejects
forged currency/correctness/ownership, stale reviews and unearned structures.

If an unowned decoration is naturally affordable, the owner first activates the
earned Garden and clicks that purchase once. An armed acceptance-only monitor
retries **that same authorized click** twice concurrently through normal JWT and
transaction checks. It does not purchase anything before the user's click or
credit tokens. Exactly one spending ledger identity must exist afterward. If
nothing is affordable, that conditional live purchase is reported unperformed.

Confirmation words (relayed only after explicit owner confirmation):

1. `primary-recovered`: reload/inspect five world pages, then sign out and freshly
   sign into the same primary account. A distinct signed Supabase session must
   independently reach the backend; a confirmation alone cannot pass recovery.
2. Sign into the second real account in an independent incognito context; save a
   genuine bookmark/review and knowledge check. Both directions are audited:
   wallet/ledger/quests/garden/kingdom match their owner, foreign challenges and
   reward cursors do not leak, and foreign/direct claims cannot mutate rewards.
3. `accounts-recovered`: regular context switches primary → second; incognito
   switches second → primary. Both must create fresh real OAuth sessions and
   recover their own state; privately confirm no stale cross-account UI cache.
4. `finish-ui`: both contexts signed out; public Quran reading works and private
   Garden/Reviews request sign-in. Only then can the final preservation/public
   checks and aggregate pass report complete.

No honest answer/rating is selected by the checker. Own-card skips and removal/
re-adding of genuine old bookmarks are deliberately not manufactured for testing;
their no-reward invariants and long-term mastery use isolated synthetic tests.
Independent browser contexts are not claimed to be a physical second device.

## Focused stabilization and automated checks

The first local launch stopped before learner activity because 5173 was occupied.
Only the listener verified to be this workspace's Vite process was restarted;
the existing backend and PostgreSQL processes were not stopped. Runtime secrets
and process command lines were not printed.

Small quest links and world icon/navigation controls were enlarged to 44px tap
targets. Desktop/mobile synthetic browser checks now cover keyboard plant
selection, pressed state, actual offscreen animation pausing, reduced-motion
overrides while the scene is visible, RTL Arabic/audio metadata, reloads and
account switching. The four focused browser cases passed in both layouts.

Executed this milestone: **26 frontend unit cases, 18 isolated game cases, the
signed-JWT monitor regression and 4 desktop/mobile game browser cases**; TypeScript,
backend/frontend builds, lint, script syntax and whitespace checks passed.
The added eighteenth game test verifies read-only interrupted-run recovery,
preservation of the original rating/result and rejection of another identity's
activity. These use explicitly synthetic identities/content in disposable stores.

Measured main JS: **591.58 kB minified / 169.93 kB gzip**, versus the MVP's
591.58 / 169.94 kB. The existing >500 kB warning has **not worsened**. Shared lazy
world CSS increased from 11.00 / 2.79 to **11.20 / 2.83 kB** after the tap-target
fix. The optional page chunks remain 3.44–17.24 kB. No runtime dependency was added.

## Remaining limits and production work

All required real-account game steps above passed. Real UI is privately
owner-observed; mobile/layout/animation inspection uses synthetic browser tests.
Own-card skips/bookmark removals, competing different-decoration spends, rollback
fault injection and multi-week/mastery thresholds were tested only with isolated
synthetic identities/clocks. The live purchase race tested concurrent first-
purchase retries of the same authorized decoration, not artificially funded
competing purchases. Independent browser contexts are not a physical second device.
FPS, physical
low-powered phones and production-scale latency remain unbenchmarked. Production
runtime-role, backup/privacy/deletion and editorial challenge review work from
the MVP guide is unchanged. The separate legacy `/practice` and `/vocabulary`
prototype still targets the unadopted store; the acceptance runner deliberately
blocks that pool. Its public CRUD surface needs removal or a separate security/
data-adoption review before production; game acceptance does not certify it.
Redacted generic API errors were observed during browser navigation; their
individual requests were not captured, so this report does not attribute them
conclusively or claim all application routes are error-free. Safe structured
route/error diagnostics and the legacy surface need follow-up before production.
No production resource was changed or deployed.
