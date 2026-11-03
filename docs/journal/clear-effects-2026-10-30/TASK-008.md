# clear-effects-2026-10-30 · TASK-008 — effects index, library reference and consolidation

This is the task's own progress record. Under the owner-selected policy it satisfies the
repository's shared daily-journal requirement for this body; its required contents are intact.
TASK-008 is the final consolidation owner. It consolidates once below and does not edit any other
task's record.

## Identity

- Body: `clear-effects-2026-10-30`, task `TASK-008`, issue #609, REQ-009 and REQ-010
  (AC-048 to AC-054, AC-078, AC-079). Role: independent.
- Branch: `agent-runner/task-008-a1-febff6b2` (attempt 1).
- Baseline revalidated before work: HEAD `ed77ae2` (TASK-009 merged, #622) equals
  `origin/build/clear-effects-2026-10-30`. It contains TASK-001 to TASK-007 and TASK-009 (#612 to
  #622). It is not the supplied `codex/library-motion-lab` snapshot `ca09595`, and it is not released
  `main`.
- Nothing was committed, pushed or opened as a PR. No GitHub issue, Runner or external service was
  changed.

## Intended outcome

A small effects index for Phosphor Echo and CRT Glass covering every REQ-009 field, at
`docs/effects/README.md` (heading "CLEAR effects index") with a machine-readable `index.json`. The
visual library README references it, and the Phosphor Echo intake README gets a status update. No
ownership moves, no product code changes, no private workflow material is published, and no
approval is claimed.

## Changes

- `docs/effects/README.md` (new). It covers, for each effect:
  - the one canonical code owner and preset owner, with their APIs;
  - the shared comfort policy, Settings, reduced motion and lifecycle;
  - application, occlusion and colour rules;
  - the scanline replacement map;
  - source and preset provenance: `round-3/preferred-preset.json`; `crt-iab-current-settings.json`
    with its capture provenance and limits; `working-session.mjs`, `default-preset.json` and
    `PRESETS.selected` as distinct earlier references;
  - the reference-package workbench controls, marked as not product settings;
  - pixi.js 8.22.0 / pixi-filters 6.1.5 MIT records and what actually loads (neither is adopted as
    an npm dependency);
  - per-task review and verification evidence and the TASK-009 browser performance summary;
  - one recorded integration gap in the library's four-part form, known limits and demo links.
- `docs/effects/index.json` (new): the same two entries in machine-readable form.
- `docs/design/library/README.md`: the "Find and reuse" bullet that pointed only at the Echo intake
  now names Phosphor Echo and CRT Glass and links the index. It states that the index does not wait
  for library completion or a foundation release.
- `docs/design/library/intake/phosphor-echo/README.md`: a status paragraph (integrated, owners,
  demo, index link, visual approval not recorded). I also removed the private local working-copy
  path; the archive name and SHA-256 stay.
- This record.

Not changed: any `src/` file, the preserved intake `phosphor-echo.mjs`, `preferred-preset.json`,
`APPLICATION-RULES.md` and `VERIFICATION.json`, the 0.14.3 import, `docs/effects/performance.md`,
other tasks' records, `COMPONENTS.md` and `PROJECT_MAP.md`. The map needs no change because no
architecture changed.

## Decisions and findings

- **One owner per effect.** CRT Glass has two code directories. `src/ui/crt-field/` is the live
  owner, mounted once by the root host. `src/ui/crt-glass/` (TASK-005) is a pixel-exact port of the
  raster reference, which only the fidelity spec imports. The index names `crt-field` as the single
  canonical owner and labels `crt-glass` as a reference port that must not be mounted beside it.
- **Integration gap recorded in the library's four-part form.** The preserved CRT pass needs source
  pixels, and live DOM provides none without DOM capture. The live field is therefore a
  browser-native interpretation with its own configuration (owner clarification, 2 November 2026).
  This was already decided in TASK-005/006. It is recorded here, not reopened.
- **Workbench controls.** The AC lists the drift cycle, Still, grain animation and grain feathering
  next to Phosphor Echo. In the source they are CRT Glass Motion workbench controls. They are
  documented under that package as reference-only controls.
- **Preserved source verified unchanged.** `git diff --no-index` shows the intake
  `preferred-preset.json` and `phosphor-echo.mjs` byte-identical to the approved evidence `round-3/`
  files. `git log` shows the intake folder changed only in its README since preservation
  (`5d25037`, `1bde9f6`).
- **Not published:** the browser screenshots, capture file path, browser identity and library file
  IDs from the capture provenance. The index summarises only the provenance limits.

## Failures and corrections

- Several read-only shell commands (`shasum`, multi-statement pipelines, relative paths from a
  changed working directory) were held by the session permission gate. I used `git diff --no-index`
  and `git log` for the byte comparison instead, and returned to the workspace root before running
  the checks. No result depended on a skipped command.

## Verification (this workspace, final tree)

| Command | Result |
| --- | --- |
| `grep -qi 'CLEAR effects index' docs/effects/README.md` | exit 0 |
| `grep -q 'crt-iab-current-settings.json' docs/effects/README.md && grep -q 'preferred-preset.json' docs/effects/README.md` | exit 0 |
| `grep -qi 'phosphor echo' docs/design/library/README.md && grep -qi 'crt glass' docs/design/library/README.md` | exit 0 |
| `node scripts/gallery-index.mjs --check` | "54 registered component entries verified." |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0; 0 errors, 158 warnings (all present before this task) |
| `npm run lint:ds` | exit 0 |
| `npm test` | exit 0; 250 files, 6,059 tests passed |
| `npm run build` | built |

`docs/effects/index.json` was checked by inspection only. A Node/Python parse check was held by
the session permission gate, and no test reads the file.

## Consolidated body view (read once, after predecessors delivered)

This is a read-only summary of the delivered task records in this directory. Each record remains
authoritative and unedited.

| Task | Issue / PR | Delivered | Open items carried into the index |
| --- | --- | --- | --- |
| [TASK-001](TASK-001.md) | #602 / #612 | `src/state/visual-effects.ts` policy, provider and root effects host | none |
| [TASK-002](TASK-002.md) | #603 / #613 | Visual effects checkbox in Settings Appearance | none |
| [TASK-003](TASK-003.md) | #604 / #614 | `src/ui/phosphor-echo.tsx`, preset owner, gallery entry; 0-pixel kernel identity at DPR 1 and 3 | full-alpha silhouette for owner review |
| [TASK-004](TASK-004.md) | #605 / #615 | Echo on eligible outer owners across screens; four-skin applied proof | heading `text-shadow` composition for owner review |
| [TASK-005](TASK-005.md) | #606 / #618 | `src/ui/crt-glass/` reference port and motion clock; 0-pixel still and motion identity with the preserved host | not mounted (reference only) |
| [TASK-006](TASK-006.md) | #607 / #620 | `src/ui/crt-field/` live field; scanline retirement; composition and overhead proof | lighter-than-reference look; owner UAT pending |
| [TASK-007](TASK-007.md) | #608 / #621 | Off, reduced-motion and hidden-tab end states across real screens | field stays as still glass under reduced motion (assumption to confirm) |
| [TASK-009](TASK-009.md) | #610 / #622 | Browser engineering performance comparison, `docs/effects/performance.md` | owner cost decision pending; not phone evidence |
| TASK-008 | #609 | This index and the library references | — |

Recurring across the body: the source-bound `design-0143-final-audit` tests failed whenever runtime
`src/` changed. Each task resolved this through an owner-authorized genuine recapture, and no hash
was edited by hand. TASK-008 changes no runtime source, so it does not trigger that audit.

## Unresolved assumptions and next action

- Final owner visual approval for both effects and their composition is not recorded. Neither is
  the owner's performance-cost decision. The index says so and leaves a place to record both.
- Assumed that the shipping field's own identity and values are what the index should present as
  CRT Glass's preset, with the reference export kept separate, as TASK-006 and the November 2
  owner clarification established.
- Next safe action: controller verification of this tree. Then the Runner's normal delivery to the
  effects build branch. No merge to `main`, deployment or issue publication is done or implied here.
