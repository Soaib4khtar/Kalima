# Kalima's Living Atlas — frontend overhaul

Implemented and visually reviewed in installed Chrome on 2026-10-18. This
milestone changes presentation and frontend interactions, not the game economy,
Supabase verifier, Quran provider, FSRS policy or database schema.

## What the before captures showed

- Large headings and repeated, equally weighted rectangles made learning feel
  like a dashboard. The main learning action competed with statistics.
- The small, non-interactive island was an illustration of the game, not the
  interface to it. Building actions lived in a second, lengthy card grid.
- Garden plants were isolated in vocabulary cards rather than sharing a place.
- Repeated icon badges did not create a distinctive world or visual story.
- Mobile primarily stacked the desktop layout, with a long building-card list
  and no persistent world navigation.

The replacement uses original modular SVG: warm paper, evergreen architecture,
terracotta roofs, botanical planting, distant hills, sunlit terrain, river, stone
paths and restrained brass details. No bitmap art, external font dependency,
WebGL, animation framework or new runtime dependency was added.

## Implemented screens and interactions

- **Kingdom:** an explorable illustrated atlas. All five real backend structures
  occupy stable landscape positions. Locked silhouettes, ready pins and built
  artwork are distinct. Hotspots and an equivalent text place index open native
  detail dialogs. Requirements, eligibility and saved status remain server-owned.
  Construction feedback follows successful persistence and refreshed game data.
  Lanterns/fountain appear only when the API reports ownership.
- **Garden:** plants rooted in shared terrain, not rectangular vocabulary cards.
  Sparse gardens are centered; trees, flowers, paths and soil make a new garden
  attractive without inventing learned words. Five distinct stages and coordinated
  botanical variants reuse actual occurrence/stage/health data. Due highlighting
  follows server timestamps; a one-shot due-boundary refresh uses the existing
  timer helper, not a polling/reward clock. Existing 24-item cursor pagination
  and server-side growth filters remain intact.
- **Word details:** desktop side sheet / mobile bottom sheet with authentic
  available Arabic, contextual meaning, reference, optional audio, stage, health,
  recorded recalls and schedule. Missing source details never delete the plant.
  Review actions open the existing scheduled inbox; they do not force a selected
  word past FSRS eligibility. Future instants are explicitly labeled device time.
  The existing server-graded check and retry behavior are retained.
- **Home:** an illustrated welcome and owned-world preview, one primary Continue
  Learning action, compact level/XP/due/token strip, genuine quests, a first-page
  preview of up to five actual plants, next milestone and quieter weekly chapter.
- **Quests:** botanical mission vignettes, warm journal panels, completion seals,
  clear objectives, saved progress and capped-reward previews. A completion
  animation runs only when a previously incomplete server quest becomes complete.
- **Progress:** illustrated level crest, participation XP explicitly separated
  from memory, an educational five-stage growth guide, actual momentum dates,
  permanent building milestones and transparent paginated reward history.
- **Learning / account:** a shared book-and-botanical mark, calmer review framing,
  consistent controls and compact committed-growth acknowledgements. Previous
  acknowledgement text clears before a new rating request; failed or unconfirmed
  saves do not show a new reward. Google/optional email flows are unchanged.
- **Navigation:** desktop world navigation and a phone-sized bottom world dock.
  Public Quran reading and signed-out invitations remain available.

The API has no full-garden stage-distribution endpoint. Accordingly, the five
growth illustrations are labeled a **guide**, not fabricated learner totals or
five earned achievements. Preview plants are labeled/limited to the fetched page.

## Source of truth and safety

No schema/migration/backend feature changes were made for this overhaul. No
original `kalima` database operations or learning-store upgrades were run.
Existing learner records, balances, milestones, auth and scheduling were not
rewritten. No production deployment occurred.

Screenshots use explicitly synthetic accounts/content in the existing hermetic
test host and disposable databases. Advanced 24-plant/all-built scenes are
test-only intercepted response branches, not fabricated real history or a
production preview mode. All captures are marked SYNTHETIC QA. Canonical Quran
content, real email addresses, Google sessions and credentials were not captured.

## Visual evidence

Open the [local before/after gallery](../.local/world-visuals/index.html). It
compares Home, Quests, Garden, Kingdom, Progress, Reviews, Account and Reading in
desktop/mobile layouts, with full-size image links. Extra captures cover detail
sheets, checks, locked/built structures, empty worlds, all five growth stages,
all-built visual states and light mode. These ignored local QA artifacts are not
part of the production bundle or committed source content.

Representative pairs:

| Screen | Before | After |
| --- | --- | --- |
| Desktop Kingdom | [image](../.local/world-visuals/before/desktop/kingdom.png) | [image](../.local/world-visuals/after/desktop/kingdom.png) |
| Desktop Home | [image](../.local/world-visuals/before/desktop/home.png) | [image](../.local/world-visuals/after/desktop/home.png) |
| Mobile Garden | [image](../.local/world-visuals/before/mobile/garden.png) | [image](../.local/world-visuals/after/mobile/garden.png) |
| Mobile Kingdom | [image](../.local/world-visuals/before/mobile/kingdom.png) | [image](../.local/world-visuals/after/mobile/kingdom.png) |

Reproduce synthetic captures:

```powershell
$env:PLAYWRIGHT_CHANNEL='chrome'
$env:KALIMA_WORLD_CAPTURE_PHASE='after' # before is only for the original baseline
npm run test:learning:e2e -- --grep 'quests, garden|private world|illustrated garden|light world'
```

## Validation and performance

- `npm test`: 26 frontend cases passed.
- Full learning/game Chrome suite: 22 desktop/mobile cases passed, covering
  persistence, lost acknowledgements, Google PKCE, refresh, identity changes,
  source gaps, private gates, world interactions, failed unlocks, cursor bounds,
  modal keyboard focus, light mode and selected paper-text contrast.
- Frontend/e2e TypeScript, lint, frontend build, backend compile for test hosting,
  script syntax and whitespace checks passed. Backend feature/migration suites
  were not unnecessarily repeated.
- `npm run world:public:check`: genuine prelive, anonymous desktop/mobile smoke
  passed. Seven ayahs and 29 selectable words/available contextual meanings;
  exact rendered Arabic/RTL, selected source meaning, no horizontal overflow,
  no page runtime exceptions, no server credential leakage. No content/session
  artifacts, audio playback or database access were used by this smoke.
- Newly restyled authenticated UI has synthetic interaction coverage; hosted
  Google/reward acceptance was **not re-claimed as a new real-account visual run**.
  The prior genuine two-account acceptance remains documented separately.

| Build output | Before (min / gzip kB) | After (min / gzip kB) |
| --- | ---: | ---: |
| Initial JS: entry + mandatory preload | 591.58 / 169.93 | 545.46 / 159.31 |
| Entry chunk alone | 591.58 / 169.93 | 257.63 / 79.51 |
| Required shared auth chunk | included above | 287.83 / 79.80 |
| Lazy shared world JS | 17.24 / 6.27 | 32.67 / 11.35 |
| Lazy world CSS | 11.20 / 2.83 | 33.25 / 7.66 |
| Shared journey CSS | none | 2.65 / 0.91 |

Reading, reviews and account routes are now lazy loaded. Initial JS decreased
about 7.8% minified / 6.2% gzip, **including** the required auth preload; it would
be misleading to report only the smaller entry chunk. No chunk exceeds 500 kB,
so the old main-bundle warning is gone without raising the warning threshold.
The original vector world intentionally adds a modest lazy visual budget.

## Accessibility and remaining limits

Building hotspots are at least 44 CSS px in both tested layouts. Text alternatives
remain available for scene navigation. Native dialogs provide focus containment,
Escape and restoration; long sheets keep a 44px close control visible. Arabic is
source-preserved RTL and is never decorative image text. Images/SVG used purely
for environment are hidden from assistive technology. Selected small paper labels
were darkened and measured at >=4.5:1 in both themes; this is not a complete WCAG
certification or a screen-reader audit.

Ambient transforms/opacity pause offscreen through IntersectionObserver and on
hidden documents. Tests cover actual offscreen geometry and a **simulated**
browser visibility event, not physical background-tab benchmarking. Reduced
motion disables ambient, growth, construction, reward and navigation motion.
At most 24 real plants are animated on a garden page; preview/guide plants are
static. No FPS, physical low-end phone, battery or production load claims are made.

Remaining: physical iOS/Android and screen-reader checks, owner review of the new
art direction on real signed-in accounts, and any further art/typography iteration
based on that feedback. Legacy CRUD security, unattributed historical API errors,
runtime database roles, privacy/deletion/backups and assessment editorial review
remain intentionally deferred backend/production work, not silently certified by
this frontend milestone.

## Important frontend files

- `src/features/game/WorldArt.tsx`: shared terrain, architecture, botanical stages,
  quest vignettes, crest and owned-world composition.
- `src/features/game/use-scene-activity.ts`, `GameSheet.tsx`: bounded motion and
  native accessible interaction primitives.
- `HomePage.tsx`, `KingdomPage.tsx`, `GardenPage.tsx`, `ProgressPage.tsx`,
  `QuestBoard.tsx`, `GameLayout.tsx`, `game.css`, `game-api.ts` in the same folder.
- `JourneyArt.tsx`, `GrowthAcknowledgement.tsx`, `journey.css`: shared learning art
  and committed feedback, used by account, daily review and saved recall screens.
- `src/App.tsx`: route-level lazy loading.
- `e2e/game.spec.ts`: interaction, accessible state, visual capture and theme tests.
- `scripts/verify-world-public.mjs`: opt-in, real-source, no-storage public smoke.
