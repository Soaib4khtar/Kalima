# Google development authentication

Implemented **2026-10-18**. `/account` prefers **Continue with Google** through the
existing Supabase client. Email codes remain a collapsed optional fallback;
Google does not depend on SMTP. Public Al-Fatihah reading remains anonymous.

## Private development setup

Use the existing dedicated Supabase development project. No new Kalima database,
paid resource, auth framework or Google-secret environment variable is required.

1. In **Google Auth Platform**, use an approved development Cloud project. Set
   branding/support contact, configure the appropriate audience and, for
   External/Testing, add both approved Google accounts as test users. Request only
   `openid`, email and profile—no Gmail/Drive or other sensitive scopes.
2. Create/use a **Web application** OAuth client. Authorized JavaScript origins:
   `http://localhost:5173` and `http://127.0.0.1:5173` (origins, no path).
3. Google's authorized redirect URI is the exact hosted callback shown in
   **Supabase Authentication > Sign In / Providers > Google**:
   `https://<development-project>.supabase.co/auth/v1/callback`.
   It is **not** the localhost application callback. Enable the Google provider
   and enter the Google client ID/secret **only in Supabase**, never source,
   frontend env, logs, screenshots or chat. See [official setup](https://supabase.com/docs/guides/auth/social-login/auth-google).
4. In **Supabase Authentication > URL Configuration**, retain development Site URL
   `http://localhost:5173` and allow the exact application callbacks
   `http://localhost:5173/auth/callback` and
   `http://127.0.0.1:5173/auth/callback`. Avoid broad wildcard grants. The owner
   confirmed these are configured; public discovery cannot audit the allowlist.
5. Keep existing ignored root `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`
   and matching server `SUPABASE_URL`. Retain the active asymmetric ES256/RS256
   signing key. Backend Google secrets, service-role keys and SMTP credentials
   are unnecessary. Do not modify an unrelated production OAuth client/project.

## Sessions and safeguards

`signInWithOAuth({provider:'google'})` starts PKCE with a fixed same-origin
`/auth/callback` and `prompt=select_account`. No offline Google API scope is
requested. The callback removes all query/hash parameters and explicitly calls
the SDK's `exchangeCodeForSession` **once per document**, shared by StrictMode
consumers. Automatic SDK URL detection stays off to prevent double exchange.
Denial, missing/duplicate/expired codes, missing verifier and implicit-token URLs
have reviewed error messages; raw provider text is never rendered. Success
replaces the callback with `/account`. Caller-provided `next`/redirect targets
are ignored, and the page uses `no-referrer`. Start/finish in the same browser
context; do not copy callbacks or overlap multiple PKCE sign-in flows.
See [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

The SDK owns normal Supabase session storage and refresh. No additional Google
token store or identity bypass was added; SDK-managed session data remains
sensitive. Account > Session controls permits an explicit SDK refresh. Sign-out
is local Kalima/Supabase sign-out, **not global Google logout**. Private query
caches are cleared on identity changes. The account chooser appears again.

Backend identity remains **verified Supabase issuer + UUID subject**, never an
email, Google ID token or client-supplied learner ID. Signature/issuer/audience/
expiry/role validation is unchanged. Supabase may link verified same-email
identities; Kalima neither merges profiles nor matches them by email. Different
subjects retain separate data. Two-user acceptance requires distinct verified
subjects. See [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).

## Hosted acceptance in regular Chrome

Google rejected the automated Chrome window with its unsupported/insecure-browser
message. Do not hide automation flags, disable browser security, copy tokens or
otherwise evade this check. The live command now runs with a **regular,
user-controlled browser** and verifies actual authenticated API/DB outcomes.

```powershell
npm run auth:preflight -- --google
npm run auth:google:accept -- --confirm-development
```

Run interactively from the repository root with the existing isolated cluster
running and port 5173 free. Open `http://localhost:5173/account` in normal Chrome.
The command permits only QF prelive and loopback `kalima_learning_dev:55439`,
explicitly blocks the original pool, runs no migrations and creates no screenshots,
traces, browser-state files, tokens or provider-content snapshots. It never
automates Google sign-in or asks for credentials in the terminal/chat.

The acceptance-only monitor first calls the unchanged real JWT verifier, then
recognizes Google-linked OAuth claims. Bearers are retained **only in process
memory** for authenticated acceptance requests; none enter logs/files. It does not
accept synthetic identities, replace authorization, add application endpoints or
set the clock. Learner ratings must originate from actual browser UI requests.
It checks FSRS memory/log/parameters/due dates, history, simultaneous exact retries,
stale/conflicting requests and future-due rejection against real PostgreSQL.

The runner requests these manual steps; type its confirmation words only after
personally checking the corresponding UI (Codex relays explicit user confirmation):

1. **Primary regular window:** Google sign-in, authentic bookmark and honest daily
   review; reload, refresh the session in Account controls, sign out, and check
   Reviews shows sign-in. Confirm `primary-done`. A changed real hosted JWT must
   actually reach the backend; a confirmation alone cannot pass token refresh.
2. **New incognito window:** independently sign into the same primary Google
   account and check bookmark/history/review-session recovery. Confirm
   `recovery-done`. A distinct signed Supabase session must actually be observed;
   no token/session-state copying is used. Keep this learner signed in incognito.
3. **Regular window:** sign into the approved different Google account, bookmark
   another authentic word and submit an honest daily review. API lists/totals
   are compared with each learner's own database rows. Foreign preview/grade/skip
   requests and history cursors are checked **in both directions** using actual
   verified access tokens. Earlier review events are compared unchanged.
4. After checks pass, sign out of both contexts and check public Quran/private
   Reviews states. Confirm `finish`. The final report distinguishes user-observed
   UI checks from machine-verified API/JWT/database outcomes.

Natural due observation is reported unperformed unless the real scheduled instant
has elapsed and the card is actually available; no test rating/time manipulation
is used. A regular/incognito pair is not a physical second-device check. Normal
development bookmarks/reviews remain saved; do not reset records to rerun a test.

## Genuine hosted acceptance — 2026-10-18

**Completed with two actual Google accounts** in regular/incognito Chrome. Google
rejected the automated window; no security flags were hidden or disabled. The
Google sign-ins, visual reload/recovery/sign-out and public/private UI checks were
performed privately and explicitly confirmed by the owner. JWT/API/PostgreSQL
checks were independently verified by the acceptance process:

- Real Google-linked OAuth JWTs passed the normal signature, issuer, audience,
  expiry, role and UUID verifier. A hosted SDK refresh produced a changed token
  for the same learner. Independent incognito sign-in produced a distinct signed
  Supabase session for that same learner and recovered bookmarks/history/progress.
- Authentic prelive bookmarks and genuine daily ratings persisted. Primary
  **Good** scheduled **600 seconds**; secondary **Easy** scheduled **691,200
  seconds / 8 days**. No acceptance code chose these ratings for the learners.
- Before the primary card was due, its preview and a submission using its current
  revision were rejected. A later genuine primary **Easy** daily review was
  accepted **at/after the original due instant**, retained that due in
  `memory_before`, and matched FSRS memory/log/parameters. The owner also confirmed
  the natural due transition. No clocks were overridden or results fabricated.
- Both accounts' bookmark/progress/history/session results matched their own
  database rows. Foreign session preview, grading and skipping returned **404 in
  both directions**; foreign history cursors returned no records. Real users had
  distinct verified subjects and actual saved activity—this was not an empty
  synthetic-account isolation check.
- Concurrent identical retries returned the immutable original result; stale
  revisions and conflicting ID reuse returned **409**, without extra review
  events. Earlier learner review events were preserved unchanged.
- Both contexts signed out as confirmed by the owner. Anonymous API checks
  independently returned genuine **seven-ayah Al-Fatihah** before/after the run;
  the owner confirmed reading stayed public and Reviews required sign-in.

The observer initially missed finished requests because Express had rewritten
`req.url` inside its mounted router. It now captures the original path, with a
mounted-router regression. Acceptance resumed by **reading the user's already
saved real review**, not generating another rating. The earlier running command
left its natural-due flag unobserved at its recovery checkpoint; a subsequent
read-only invocation of `auditNaturalDueFollowUp` passed against the actual later
review. End-of-run reconciliation was added so future command reports do not keep
that stale checkpoint flag. No additional hosted sign-in/review was manufactured
to change the report.

Retained isolated activity: **2 profiles, 4 bookmarks, 4 total reviews including
3 FSRS events, and 2 daily sessions**. The prior historical review remains.
No migrations or learner resets were run. The original database was blocked,
Google/SMTP secrets stayed private, and nothing was deployed. This validates a
regular/incognito pair, **not a physical second device**. Optional email OTP still
depends on correcting the separately tracked Resend authorization configuration.

Automated: **23 frontend unit tests**, **19 focused backend auth/scheduler/
persistence tests plus the monitor regression**, and **14 desktop/mobile learning browser cases** (12 passed
initially; 2 callback-message cases passed after correcting the SDK missing-verifier
code; Google desktop/mobile flows were rerun after adding the session-refresh UI).
The **10 public-reading browser tests** also pass. These automated tests use
explicit synthetic OAuth/content and disposable PostgreSQL, not hosted Google
accounts. TypeScript, lint and builds pass; the existing bundle-size
warning is non-blocking. Broad QF live acceptance was not repeated. No original
database changes, learner resets, migrations on the development store or deployment.
