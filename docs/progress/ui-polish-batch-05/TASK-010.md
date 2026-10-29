# TASK-010 — Review grouping hierarchy through the shared ReviewExerciseRow

Issue #568 · REQ-009 · AC-027 / AC-028 / AC-029 / AC-064 · JOURNEY-007 (completion owner, ENTRY-010 Review).
Run `51fdc2db-4908-4b55-9b22-ec6df56ac3f9`, attempt 1, branch `agent-runner/task-010-a1-51fdc2db`,
base `9eceed0566e41db2390e9b2d62d4635e2361a4db` (TASK-012 merge, after TASK-008 and TASK-009).
This task-owned record replaces the shared daily journal under the approved body exception.

## Intended outcome and reference

I opened B05-04 (`sources/source-07-B05-04-review-grouping.jpg`, SHA-256
`c1ddd3384b41d6b3a5d053633df2d779c1a2c3272e183d68ec933bfb1cb948ac`, 2168 × 846). I read DECISIONS,
GLOBAL-PATTERNS, VISUAL-REFERENCE §B05-04, the CODE-REFERENCES "Review hierarchy" row and the
`GroupRows` preview excerpt (supporting only).

- **Selected region:** right pane, x 1462–2122, y 192–782. This is the CONDITIONING circuit's movement list
  below its badge. Each movement has:
  - a bold name row, with SWAP at the right end of that row;
  - a lighter prescription row;
  - an equipment row.

  One "Rest 60 sec between rounds" line closes the group.
- **Control region:** left pane, x 92–672, y 220–720. This is the current design:
  - name and prescription share one line;
  - every movement repeats "Bodyweight Bodyweight Rest 60s";
  - SWAP sits under each movement, at the left.
- **The reference's skin is Vapour:** purple structure, teal action colour, white names. Its names use
  heading ink rather than the action-tinted card-header colour that the current pane uses.

No owner conflict was found. As VISUAL-REFERENCE requires, I kept the numbered one-round
semantics, structure glyphs and final-divider removal that the right-pane mockup omits. Demo
names and counts were not copied.

## Change

`src/app/Review.tsx` — `ReviewExerciseRow`, the shared row used by every Review block, now renders:

1. **The name row.** The ordinal (`01`) has its own column. The name is display face,
   `--heading-h5`, bold, uppercase, `--ink`. A long name wraps under itself, not under the ordinal.
   `ExerciseSwapControls` sits at the row's trailing end (max 50 %). Its 40 px target is centred on
   the name's first line by a token `calc`. The row's `--spacing-200` gap clears the target's
   overhang.
2. **The prescription row.** A separate `<p>`, data face at `--label-md`, `--text-paragraph`.
3. **The equipment row.** Unchanged style (`--label-xs`, `--text-secondary`). It is followed by the
   unchanged load-suggestion button.

In a superset or circuit (`roundSequence !== null`), the row no longer prints:

- **the movement's own rest.** The group rests once, after the round. This matches what
  `SupersetBlock`/`CircuitBlock` actually run (block `round_rest_seconds`; there is no rest between
  members).
- **a `Bodyweight` load that only repeats the equipment.**

A real load, such as `16 kg` or `24 kg`, stays. The group's existing round-rest line — blue, with
the Rest glyph, after the list — is now the only rest in the group. Standard blocks keep their
per-movement rest and load. The view model (`src/state/review.ts`), prescription, round, equipment
and swap behaviour are unchanged.

`src/ui/exercise-swap.tsx` — `ACTIONS_STYLE` adds `justifyContent: 'flex-end'`, so Swap and Undo
close the name row. Review is its only consumer.

Nothing else changed: vendor files, the TASK-009 badge owner (`workout-chrome.tsx`), other screens
and the scoped exceptions. No Swap control was added anywhere.

## Failures and corrections during the work

- **First render.** The name used `--text-card-header`. In CLEAR that is the same blue-green family
  as the Swap action. Long names put the ordinal alone on the first line, so Swap aligned with a
  bare `02`. **Fix:** give the ordinal its own column, and use `--ink` for the name, as B05-04 does.
- **Overlap.** Swap's 40 px target overhung the 24 px name line by 6 px into the prescription box.
  The DOM overlap check caught it. **Fix:** a row gap of `--spacing-200`.
- **Spec capture (spec fault, not a product fault).** `page.screenshot({clip})` was clipped by the
  Review scroll viewport and covered by the pinned Start footer, which hid the top of tall groups
  and the rest line. **Fix:** capture in a 2400 px-tall window of the same width, so wrapping is
  identical, then restore the phone viewport. The geometry is still measured at the real viewport.
- **Pixel classifier (spec fault).** These signals were misread or too weak:
  - In Vapour, the group's rest line and the prescription are tinted with the action colour, so they
    were read as a Swap and as missing text.
  - Stroke alone separated the name from the prescription by only about 18 %.

  **Fix:** action ink is right-half colour with nothing in that row's leading quarter. Text excludes
  only that action ink. A line's weight is mean stroke × dense-glyph height.
- **Harness rule.** `src/test/e2e-harness.test.ts` forbids `page.goto(`. I had used it to open a blank
  page for the reference analysis. Removed: the fixture page is already blank.
- **Not run: negative control on the pre-change source.** The sandbox refused swapping sources
  (`git checkout HEAD -- …` needed approval and did not run), so the working tree was not changed.
  The comparison's discrimination is shown in-spec instead: the B05-04 current pane fails the Swap
  placement reading.

## Verification (final tree, base `9eceed0` + this task's uncommitted changes)

**Browser spec:** `npx playwright test e2e/ui-polish-b05-review-groups.spec.ts --project=mobile` →
**5 passed (20.2 s), exit 0.**

- It renders the production `/review` route on its own synthetic Vite origin (`*.supabase.invalid`).
  Reads are intercepted, and the run has zero writes, function posts and model generations
  (`assertReadOnly`). Axe runs on entry through the `visit` fixture.
- **Matrix:** 390 × 844 and 320 × 568 × {Vapour, CLEAR} × {pictured, multi-line} × {superset 3 rounds
  with a real load, circuit 2 rounds bodyweight}. That is 16 recorded cases.
- **Fixture states:**
  - *pictured* uses short names.
  - *multi-line* wraps names to 2–4 lines in both structures (`single arm kettlebell overhead reverse
    lunge`, `lateral bear crawl with shoulder tap`, …).
- **Per group, from the DOM:**
  - **badge:** glyph present, wrapper = frame ±1 px, narrower than the group (TASK-009 contract);
  - **sequence:** the exact `One round: 01 → …` line;
  - **rest:** one `Rest Ns` in the whole group — the last child, below the list, with its glyph.
    No movement has a rest, and no movement has more than one "bodyweight";
  - **ordinals:** `01`, `02`, `03`, each in its own column beside the name's first line;
  - **dividers:** a rule after every member except the last;
  - **type scale:** name font > prescription > equipment; name weight ≥ 600; name colour ≠ Swap
    colour;
  - **order:** prescription below both the name and Swap; equipment below the prescription;
  - **Swap position:** Swap right of the name, within 8 px of the list's right edge, centred on the
    name's first line (±2 px), and every Swap in the group on one right edge;
  - **collisions:** none between name, Swap, prescription and equipment;
  - **multi-line:** at least one name spans 2 or more lines.
- **Visual comparison (AC-064):** the same in-browser pixel reading runs on the reference regions and
  on each actual capture (deviceScaleFactor 3). The reading checks:
  - one Swap band per movement;
  - Swap ink confined to the right (left ≥ 0.55 W, right ≥ 0.85 W);
  - Swap beside the name band;
  - the name dominant over the lines below it, with wrapped lines kept together;
  - at least two subordinate lines (prescription, equipment) below.

  The selected pane passes all five readings. The current pane fails Swap placement. All 16 captures
  equal the selected pane's verdicts, and multi-line captures show 2 or more name lines in pixels.
- **Swap behaviour:** the right-aligned Swap opens the real swap dialog, with a synthetic empty
  candidate read. Escape closes it.

Capture identity: source head `9eceed0566e41db2390e9b2d62d4635e2361a4db`, dirty `true` (this task's
uncommitted change), working `src/app/Review.tsx` SHA-256
`755e2c3fd26c7f4e2017629b4a6565f6d2baec9870cccd715269d0fca3cbc5ea`. Mobile project (Pixel 5 Chromium
emulation, DSF 3). Every case's JSON record holds:

- the reference file, hash and regions;
- the route, skin and viewport;
- the DOM measurements;
- both pixel readings;
- per-criterion results;
- the list and group PNG digests.

List-capture SHA-256 by case:

| Case | Vapour | CLEAR |
| --- | --- | --- |
| pictured superset 390 | `054191f9…bade8` | `48768946…795d` |
| pictured circuit 390 | `81653b88…f281` | `2f49076a…1897` |
| multi-line superset 390 | `a6a6dee6…5f47` | `a942636a…ee3f` |
| multi-line circuit 390 | `3294c9b5…6c8b` | `d7ba6a65…089e` |
| pictured superset 320 | `5801c3da…4313` | `08faf8aa…acab` |
| pictured circuit 320 | `d980cb56…3fcc` | `ab425b41…0917` |
| multi-line superset 320 | `001eb3f8…9dc8` | `a6367d2c…ede2` |
| multi-line circuit 320 | `37b0c63d…7178` | `1ffe15f6…33db` |

The captures were also reviewed by eye. Examples are the Vapour pictured superset at 390 and the
CLEAR multi-line circuit at 320. They show B05-04's selected layout with the preserved ordinals,
glyph badge, sequence line and missing final divider.

### Other commands

| Command | Result |
| --- | --- |
| `npx vitest run src/app/review-screen.test.tsx` | **30 passed**, exit 0 (5 new REQ-009 cases + 25 existing) |
| `npm run lint:ds` | exit 0 |
| `npm run lint` | exit 0 (warnings only, all in files this task did not touch) |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 (existing chunk-size warning) |
| `npm run gen:types -- --check` | exit 0, types current |
| `python3 scripts/gen-issues.py --check` | exit 0 (71 requirements, 136 edges) |
| `npm test` | **exit 1: 2 failed / 5,850 passed** (237 files) — both in `src/test/design-0143-final-audit.test.ts` (see below) |

## Unresolved: the 0.14.3 final-audit binding (same as TASK-004 … TASK-012)

`design-0143-final-audit.test.ts` binds `docs/design/CLEAR-0.14.3-FINAL-AUDIT.md` and the TASK-034
format-preview evidence group to a hash of runtime `src/`. This task's runtime change therefore
fails two checks:

- "is bound to the package and runtime source of this tree…";
- "requires the complete actual eight-cell mobile group…".

Clearing them needs the existing authenticated collector, `e2e/design-0143/format-preview.spec.ts`,
run against an owned disposable local backend. This worker boundary cannot run that, and writing
a new hash without a genuine recapture would certify evidence that does not exist. So it was not
done.

**Next safe action:** the controller freezes this source and runs the existing recapture, as for
earlier batch tasks. That produces a new group, `task034-format-preview-batch05-task010`, the
`format-preview-evidence.ts` pointer, lineage (TASK-010 / run `51fdc2db-…` / attempt 1 / tested base
`9eceed0`) and the audit rebind. Then rerun `npm test`.

## Still pending

- Physical-iPhone UAT of the grouped Review hierarchy has not been observed.
- Native controller verification, recapture/rebind and delivery have not happened.
