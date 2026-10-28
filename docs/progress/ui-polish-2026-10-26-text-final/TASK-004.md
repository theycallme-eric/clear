# TASK-004 — Generate glow on applicable actionable controls

Issue #524 · REQ-005 · role: completion-owner for JOURNEY-004.
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

Mark Rest Day and Settings on Home carry the Generate button's glow: the vendored `.clr-glow`,
`--glow-spread: 6px` in `--glow-color: var(--interaction-a300)`. Every skin re-tints it through its
interaction role. No stronger preview halo comes back, no card acquires a glow, and focus, disabled
and loading states stay the existing components'.

## Baseline, as found (HEAD `cdc6e64`, contains `7f0a367`)

- `Button variant="primary"` wraps its `.clr-bleed` in `.clr-glow`; other variants get only the
  bleed. Home's Generate was the only glowing control. Settings was a bare `IconButton` in the header,
  and Mark Rest Day / Change reason was a secondary `Button` in an `ActionGroup`.
- The package rule `.clr-glow:has(> :disabled) { filter: none; }` only reaches a direct child.
  It cannot see a Button that sits inside its own bleed wrapper.
- `skins.css` does not restate `--glow-spread` or `--glow-color`.
- PRE-001: `git merge-base --is-ancestor 7f0a367… HEAD` exit 0. PRE-002: the `node -e` version
  probe needed approval and was not run. This task does not touch `src/design-system`.
- Issue comments were not read; the approved task body was the contract.

## Change

- `src/ui/action-glow.tsx` (new): `ActionGlow` wraps one control in
  `<span class="clr-glow clr-action-glow">`. The glow is the package's own rule; nothing is restated.
- `src/ui/action-glow.css` (new), with three app-owned rules and no shadow or token value:
  - `.clr-action-glow:has(> .clr-bleed > :disabled)` turns the glow off. A loading Button is
    disabled, so loading also loses it, as the primary's does.
  - The bleed fills a stretched wrapper.
  - The wrapper fills its `.clr-action-group` cell.
- `src/app/Home.tsx`: the Settings `IconButton` and the Mark Rest Day / Change reason trigger are
  wrapped in `ActionGlow`. Both stay their existing variants, labels, handlers and focus behaviour.
- `src/dev/gallery-registry.tsx`: an `ActionGlow` entry with resting, loading and disabled specimens.
  The gallery coverage test requires every `src/ui` export to be framed.
- `src/app/action-glow.test.tsx` (new, 7 cases): AC-016 to AC-018 on the real route tree in all four
  skins, plus source checks of the package and local rules.

## Decisions and assumptions (for review)

- **Scope of "applicable".** The glow goes on the two named controls and on Change reason, which is
  the same trigger once a day is marked. These were left alone:
  - the rest-day editor's Cancel, which sits beside the already-glowing primary Save;
  - Retry in error states;
  - text links and tabs;
  - controls on other screens.

  Widening the scope later only needs more `ActionGlow` wrappers.
- Disabled and loading controls drop the glow, matching the primary's shipped behaviour. The
  component's own disabled and busy styling is unchanged.

## Verification (worker, uncommitted tree)

| Command | Result |
| --- | --- |
| `npm test -- action-glow` | pass, 1 file / 7 tests |
| `npm run lint:ds` | pass |
| `npm test` | **fail**: 2 of 5788, both in `src/test/design-0143-final-audit.test.ts` (blocker below); 234 of 235 files pass |
| `npm run build` | pass (existing >500 kB chunk advisory only) |
| `npm run lint` | pass, 0 errors, 146 warnings. The new files have none. `Home.tsx` and `gallery-registry.tsx` already had react-refresh export warnings, and this change adds no exports to them. A per-file baseline comparison was not run. |
| `npm run typecheck` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass (71 requirements, 136 edges) |

There were two failures along the way:

- The first `action-glow` run failed one case: the halo check matched words in the stylesheet's
  comment. The test now strips comments before matching rules.
- The first full run also failed the gallery coverage test, because the new `src/ui` export was not
  framed. The gallery entry above fixed it.

## Verification stop: runtime-source-bound audit evidence

This is the same blocker earlier tasks in this body recorded. The audit hashes the runtime source
under `src/`, so any runtime change fails two checks:

- *proof labels › bound to the package and runtime source of this tree*
- *TASK-034 AFTER evidence (eight-cell mobile group)*

No record, hash or audit text was edited. jsdom proves structure and rules only. No browser or e2e
run was made, so the rendered glow in each skin is unproven visually.

Next safe action: the controller commits this tree and re-captures the format-preview evidence
against it. It then checks the Home glow rendered in each of the four skins.
