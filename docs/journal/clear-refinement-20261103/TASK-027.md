# TASK-027 — Compact live navigator preserves section access (#654)

Body `clear-refinement-v2-20261109b`, attempt 1. First pass on base `e6c5f89` (after TASK-020 #706)
stopped before implementation; resumed 2026-11-10 after the owner decision below, rebased onto
`origin/build/clear-refinement-2026-11-04` at `0060324` (#712, TASK-029). This is the task-owned
progress note, the approved exception to the shared daily journal for this body. Only TASK-027
writes this file.

## Intended outcome

REQ-027 (AC-C54-01, AC-R027-01), completion owner of JOURNEY-027 on `/workout`: the live section
navigator becomes the accepted compact treatment (`/gallery/refinements?state=cards`, reference
`eded158`). It keeps position/status, section jumping and focus, and it no longer repeats the
active card's identity. Real multi-section workouts are verified on `/workout`, and a jump records
and resets nothing.

## What the sources require

- R35: Eric finds the separate top card clunky (`Accessory`, section/status, **repeated structure
  badge**, All sections). He wants a compact treatment that does not repeat the active card's
  identity, while keeping the position/status meaning and access to section jumping.
- G22/C54 says the same: "without duplicate active-card identity". R98: the shown compact
  navigation was accepted; unshown multi-section cases remain integration verification.
- The accepted reference `SectionHeader compact` (source-06 `src/ui/workout-chrome.tsx`, lines
  427–434) draws only an `All sections` disclosure with the `N / M` position and the status-bearing
  jump list; `.clr-accepted-section-nav__meta` (source-06 `presentation.css` line 198) puts the
  position at the trigger's end in `--text-secondary` at `--label-xs-size`.

## First pass (stopped): protected-spec conflict

The controller's standing instruction was to stop rather than edit another task's protected spec.
TASK-003's checks asserted the duplicate R35/C54 remove (the live `Structures in this section`
list and a badge count of `FORMAT_KEYS.length * 2`). Two decisions were asked: (1) may TASK-027
amend those assertions; (2) where the section h2 goes and where focus lands after a jump.

## Owner decision (Eric, 2026-11-10, chat, relayed by the controller)

Question: "May tasks update earlier tests when their approved requirement replaces that UI?"
Answer: "Yes, go ahead". Scope: a task whose approved requirement replaces earlier UI may update
earlier tasks' test locators and assertions, keeping each test's meaning wherever it still applies.

- Decision 1: yes — update TASK-003's superseded assertions; keep what still applies; do not
  rename cases or edit any `required-cases.json`; genuinely re-run TASK-003 check-01 and check-02.
- Decision 2: option (a), the controller default matching the reference — a visually hidden
  section h2 in the compact navigator; after a jump, focus goes to the active section's first card.
  Keep TASK-002's SPAN title assertion and TASK-022's single Warm-up heading passing unedited.

## Changes

Product:

- `src/ui/workout-chrome.tsx` — `SectionHeader` gains opt-in `compact` (reference API). With
  `progress`, it draws `<div class="clr-section-nav" data-section-navigation>`: a visually hidden
  (`a11y-hidden`) `Heading` with the section title (level from context, h2 on `/workout`), a
  visually hidden `Section N / M · status` line, and the shared `CollapsibleSection` whose label is
  `All sections` plus an `aria-hidden` `N / M` span (`clr-section-nav__meta`,
  `data-section-position`). The trigger's accessible name stays exactly `All sections`, so every
  existing `getByRole('button', { name: 'All sections' })` locator (including TASK-022's protected
  vitest and the `exact: true` e2e locators) still holds. No card, visible title, status meta or
  structure badge list. The full (non-compact) header is unchanged for other consumers. Imports
  `./refinements/presentation.css`.
- `src/ui/refinements/presentation.css` — appended (hotspot, append-only) `.clr-section-nav__meta`
  with the reference's three declarations, tokens only.
- `src/app/Workout.tsx` — adopts `SectionHeader compact`. Focus: a jump from the list
  (`jumpTo`) focuses the opened section's first card frame (`.clr-card__body` following the
  navigator, `firstCardAfter`), with a temporary `tabindex=-1` removed on blur; it falls back to
  the heading when the section draws no card. Reselecting the open section does the same before its
  chip goes inert. Previous/Next (`goTo`) keep focusing the (now visually hidden) section heading,
  unchanged. Restore on mount still grabs no focus.
- `src/dev/gallery-refinement-cards.tsx` — `?state=cards` Workout context draws
  `GallerySectionNavigator` (the route's own `SectionHeader compact`, three memory-only sections,
  middle open) between the workout header and the live cards. A jump moves a local index only.

Tests (TASK-027 owned):

- `src/ui/workout-chrome.test.tsx` — new describe `TASK-027 compact live navigator preserves section
  access`, four cases (component reading; keyboard/touch/inert/read-only; real `/workout` route
  over the workout double with a logged set, jump away by keyboard and back by touch; gallery
  state).
- `e2e/refinement/task-027.spec.ts` — four cases: JOURNEY-027 at phone-320 and phone-390 on a
  started four-section synthetic session (Warm-up done; Press with one bench-press set logged and a
  second block done; Conditioning AMRAP; Cooldown); keyboard + reduced motion + failed read/retry +
  reload at phone-390; gallery `?state=cards` at phone-320. Contained: any write fails the case.
- `evidence/refinement/task-027/required-cases.json` — check-01 (4 vitest cases), check-02
  (4 Playwright cases).

## Earlier tests changed, line by line, and why

Each change follows from C54/R35 removing the live section card and its repeated
`Structures in this section` badge list. No case was renamed in any required-cases manifest; no
`required-cases.json` was edited.

TASK-003 (protected; owner decision 1):

- `src/ui/block-panel.test.tsx`, case "AC-C08-01 names only the format or shape in every Review and
  Workout badge…", lines 236–242 (old 236–241):
  - removed: `within(screen.getByRole('list', { name: 'Structures in this section' }))` and its
    items `toEqual(FORMAT_BADGES.workout)` — the list no longer exists (superseded by C54).
  - added: `expect(screen.queryByRole('list', { name: 'Structures in this section' })).toBeNull()`
    — records the supersession.
  - changed: `allBadges` selector from `'.clr-movement-group-header__badge, [aria-label="Structures
    in this section"] li'` to `'.clr-movement-group-header__badge'`, and the count from
    `FORMAT_KEYS.length * 2` to `FORMAT_KEYS.length` (the card badges only).
  - kept: every card badge is format-only (`FORMAT_ONLY`), `FORMAT_BADGES.workout` and
    `FORMAT_DETAILS.workout` on the cards, and no badge carries a number, unit or count. Review is
    untouched.
- `e2e/refinement/task-003.spec.ts`, both "JOURNEY-003 phone-320/phone-390" cases, lines 491–495
  (old 491–493):
  - removed: the live `Structures in this section` list items `toHaveText(FORMAT_BADGES.workout)`.
  - added: that list `toHaveCount(0)`, and `main .clr-movement-group-header__badge`
    `toHaveText(FORMAT_BADGES.workout)` — the same format-only words, now read from the cards'
    badges (the one reading left on the workout).
  - kept: everything else in the case (headers, details, loads, schedule, caps, Review).

Not protected (no task's required case; updated in scope):

- `src/app/Workout.test.tsx`:
  - "states the structure identity of the section's blocks" (lines 380–392): the
    `Structures in this section` lookups became the cards' `.clr-movement-group-header__badge`
    texts (`toContain('EMOM')`, then `'AMRAP'` after Next) plus a `queryByRole(...)` null check.
    The window text checks (`10 MIN`, `8 MIN`) are unchanged.
  - `activeHeader` helper (lines 400–409): finds the heading's `[data-section-navigation]` instead
    of its `.clr-card`, and asserts the navigator is in no card.
  - new helper `firstCard` (lines 411–420): the first `.clr-card__body` following the navigator.
  - "consolidates status, section count and structure identity into one header…" renamed to
    "consolidates status and section count into one compact navigator, with progress above the
    footer navigation" (line 423); its structure-list assertion (old 422–425) became "no structure
    list and no `EMOM` in the navigator" (lines 436–439). The position text, the footer bar, the
    single count/bar/list checks are unchanged.
  - "expands to jump…" (lines 468–470): `heading toHaveFocus()` became `firstCard('Conditioning')
    toHaveFocus()` (owner decision 2a).
  - "reselects the current section…" (lines 492–493): same change for `Primary lift`.
  - "restores the open section after a refresh…" (line 545): added `firstCard('Conditioning')
    not.toHaveFocus()` beside the unchanged heading check.
- Unchanged and still passing: `src/app/workout-footer-nav.test.tsx` (Previous/Next still focus the
  heading), TASK-002's SPAN title assertion (`e2e/refinement/task-002.spec.ts` line 541), TASK-022's
  single `Warm-up` heading (`src/ui/preparation-guide.test.tsx` 316–317, `task-022.spec.ts` 390).

## Verification (2026-11-10, worktree on `0060324` + this change)

- `npm ci` — exit 0.
- `npx tsc --noEmit` — exit 0. `npm run build` — exit 0. `npm run lint:ds` — exit 0.
- `npx eslint` on every changed source/test file — exit 0.
- `npm test` — 269 files, 6360 tests passed.
- Guards (each a fresh receipt):
  - TASK-027 check-01 — 44/44 passed, the 4 required cases passed.
  - TASK-027 check-02 (under the V2 host lock) — 4/4 passed; re-run after the last spec edit (gallery
    capture), 4/4 passed, current receipt.
  - TASK-003 check-01 — passed; check-02 (lock) — 5/5 passed.
  - TASK-002 check-01 — 19/19; check-02 (lock) — 7/7 passed.
  - TASK-022 check-01 — 7/7; check-02 (lock) — 4/4 passed.
- Sweep without the guard (no receipts written), under the lock: `e2e/refinement/task-001, 005,
  006, 007, 008, 009, 010, 011, 012, 013, 014, 015, 020, 033` — 68 passed, 3 failed, all three in
  `task-009.spec.ts` ("one result group": two groups where one is expected), including its gallery
  `?state=amrap` case, which this change does not draw. The same three fail on unmodified
  `0060324` (see Findings).
- After the backend-lane/b05 spec edits: `npx vitest run src/test scripts` — 85 files, 2316 tests
  passed (harness checks over `e2e/`); ESLint and `tsc --noEmit` on those files — exit 0.
- TASK-002 and TASK-022 receipts were rewritten byte-identical (their targets are unchanged), so
  only TASK-003's and TASK-027's receipts differ in the diff.
- Screenshots reviewed (Playwright HTML report in a scratch directory, not committed): collapsed
  navigator `ALL SECTIONS … 2 / 4` above the Press card; open list with status glyphs; after a jump
  the AMRAP card at the top of the scroll region; gallery navigator above the live cards.

## Findings and open items

- **Unsaved set entry is reset by a jump (pre-existing, not changed here).** A probe (temporary
  test, deleted) typed 7 reps into the bench press's set entry, minimized it, jumped away and back:
  the entry read the prescribed 8 again, nothing was recorded. The draft lives in the set logger's
  component state, which unmounts when the section changes; Previous/Next did the same before this
  task. Lifting it would change set-logger ownership, which the brief says to preserve. TASK-027's
  cases therefore claim only that logged sets, statuses and the session clock survive a jump.
  Owner/UAT item.
- **Previous/Next focus an invisible heading.** Decision 2 covers jumps only, so Previous and Next
  still focus the section h2, now visually hidden: a sighted keyboard user sees no ring after
  them. `ui-polish-integrated.spec.ts` and `workout-footer-nav.test.tsx` assert that heading focus.
  Owner/UAT item: should Previous/Next also land on the first card?
- **Status visible only in the list.** As in the reference, the collapsed navigator shows the
  position (`2 / 4`) but not the open section's status word; status is in each chip (word in its
  name, glyph) and in the hidden reading. UAT item.
- **After a jump the navigator scrolls out of view** because focus scrolls the first card to the
  top of the region. UAT item.
- `label-content-name-mismatch` (axe experimental, off by default): the trigger's visible `2 / 4` is
  `aria-hidden`, so it is not in the button's name; the same position is read from the hidden
  `Section N / M · status` line.
- Specs that cannot run here, amended only where C54 supersedes them (owner decision 1):
  - `e2e/design-0143/workout-formats.spec.ts` (backend lane), lines 117–119: the
    `Structures in this section` `toContainText(badge)` became that list `toHaveCount(0)` plus
    `main .clr-movement-group-header__badge` `toHaveText([badge])` — each section there has one
    block, so its card names the same format word. Its heading and `Section N / M` checks are
    unchanged (the hidden h2 and line keep a 1px box, which Playwright counts as visible) — not run.
  - `e2e/ui-polish-b05-structure-badges.spec.ts`, case "Workout section header, BlockPanel and AMRAP
    badges hug their labels in row parents": expected consumers drop `SectionHeader` (line 613) and
    the record label drops it (line 620). Not runnable here: its file needs
    `../.evidence/TASK-027-a1/sources/…` (ENOENT). It also still expects pre-TASK-003 badge labels
    such as `AMRAP · 8 MIN · INVERSE`, so it was already stale before this task; not fixed here.
  - `e2e/design-0143/optional-feedback.spec.ts` line 178–179 and `e2e/ui-polish-integrated.spec.ts`
    (heading/position checks, Previous/Next heading focus): unchanged behaviour; not edited, not run.
- **TASK-009 browser failures are pre-existing.** `e2e/refinement/task-009.spec.ts` fails the same
  three cases ("one result group": two groups) on an unmodified detached worktree of `0060324`
  (run under the lock, then removed), so they are not caused by this change. Not TASK-027 scope;
  reported for the controller.

## Next action

Controller verification and commit. Owner/UAT items above (draft reset on jump, Previous/Next
focus, collapsed status, scroll after jump) and the TASK-009 base failures go to the controller.
