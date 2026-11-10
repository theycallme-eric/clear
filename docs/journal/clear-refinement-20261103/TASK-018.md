# TASK-018 — Contained scrolling without a lower gap, opening outline or scrollbar (#645)

Body `clear-refinement-v2-20261109b`, attempt 1, base `db98523` (after TASK-022 #699). This is the
task-owned progress note, the approved exception to the shared daily journal for this body. Only
TASK-018 writes this file.

## Intended outcome

REQ-018 (AC-C44-01, AC-C57-01, AC-C58-01, AC-C59-01, AC-R018-01–04; TASK-AC-D97C3E420929,
TASK-AC-15110DB92C86, TASK-AC-932FEEF54F21). Role: **foundation provider** for JOURNEY-018; no
completion ownership. Deliver the shared focused logging frame's contained viewport, continuous
frame, scrolling and focus/chrome contract, with focused representative-consumer tests at the
shared-component boundary:

- one stationary, continuous frame; only the inner region scrolls; Notes/Save reachable (C44);
- visible control strokes meet the inner lower border, chamfer clipping kept, no interior line (C57,
  P01);
- no automatic outline around the container on load/open/reopen; modal focus and intentional
  keyboard focus on controls kept (C58, P02);
- all scrollbar chrome hidden while wheel/touch/keyboard/focus scrolling work; no sideways overflow
  (C59, P03);
- height from the available viewport/safe-area/keyboard space, not the rejected half-height cap.

Not claimed: no logging route adopts the frame here. TASK-043–046 migrate the consumers; TASK-041
owns full-route geometry and JOURNEY-016/017/018 closure; TASK-016 owns the selected header,
backdrop and close behaviour; TASK-017 the group/label rhythm.

## Decisions (from the sources; recorded rather than asked)

- **The shared owner did not exist at this base.** `src/ui/refinements/logging-overlay.tsx` was read
  and deliberately not created by TASK-009/010/011 ("TASK-016–018 build it"). TASK-018 is the first
  of the three in dependency order (TASK-016 is blocked by TASK-018), so it **creates** it from the
  accepted reference (eded158c…), keeping the reference's structure: native `<dialog>` +
  `showModal()`, one `.clr-chamfer--lg` frame inside the bleed, one scroller holding the header and
  body, opening focus on the X, Echo exclusion, heading level 2. The header (title + `Close log` X)
  is kept because a modal needs an accessible name and a way out; its selected appearance, the
  Balanced backdrop (`--logging-backdrop-*`) and close semantics are TASK-016's acceptance and are
  not added here (the dialog uses Foundation's existing `.clr-dialog` backdrop until then).
- **Tokens** added to `tokens.css` (the reference's values): `--logging-dialog-width` (32rem — no
  Foundation width token exists), `--logging-viewport-gap` (`--spacing-800`),
  `--logging-inline-padding` (`--spacing-400`), `--logging-section-gap` (`--spacing-600`). Label,
  count and backdrop variables stay with TASK-016/017.
- **Keyboard space.** `100dvh` does not shrink for an on-screen keyboard in Chrome Android/iOS
  Safari (visual-viewport resize). The overlay keeps `--logging-visible-top/-height` on the dialog
  from `window.visualViewport` while open (removed on close); the recipe centres the frame in that
  box and caps it at `min(100dvh, visible height) − gap − safe areas`. No visual viewport → the
  dynamic viewport. A short form is as tall as its content (no height/min-height).
- **P01 inner chamfer.** The scroller sits on the ring's inner edge (frame padding = border width,
  scroller has no bottom padding) and is clipped with the same polygon Foundation gives
  `.clr-chamfer--lg::before`, so content is cut on the inner diagonal instead of painting over the
  stroke. Inside the frame the timed log's own top rule is removed (`.clr-accepted-log
  .clr-timed-log { border: 0; padding: 0 }`, the reference's rule), so no line crosses the form.
- **P02 diagnosis (Chromium 153, scratch probes, not committed).**
  - A plain page with a modal dialog: `showModal()` focuses the first focusable area in tree order,
    and an overflowing scroll region is keyboard-focusable **even with a button inside**; with nothing
    focusable the dialog itself is focused. Opened by keyboard both are `:focus-visible` with the
    UA ring `outline: auto rgb(0, 95, 204)` — a blue rounded outline round the whole container,
    matching R140's description. In the overlay the scroller wraps the header, so it precedes the X.
  - In the gallery, tapping/clicking blank space inside the frame focuses the `<dialog>`.
  - No Foundation focus rule covers a tabindex-less scroller or the dialog. With the overlay's
    container rule removed, a focus-visible scroller paints `auto rgb(0, 95, 204)`.
  - Latent second owner: Foundation's fallback chamfer ring `.clr-chamfer:has(:focus-visible)`
    doubles any chamfered element's border in the focus hue while a descendant is focus-visible. The
    app mounts `FocusBrackets` (brackets mode neutralises it), so it did not fire on the gallery
    route, but it would light the whole frame wherever brackets are not mounted.
  - Fix: opening focus moved to the X in the same layout effect as `showModal()` (before paint); no
    tabindex on dialog/frame/scroller/body; those containers get `outline: none`; the frame's
    chamfer ring is held at `--brd` by a more specific rule (0,3,1 vs Foundation's 0,2,1). Control
    focus indicators (brackets, Foundation outlines, field borders) are untouched.

- **No sideways scroll by construction, not by clipping.** The reference's scroller declared a
  horizontal `hidden`; `src/test/design-system-0.9.7.test.tsx` ("has no app-side horizontal reveal
  or constrained-input workaround") forbids any app-side horizontal overflow declaration, and it is
  not weakened. The scroller declares only vertical overflow; it and its body have `min-width: 0`
  and the logs wrap, so nothing is wider than the frame (browser probe: scroller and document
  horizontal overflow 0 at 320/390/1280).

## Changes

- New `src/ui/refinements/logging-overlay.tsx` (`LoggingOverlay`, `LOGGING_OVERLAY_CLOSE_LABEL`,
  `LOGGING_VISIBLE_TOP`, `LOGGING_VISIBLE_HEIGHT`).
- `src/ui/refinements/presentation.css`: the `.clr-accepted-log*` recipe (box, emission, frame,
  scroller, hidden scrollbars, container focus rules, header, body, timed-log rule inside).
- `src/ui/refinements/tokens.css`: four `--logging-*` variables.
- Gallery: new `?state=ladder-long` ("Long ladder results · final scrolling",
  `GalleryLadderLongResults`) — the shared overlay around the shared `TimedResultLog`'s twelve-round
  ladder log over the register's memory controller (`MemoryCompletionLog` gained an optional
  `ladderRounds`, default 4, so every existing specimen is unchanged). Closed on load; opener button;
  no Save, no writer. `?state=ladder` is unchanged: the route's ladder still logs inline in its card
  until TASK-046 moves it into the frame (disposition: no consumer adoption to show yet).
- Register: `LoggingOverlay` entry (REQ-018) with two specimens (long ladder, short EMOM);
  `docs/design/library/COMPONENTS.md` regenerated (`node scripts/gallery-index.mjs`).
- New `src/ui/logging-overlay.test.tsx` (9 cases) and `evidence/refinement/task-018/required-cases.json`.

## Sweep

`LoggingOverlay` and `.clr-accepted-log` are new; no route, spec or backend-lane spec
(`e2e/design-0143/*`, workout-lifecycle, task-040, core-loop, B05) references them, so none is
superseded or edited. No other task's check target was edited. Shared files touched minimally:
`gallery-registry.tsx` (one entry + import), `COMPONENTS.md` (one generated row), `tokens.css`.
`PROJECT_MAP.md` unchanged (no new directory or boundary).

## Verification

- `node scripts/refinement/run-required-check.mjs --task TASK-018 --check check-01 -- npx vitest run
  src/ui/logging-overlay.test.tsx --testNamePattern "scroll|outline|viewport" --passWithNoTests=false`
  — PASSED: 9 total, 9 executed, 9 passed (receipt `evidence/refinement/task-018/results/check-01.json`).
- `npm test` — 269 files, 6303 tests passed (after the correction below; the first run had 1 failure).
- `npm run lint:ds` — clean. `npm run build` — passed (`tsc --noEmit` and `vite build`).
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final
  --tasks TASK-001,…,TASK-015,TASK-018,TASK-022,TASK-030,TASK-031,TASK-032,TASK-034` — exit 1, only
  because TASK-015 check-02's committed receipt at the base is `rejected` (its run hit "localhost:5173
  is already used", zero cases executed). TASK-018 and every other listed task: current passing
  receipts. Not stale from this task (no TASK-015 target was touched); not re-run here because its
  journey cases need the controller-held test backend.
- Scratch Chromium probe of `/dev/gallery/refinements?state=ladder-long` (under the host lock; not a
  committed spec — TASK-041 owns route geometry), at 320×568, 390×664 and 1280×800, opened by pointer
  and by keyboard:
  - frame 20 px from top and bottom (the 40 px gap split), stationary while scrolling;
  - scroller bottom 2 px (the border width) above the frame's outer bottom, so content meets the
    inner border; strokes of the partly visible field run into the border in the middle capture;
  - scrollbar width 0, horizontal overflow 0 (scroller and document);
  - opening focus on `Close log` (focus-visible only when opened by keyboard), dialog/frame/scroller
    outline `none`, frame ring = its border colour after open, while a text field is focused and
    after reopen;
  - wheel reaches the end (`scrollTop == max`); Tab reaches the last control ("Too hard") and it is
    scrolled into view.
  - WebKit is not installed locally, so Safari/iOS overlay-scrollbar behaviour was not observed here.

## Failures and corrections

- First full `npm test` run: 1 failure, `design-system-0.9.7.test.tsx` › "has no app-side horizontal
  reveal or constrained-input workaround" — my recipe and test named the horizontal overflow
  property. Corrected as above (vertical overflow only, `min-width: 0`), the guard unchanged.
- First diagnosis guess (Foundation's chamfer ring) was incomplete: in the gallery the app runs in
  `FocusBrackets` mode, which already neutralises that ring. Probing a plain modal showed the real
  owner is the browser's default ring on the scroller/dialog focused by `showModal()` or a tap; the
  notes, code comments and the diagnosis test case were rewritten to record both owners.

## Open assumptions / items for later tasks

- TASK-016: header appearance, Balanced backdrop variables, close/cancel acceptance; the overlay's
  title duplicates the form's own "Log results" heading in the specimens until TASK-046 adopts the
  timed log into the frame (the reference hid the form's title when embedded).
- TASK-043–046: real entry points adopt `LoggingOverlay`; `set-logging-sheet.css` still has the
  rejected `max-height: 60dvh` sheet cap until TASK-043 migrates it.
- TASK-041: route geometry/scroll/focus proof on phones, including iOS keyboard behaviour.

## Next action

Controller verification (`npm ci`, check-01, build, lint:ds, test); re-run TASK-015 check-02 with the
test backend to restore its receipt.
