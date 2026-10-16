# Kalima

A Quranic Arabic learning app built with React, TypeScript, Vite, TanStack Query, and an Express/PostgreSQL API.

Run the frontend with `npm install` and `npm run dev`. In a separate terminal, run `npm install` and `npm run dev` from `server/`. The API defaults to `http://localhost:5000`; set `VITE_API_URL` in a root `.env.local` to use another backend. Only the legacy vocabulary routes require PostgreSQL; the Quran routes can run without a database connection.

Open the first Quranic learning experience at `/quran/al-fatihah`. When the server is connected to Quran Foundation, the page reads Al-Fatihah directly from the configured source, presents exact RTL Arabic and contextual word meanings, exposes available word/ayah audio, and runs a simple meaning-recall challenge. Without credentials or a valid prelive resource, it shows an explicit source-unavailable state and does not substitute bundled Quran text.

The original general-Arabic prototype remains available: practice at `/`, browse and filter your collection at `/vocabulary`, and add words at `/vocabulary/new`. The form uses the existing `POST /api/vocabulary` endpoint and supports English, Arabic, transliteration, category, and levels A1/A2/B1.

Reveal a card with Space, then choose Again (1), Difficult (2), or Know (3). Again repeats after up to two other cards; Difficult repeats after up to five. Know removes the word from the current session. With fewer cards remaining, repeats return sooner. A session finishes only when all words are marked Know.

Review progress is stored in sessionStorage for the current browser tab and survives navigation and reloads. New vocabulary joins the next session; use Restart to include it immediately. Reviews use spacing within a session, without scheduling future days or syncing progress to the backend. The dark/light theme preference is stored in localStorage, and reduced-motion preferences disable animations.

Run `npm test` for review queue and persistence tests, and `npm run build` for TypeScript checks and the production bundle.

## Quran Foundation development setup

Copy the server settings from `server/.env.example` and set server-only `QF_CLIENT_ID`, `QF_CLIENT_SECRET`, and `QF_TRANSLATION_ID`. `QF_RECITATION_ID` is optional. Resource IDs must be selected from the same environment configured by `QF_ENV`; production examples must not be assumed to exist in prelive. Use the authenticated `/content/api/v4/resources/translations?language=en` catalog for translation IDs and `/content/api/v4/resources/recitations?language=en` for ayah-by-ayah recitation IDs. The backend validates both choices against that environment before requesting their content. See the [official authentication guide](https://api-docs.quran.foundation/docs/quickstart/).

The backend authenticates with the OAuth client-credentials flow and exposes read-only `GET /api/quran/status` and `GET /api/quran/surahs/1` endpoints. The latter returns a `ready`, `unconfigured`, or `unavailable` data status. Quran responses are marked `Cache-Control: no-store`; ordinary Content API responses are not written to PostgreSQL. The React query cache is discarded when the Quran page unmounts. Under the [Developer Terms](https://api-docs.quran.foundation/legal/developer-terms/) reviewed on 2026-10-16, a durable local corpus must use [Content Sync](https://api-docs.quran.foundation/docs/tutorials/content-sync/getting-started/) and its resource-specific licensing and attribution requirements. This slice therefore does not activate the draft corpus schema or require a migration.

Run `npm test` from `server/` for provider/API contracts and corpus integrity tests. All committed Quran provider fixtures are explicitly synthetic and are not Quranic content.

Run `npx playwright install chromium` once, then `npm run test:e2e` from the repository root for desktop/mobile browser tests. To use an installed Chrome in PowerShell, set `$env:PLAYWRIGHT_CHANNEL='chrome'` before running `npm run test:e2e`. These tests start isolated local servers with provider credentials cleared and an unreachable database port, verify the real unconfigured API flow, and intercept only test responses for the synthetic reading/recall scenarios. They stream no real recordings and make no live provider calls. Progress in the Quran recall challenge is limited to the current page session; it does not award mastery or persist reviews.

## Quranic corpus foundation

The architecture audit, verified data-source options, schema direction, MVP, roadmap, and completed safety work are documented in [docs/PRODUCT_FOUNDATION.md](docs/PRODUCT_FOUNDATION.md).

The historical default migration chain is unsafe. Running `npm run db:migrate` from `server/` now refuses because the tracked legacy chain contains a destructive `DROP TABLE ... CASCADE`. Do not bypass that guard or activate the frozen v2 baseline without following its documented isolated-test and approval process.

From `server/`, run `npm test` for corpus integrity checks and `npm run corpus:validate -- <corpus-package.json>` for a read-only package preflight. Validation does not connect to the database; a structurally valid package is still blocked unless every Quranic source exactly matches an operator-approved source catalog.
