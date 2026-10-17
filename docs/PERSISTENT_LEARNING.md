# Persistent learning development foundation

## Status and scope

Al-Fatihah stays public. `/account` adds managed email-code sign-in/sign-out.
Signed-in readers can bookmark word occurrences, self-rate contextual recall,
resume an ordered session, and view account-specific counts and recent history.
Anonymous recall remains a page-local exercise and is not silently imported.

Supabase Auth was chosen to avoid owning passwords, email verification, refresh
token rotation, and a custom identity service. Its SDK supports web and future
mobile clients. The existing Express/PostgreSQL application remains responsible
for learner data; moving that data to Supabase is not required. No external
project or paid service was provisioned. Check the [current plans](https://supabase.com/pricing)
and email delivery limits before choosing a deployment plan.

At the latest configuration check, all three Supabase settings were absent. Real
email delivery and hosted sign-in have **not** been accepted. Offline browser tests use the
real SDK, cryptographically signed test tokens, an ephemeral test JWKS endpoint,
and real disposable PostgreSQL databases. This is test infrastructure, not an
application authentication bypass. Production source contains no fake-user mode.

## Connect managed authentication

1. Open the [Supabase dashboard](https://supabase.com/dashboard). In a Free-plan
   organization choose **New project**, name it `kalima-auth-dev`, select a nearby
   region, and save its new database password in a password manager. Stop if a
   paid upgrade is required. This project is for Auth only: do not copy its
   database connection string into Kalima or migrate the learner data to it.
   Under Authentication → Sign In / Providers enable Email and new-user signups,
   keep email confirmation enabled, and keep anonymous sign-in off. Leave CAPTCHA
   off in this new development project until a challenge UI is implemented;
   do not change bot protection on an existing production project.
2. Under Authentication → Email Templates, configure the Magic Link template to
   show `{{ .Token }}` as a one-time code. Include it in the Confirm Signup template
   as well if that template is used for first-time accounts. This app accepts
   email codes, not magic-link callbacks. Follow the
   [official email OTP guide](https://supabase.com/docs/guides/auth/auth-email-passwordless).
3. Use an asymmetric **ES256 or RS256** active JWT signing key under the project's
   signing-key settings. The API deliberately rejects legacy HS256/shared-secret
   tokens. See [JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys).
   Do not rotate keys in an existing production project for this milestone.
4. Under Authentication → URL Configuration set Site URL to
   `http://localhost:5173`; add exact redirect URLs
   `http://localhost:5173/account` and `http://127.0.0.1:5173/account`. No callback
   route is implemented or needed for typed email codes. Keep OTP length at six
   digits for this acceptance and choose a short expiry such as ten minutes.
   Keep the default request cooldown; do not raise limits to evade quotas.
   The [default SMTP service](https://supabase.com/docs/guides/auth/auth-smtp)
   only sends to the project's organization-team addresses and currently allows
   two messages per hour. Start with the organization owner's email. For other
   recipients use an existing approved custom SMTP service; do not invite end
   users into the organization just to receive codes. Do not create paid email
   resources or put SMTP credentials into Kalima frontend files.
5. In ignored **root `.env.local`**, set `VITE_SUPABASE_URL` to your project's HTTPS
   URL and `VITE_SUPABASE_PUBLISHABLE_KEY` to its `sb_publishable_…` key. Keep
   `VITE_API_URL=http://localhost:5000` for normal local development.
6. Add the same project URL as `SUPABASE_URL` in ignored **`server/.env`**. The
   backend needs no Supabase secret/service-role key or JWT signing secret: it
   verifies issuer, audience, signature, expiry, role, and UUID subject via JWKS.
   Keep the already-configured `QF_*` settings unchanged and server-only.
7. Restart both development processes. Open `/account`, request a code, verify it,
   then continue Al-Fatihah. Bookmark a word, rate a revealed recall, reload, and
   sign into the same account in a separate browser to check synchronization.
   A different account must see none of those records. Sign out afterward.

The email template body can be as small as:

```html
<h2>Your Kalima sign-in code</h2>
<p>Enter this code in Kalima: {{ .Token }}</p>
```

Use the **current/active** asymmetric signing key; discovery of a standby key is
not proof that new sessions use it. Obtain the URL from the project's Connect/
Data API settings and the `sb_publishable_…` value from Settings → API Keys.
Never substitute an `anon` JWT, `service_role` JWT, or `sb_secret_…` key.

### Redacted preflight and real hosted acceptance

Run `npm run auth:preflight` from the repository root. It reads Vite development
environment files with normal precedence and the backend environment, checks
matching standard hosted project URLs and publishable-key format, and performs
only GET requests to `/auth/v1/settings` and `/auth/v1/.well-known/jwks.json`.
It emits presence flags, selected booleans, algorithm names and blocker codes,
never project URLs, keys, tokens or raw provider errors. `-- --offline` skips
network calls. The helper has no database connection and sends no email.
`ready-for-manual-hosted-login` is **not** proof of sign-in. Standard
`<project-ref>.supabase.co` URLs are required by this helper; the application
verifier can still support trusted custom HTTPS origins separately.

Public discovery cannot inspect email template bodies, redirect allowlists,
SMTP recipient authorization, quotas, CAPTCHA, or the active-vs-standby key state.
Check these in the development dashboard; no management/service-role credentials
are requested to automate administrative access. The settings response is only
a configuration check, not email delivery or JWT-signature evidence.

For opt-in hosted acceptance, close development processes occupying port 5173,
ensure the isolated learning cluster is already running, set
`PLAYWRIGHT_CHANNEL=chrome` if using installed Chrome, then run:

```text
npm run auth:accept -- --confirm-development
```

The command refuses missing/mismatched configuration, local synthetic identity
providers, QF production, and anything except loopback `kalima_learning_dev` on
port 55439. It does **not** run migrations. A separate visible browser opens;
enter your real email and emailed OTP there, not in terminal/chat. The tool uses
the normal app/SDK and production JWT verifier. It checks public reading, a
real signed-in profile, invalid-bearer rejection, bookmarking, a self-rated recall,
history/progress, reload restoration, real SDK token refresh, and local sign-out.
It retains the resulting development bookmark and recall activity. It deletes
no users/data/databases and does not reset existing progress.

To include an **independent email sign-in** in a second browser context and a
different real learner's authorization checks, use:

```text
npm run auth:accept -- --confirm-development --cross-device --two-users
```

The full run needs **three** email deliveries: learner A, learner A again, then
learner B. This exceeds the default service's two-per-hour allowance; arrange an
approved SMTP service or test the optional checks across separate quota windows.
The command respects a one-minute cooldown but does not bypass hourly limits.
It never copies an existing token into a new context and calls that an independent
login. Skipped checks are reported `not-tested`; partial acceptance is labeled
`passed-with-unperformed-checks`. All windows get signed out on completion where
possible. Signed access tokens can remain valid until expiry, as documented below.

No screenshots, traces, videos, browser storage-state files, email/code logs,
JWT dumps or provider-content fixtures are saved. Reports contain outcomes only.
Failure/timeout may leave legitimate development activity; it is retained for
inspection, not removed automatically. Hosted acceptance has **not yet run**
successfully in this workspace; the missing configuration remains the blocker.

The focused authentication-readiness run passed **8 auth/preflight tests**, **2
frontend error-message tests**, and **6 desktop/mobile learning browser tests**,
plus backend/frontend TypeScript builds and lint. These cover both ES256 and
RS256, forged/wrong-scope/expired/future-issued tokens, JWKS outages, safe error
messages, and the existing synthetic persistence flow. They do not constitute
hosted sign-in evidence. The hosted command was exercised only through its
missing-configuration refusal. Completed QF live acceptance and historical
migration tests were not repeated for this authentication-readiness work.

Only the **publishable** key belongs in `VITE_*`. Never paste service-role,
secret, signing, Quran Foundation, email, access-token, or refresh-token values
into source, logs, screenshots, issues, or documentation. Configuration examples
are blank. The browser SDK owns session persistence and refresh; private query
caches are removed when the signed-in identity changes.

## Isolated development database

From `server/`, run `npm run learning:db`. On this Windows workstation it uses
PostgreSQL 18 binaries from `C:/Program Files/PostgreSQL/18/bin` (override the binary
directory with `LEARNING_PG_BIN` if needed). It creates a separate loopback-only
cluster under ignored `.local/learning-postgres`, on port **55439**, and database
**kalima_learning_dev**, with randomly generated local credentials. It writes an
ignored `server/.env.learning.local`; do not print or commit that file or the
runtime directory. The API and migration runner load this file automatically if
no nonempty explicit `LEARNING_DATABASE_URL` is supplied.

`npm run learning:migrate` applies only `learning-migrations/0001_learning.sql`
with a checksum, transaction, and advisory lock. Repeating it is a no-op;
checksum mismatches or untracked existing learning tables are refused. Do not
edit an applied migration; add a reviewed new migration for subsequent changes.
The runtime/migration gates reject the original `kalima` name, remote hosts,
production names, and URL query overrides. There is no `DB_*` fallback.
`npm run learning:db -- stop` stops **only this isolated cluster** and retains data.

The historical Drizzle migration chain and draft Quran corpus schema are not
activated. The legacy vocabulary prototype still uses its original independent
configuration and is not part of the new account-specific learning store.
No adoption, reset, schema change, or test is run against the original database.

## Data and scheduling

The `learning` schema holds profiles keyed by verified `(issuer, subject)`,
canonical `(surah, ayah, word)` coordinates, environment-scoped provider IDs,
bookmarks, sessions, ordered session items, progress, and review attempts.
No Arabic, translation/gloss, audio, provider response, access token, or password
is stored. Vocabulary identity explicitly distinguishes occurrence cards from
future source-scoped lexeme identities; matching Arabic strings are not treated
as proof that occurrences share a lemma or meaning.

New bookmarks and recall sessions use source-returned coordinates. Words with
missing meanings remain readable/bookmarkable but are not recall cards. Existing
history/progress/bookmark reads do not require Quran Foundation to be online.
The selected word's current display content/attribution continues to come from
the live provider, not learner storage. This is not an offline corpus or a
version-pinned archive of past meanings. Future durable content still requires
[Content Sync](https://api-docs.quran.foundation/docs/tutorials/content-sync/getting-started/),
resource licensing, attribution, and synchronization under the
[Developer Terms](https://api-docs.quran.foundation/legal/developer-terms/).

`starter-v1` uses server timestamps: Again → 10 minutes; Hard → at least 1 hour
(previous interval ×1.2); Good → at least 1 day (×2); Easy → at least 3 days (×3),
capped at one year. Each word receives one self-rating per session. Starting all
words allows optional extra practice; due-only practice excludes future-due words
and introduces not-yet-reviewed words. An existing session resumes in preference
to creating another queue. No score is advertised as mastery or FSRS.

Attempts require a client-generated UUID. An identical retry returns the stored
result; conflicting reuse, already-reviewed cards, and out-of-order cards return
409. A per-learner transaction lock serializes concurrent devices. Progress,
session position, history, and idempotency result commit or roll back together.
Private routes never accept a caller-selected learner ID. User scoping is enforced
in the backend queries; this private schema must not be exposed through a public
database/PostgREST connection without a separate RLS/security design.

## API surface

All private routes below `/api/learning` require `Authorization: Bearer <access token>`
and use `Cache-Control: no-store`. Identity comes only from a verified token.

| Method/path | Purpose |
| --- | --- |
| GET `/status` (public) | Configuration presence, not a database/JWKS health guarantee |
| GET/PATCH `/profile` | Own profile; PATCH accepts only nullable `displayName` |
| GET/POST `/bookmarks` | Own bounded list / save source-verified `{surah,ayah,word}` |
| DELETE `/bookmarks/:vocabularyId` | Remove own bookmark only |
| GET `/sessions/current` | Resume own unfinished Al-Fatihah session |
| POST `/sessions` | Start/resume; accepts `{dueOnly?: boolean}` |
| POST `/attempts` | `{clientAttemptId,sessionId,vocabularyId,rating}` |
| GET `/history` | Own history, 50 per page with UUID cursor |
| GET `/progress` | Own totals, due count and up to 100 progress items |

Bookmarks are bounded at 100 per page with UUID cursors. UI lists are currently
sufficient for the 29-word scope; larger surahs need pagination in the UI.
Unauthenticated/invalid sessions receive 401; unconfigured or temporarily
unavailable services receive 503; invalid input receives 400. Foreign session IDs
return 404. Signed JWTs remain valid until expiry after sign-out; this foundation
does not implement immediate access-token revocation checks. Use short token
lifetimes and complete the deployment security review before going public.

## Verification and next milestone

Validated locally on 2026-10-16: backend **51/51**, frontend unit **15/15**,
existing reading browser **10/10**, learning browser **4/4** (desktop/mobile),
TypeScript/builds and lint pass. Genuine QF prelive public acceptance passed
**554 checks**: seven ayahs, 29 word mappings/glosses, seven translations, source
attribution, 29 reachable word recordings and seven reachable ayah recordings,
with sample word/ayah playback. Hosted Supabase sign-in remains unconfigured.
The retained development store has one applied migration, zero profiles, and zero
attempts; synthetic tests used separate disposable databases.

Start the isolated cluster first, then run:

```text
npm --prefix server test
npm --prefix server run build
npm test
npm run lint
npm run build
npm run test:e2e
npm run test:learning:e2e
```

Set `PLAYWRIGHT_CHANNEL=chrome` in PowerShell for installed Chrome, or install
Playwright Chromium. The learning browser suite uses **synthetic** Quran/identity
fixtures, checks real JWT verification and PostgreSQL persistence, refreshes an
expired SDK session, signs in across browser contexts, verifies isolation and
sign-out, and retries after a committed response is lost. The API suite also
forces a transaction failure to verify rollback and tests invalid identities,
source/JWKS outages, duplicate submissions, scheduling, and database safety gates.
Test databases have random owned `kalima_learning_test_*` names and are dropped
afterward. Browser traces are disabled for account tests.

`npm run test:live` separately verifies genuine QF **public reading**, with account
configuration disabled and no provider content written to disk. A passing live
reading check does not claim hosted Supabase email sign-in has succeeded.

Next: finish real hosted-auth acceptance, then a due-review inbox and calibrated
spaced repetition using the recorded rating/time history (including lapse/relearn
behavior and scheduler-version migrations). Before any public deployment: approve
database adoption/hosting, least-privilege runtime credentials, backups, TLS/CSP,
rate/abuse limits, email delivery, privacy/terms, and account data export/deletion.
No production readiness or deployment is implied by this local milestone.
