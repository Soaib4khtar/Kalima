# Kalima

An Arabic vocabulary app built with React, TypeScript, Vite, TanStack Query, and an Express/PostgreSQL API.

Run the frontend with `npm install` and `npm run dev`. In a separate terminal, run `npm install` and `npm run dev` from `server/`. The API defaults to `http://localhost:5000`; set `VITE_API_URL` in a root `.env.local` to use another backend. The server requires its existing database configuration.

Practice at `/`, browse and filter your collection at `/vocabulary`, and add words at `/vocabulary/new`. The form uses the existing `POST /api/vocabulary` endpoint and supports English, Arabic, transliteration, category, and levels A1/A2/B1.

Reveal a card with Space, then choose Again (1), Difficult (2), or Know (3). Again repeats after up to two other cards; Difficult repeats after up to five. Know removes the word from the current session. With fewer cards remaining, repeats return sooner. A session finishes only when all words are marked Know.

Review progress is stored in sessionStorage for the current browser tab and survives navigation and reloads. New vocabulary joins the next session; use Restart to include it immediately. Reviews use spacing within a session, without scheduling future days or syncing progress to the backend. The dark/light theme preference is stored in localStorage, and reduced-motion preferences disable animations.

Run `npm test` for review queue and persistence tests, and `npm run build` for TypeScript checks and the production bundle.

## Quranic corpus foundation

The architecture audit, verified data-source options, schema direction, MVP, roadmap, and completed safety work are documented in [docs/PRODUCT_FOUNDATION.md](docs/PRODUCT_FOUNDATION.md).

The historical default migration chain is unsafe. Running `npm run db:migrate` from `server/` now refuses because the tracked legacy chain contains a destructive `DROP TABLE ... CASCADE`. Do not bypass that guard or activate the frozen v2 baseline without following its documented isolated-test and approval process.

From `server/`, run `npm test` for corpus integrity checks and `npm run corpus:validate -- <corpus-package.json>` for a read-only package preflight. Validation does not connect to the database; a structurally valid package is still blocked unless every Quranic source exactly matches an operator-approved source catalog.
