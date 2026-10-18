# Kalima

A Quranic Arabic learning app built with React, TypeScript, Vite, TanStack Query, and an Express/PostgreSQL API.

Run the frontend with `npm install` and `npm run dev`. In a separate terminal, run `npm install` and `npm run dev` from `server/`. The API defaults to `http://localhost:5000`; set `VITE_API_URL` in a root `.env.local` to use another backend. Public Quran routes need no database; legacy vocabulary and signed-in persistent learning use separate PostgreSQL configurations.

Open the first Quranic learning experience at `/quran/al-fatihah`. When the server is connected to Quran Foundation, the page reads Al-Fatihah directly from the configured source, presents exact RTL Arabic and contextual word meanings, exposes available word/ayah audio, and runs a simple meaning-recall challenge. Without credentials or a valid prelive resource, it shows an explicit source-unavailable state and does not substitute bundled Quran text.

The original general-Arabic prototype remains available at `/practice` (also `/` when signed out); browse/filter at `/vocabulary`, and add words at `/vocabulary/new`. Signed-in `/` now opens the Growing Kingdom overview. The vocabulary form uses the existing `POST /api/vocabulary` endpoint and supports English, Arabic, transliteration, category, and levels A1/A2/B1.

Reveal a card with Space, then choose Again (1), Difficult (2), or Know (3). Again repeats after up to two other cards; Difficult repeats after up to five. Know removes the word from the current session. With fewer cards remaining, repeats return sooner. A session finishes only when all words are marked Know.

The legacy prototype's review progress is stored in sessionStorage for the current browser tab and survives navigation and reloads. New vocabulary joins the next session; use Restart to include it immediately. Its reviews use spacing within a session, without syncing to the backend. The new account-specific Quran learning flow is described below. The dark/light theme preference is stored in localStorage, and reduced-motion preferences disable animations.

Run `npm test` for review queue and persistence tests, and `npm run build` for TypeScript checks and the production bundle.

## Accounts and persistent Quran learning

The frontend now features the **Living Atlas**: an explorable illustrated Kingdom,
planted Memory Garden, journal-style quests, mobile world dock and accessible
detail sheets. See [the frontend overhaul and before/after gallery](docs/FRONTEND_WORLD.md).
No backend/economy/schema changes accompany this redesign.

The **Growing Kingdom** MVP is implemented: personalized Today’s Quests, a five-stage
Memory Garden, server-graded source-association checks, My Kingdom, XP/Build Tokens,
weekly challenges and gentle learning momentum. See [features, APIs, economy,
anti-cheat rules, migration and validation](docs/GROWING_KINGDOM.md). Additive migration
0003 is applied only to the isolated development store with all existing learning
rows verified unchanged. The reward loop also passed genuine two-Google-account
development acceptance on **2026-10-18**, including earned rewards, a naturally
funded decoration purchase, replay/authorization checks and identity-switch
recovery. See [real balances, test evidence and production-readiness limits](docs/GROWING_KINGDOM_LIVE_ACCEPTANCE.md).
Automated browser fixtures remain synthetic. Public reading and existing verified
authentication remain intact.

Sign in at `/account` with **Continue with Google**; email codes remain an optional
fallback. See [Google setup, PKCE callbacks and private live acceptance](docs/GOOGLE_AUTH.md).
Backend Supabase JWT verification and learner-data isolation are unchanged.

Open **Reviews** at `/reviews` for the new FSRS-powered daily inbox: due/overdue and
later-today vocabulary, new saved words, rating previews, relearning waits, saved
IANA timezone, and resumable sessions with source-backed context/audio. Migration
0002 is applied to the isolated development learning store with existing activity
preserved. See [scheduler policy, APIs, safety, tests and limitations](docs/ADAPTIVE_REVIEWS.md).
Real Google two-user isolation and daily-review acceptance passed on **2026-10-18**;
see the [genuine hosted evidence and limitations](docs/GOOGLE_AUTH.md).

`/account` prefers Supabase Google authentication, with optional email codes. Signed-in Al-Fatihah readers can bookmark source-verified occurrences, save self-rated recall attempts, resume a session after refresh/on another device, and view progress/history. Quran reading and anonymous recall remain public. A separate PostgreSQL development cluster stores activity and references only, never Quran text, glosses, translations, recordings, or authentication tokens. The original database and historical migrations are not adopted.

For new environments, prepare the isolated store with `npm --prefix server run learning:db` and configure a development Supabase project using the two `.env.example` files. Historical email-code acceptance passed on **2026-10-17**. Genuine Google login, hosted refresh, independent-session recovery, daily FSRS persistence and two-real-user isolation passed on **2026-10-18**. See [setup and security boundaries](docs/PERSISTENT_LEARNING.md) and [Google acceptance evidence](docs/GOOGLE_AUTH.md). `npm run test:learning:e2e` separately uses clearly marked synthetic identities/content and is not itself proof of hosted login.

After following the Google guide, run `npm run auth:preflight -- --google` for redacted read-only discovery, then `npm run auth:google:accept -- --confirm-development` for opt-in regular-browser hosted checks. Sign in privately with each Google account; no credentials belong in terminal/chat. The command retains development activity, runs no migrations, and never treats synthetic tests or discovery as proof of login. The email acceptance commands remain available for the optional fallback when SMTP and quotas permit them.

## Quran Foundation development setup

Copy the server settings from `server/.env.example` and set server-only `QF_CLIENT_ID`, `QF_CLIENT_SECRET`, and `QF_TRANSLATION_ID`. `QF_RECITATION_ID` is optional. Resource IDs must be selected from the same environment configured by `QF_ENV`; production examples must not be assumed to exist in prelive. Use the authenticated `/content/api/v4/resources/translations?language=en` catalog for translation IDs and `/content/api/v4/resources/recitations?language=en` for ayah-by-ayah recitation IDs. The backend validates both choices against that environment before requesting their content. See the [official authentication guide](https://api-docs.quran.foundation/docs/quickstart/).

To configure this milestone securely:

1. Sign in to the [Quran Foundation Developer Console](https://dev-console.quran.foundation/) and register Kalima as a **Backend/server** application. Obtain prelive credentials with permission for the `content` scope. Save the one-time client secret securely. See the [official Developer Journey](https://api-docs.quran.foundation/docs/developer-journey/). A Quran.com end-user login is not required for this app-only Content API flow.
2. In your editor, append `QF_ENV=prelive`, `QF_CLIENT_ID`, and `QF_CLIENT_SECRET` to the existing `server/.env`, using the issued prelive values. Preserve its existing database settings. `server/.env` is ignored by `server/.gitignore`; do not put these credentials in the frontend, `VITE_*` variables, source code, shell arguments/history, screenshots, or chat. Never commit the filled file. The checked-in `.env.example` must remain credential-free.
3. From `server/`, run `npm run quran:prelive-resources`. This helper refuses production, reads the credentials from the server environment, authenticates in memory, and displays only English translation catalog metadata and ayah-recitation catalog metadata. It never prints the secret/token, requests verses, imports the database, or writes provider responses to disk. An unsuccessful run exits nonzero with a redacted status. Catalog success proves only authentication and resource discovery, not successful Al-Fatihah loading.
4. Select a named English edition from that actual prelive catalog and append its `id` as `QF_TRANSLATION_ID` in `server/.env`. Optionally choose a returned ayah-by-ayah recitation `id` as `QF_RECITATION_ID`; leave it blank to omit ayah audio. Do not use chapter-reciter IDs or IDs copied from production/documentation examples. If no suitable resource is returned, report it as unavailable instead of choosing an invented ID. The verse translation selection does not select the API's separate contextual word-by-word gloss edition.
5. Restart the API with `npm run dev` from `server/`; run `npm run dev` from the repository root in another terminal. Open `http://localhost:5173/quran/al-fatihah`. `GET http://localhost:5000/api/quran/status` reporting `configured` means only that settings are present. Live content acceptance still requires `GET /api/quran/surahs/1` to return `data.status: "ready"` from a genuine provider call, with all seven ayahs, matching `1:ayah:word` coordinates, attributed translations, and the actual page correctly displaying them. Review any missing meanings/audio separately; catalog membership alone does not prove their coverage or playback. Do not capture response dumps, browser traces, recordings, or screenshots during this live check.

The exact prelive requests use `POST https://prelive-oauth2.quran.foundation/oauth2/token` with HTTP Basic client authentication and form body `grant_type=client_credentials&scope=content`, followed by requests beneath `https://apis-prelive.quran.foundation/content/api/v4/` with `x-auth-token` and `x-client-id`. The backend handles these details; no token needs to be copied into a browser or command. Prelive supports surahs 1 and 2 only. This milestone requests surah 1 only.

For optional ayah audio, the adapter also reads the selected resource's [dedicated recitation endpoint](https://api-docs.quran.foundation/docs/content_apis_versioned/4.0.0/list-surah-recitation/) in prelive and prefers its verse-keyed recordings to embedded verse audio, whose URLs can be stale. Duplicate/unrelated coordinates are rejected. Returned protocol-relative URLs retain their source hostname and resolve over HTTPS. No replacement recording path is guessed. Audio resource failures remain optional and do not hide valid Arabic.

The backend authenticates with the OAuth client-credentials flow and exposes read-only `GET /api/quran/status` and `GET /api/quran/surahs/1` endpoints. The latter returns a `ready`, `unconfigured`, or `unavailable` data status. Quran responses are marked `Cache-Control: no-store`; ordinary Content API responses are not written to PostgreSQL. The React query cache is discarded when the Quran page unmounts. Under the [Developer Terms](https://api-docs.quran.foundation/legal/developer-terms/) reviewed on 2026-10-16, a durable local corpus must use [Content Sync](https://api-docs.quran.foundation/docs/tutorials/content-sync/getting-started/) and its resource-specific licensing and attribution requirements. This slice therefore does not activate the draft corpus schema or require a migration.

Run `npm test` from `server/` for provider/API contracts and corpus integrity tests. All committed Quran provider fixtures are explicitly synthetic and are not Quranic content.

Run `npx playwright install chromium` once, then `npm run test:e2e` from the repository root for desktop/mobile browser tests. To use an installed Chrome in PowerShell, set `$env:PLAYWRIGHT_CHANNEL='chrome'` before running `npm run test:e2e`. These tests start isolated local servers with provider credentials cleared and an unreachable legacy database port, verify the real unconfigured API flow, and intercept only test responses for the synthetic reading/recall scenarios. They stream no real recordings and make no live provider calls. Anonymous Quran recall stays page-local and does not award mastery; signed-in learning persistence is tested separately.

After configuring prelive, run `npm run test:live` from the repository root (set `PLAYWRIGHT_CHANNEL=chrome` first to use installed Chrome). This is an opt-in acceptance run, separate from the offline suite. It starts temporary loopback API/frontend servers, makes genuine prelive requests, compares Arabic/word coordinates/meaning and translation text against the responses in memory, exercises every word and recall card on desktop/mobile, probes supplied audio URLs, and attempts sample word/ayah playback. It also checks controlled missing-field and error states using in-memory copies of the genuine response. Database calls are blocked. The runner saves no provider responses, screenshots, traces, recordings, or content fixtures; it emits only aggregate checks and source attribution, and stops its servers/browser afterward. Audio reachability/sample playback are reported separately from content checks; inspect those results even when the content checks pass. Port 4177 must be free for its temporary frontend.

## Quranic corpus foundation

The architecture audit, verified data-source options, schema direction, MVP, roadmap, and completed safety work are documented in [docs/PRODUCT_FOUNDATION.md](docs/PRODUCT_FOUNDATION.md).

The historical default migration chain is unsafe. Running `npm run db:migrate` from `server/` now refuses because the tracked legacy chain contains a destructive `DROP TABLE ... CASCADE`. Do not bypass that guard or activate the frozen v2 baseline without following its documented isolated-test and approval process.

From `server/`, run `npm test` for corpus integrity checks and `npm run corpus:validate -- <corpus-package.json>` for a read-only package preflight. Validation does not connect to the database; a structurally valid package is still blocked unless every Quranic source exactly matches an operator-approved source catalog.
