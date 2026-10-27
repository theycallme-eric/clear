# TASK-005 — Pre-start Review equipment, actions and grouped sequences

Issue #525 · REQ-006, REQ-007 · role: completion-owner for JOURNEY-005.
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

On the pre-start Review screen (`src/app/Review.tsx`): required equipment near the top before Start,
with no generated overview or section-introduction prose brought back. Start stays pinned and
Regenerate moves to the end of the scrolling content. Superset and circuit groups show as numbered
one-round sequences: a structure-badge heading with the round count, the line
`One round: 01 → 02 …`, movement → prescription → equipment rows, the blue rest reading at the end
of the group, no rule after the last movement, and no repeat description. Equipment-specific glyphs
are out of scope and not added.

## What changed (local, unpublished)

- `src/state/review.ts`: `ReviewBriefing.equipment`, which lists each piece of equipment once in
  first-use order, with bodyweight/none excluded. Also `ReviewBlockView.roundSequence` (superset and
  circuit only), `ReviewExerciseView.roundTarget` (one round's target when the group states its
  rounds), and the `sequenceOrdinal` / `roundSequenceText` helpers.
- `src/app/Review.tsx`:
  - Overview card: a "Required equipment" list, or "None — bodyweight only".
  - Footer: holds Start only.
  - Regenerate: a secondary `ActionRow` at the end of the content stack. The confirm dialog and
    `onRegenerate` are unchanged.
  - Grouped rows: numbered `01`, `02`, and split into three tiers.
  - Rules: drawn between group members, never after the last one.
  - Round rest: closes the group, in `--text-card-header` (interaction blue) with the `Rest` glyph.
- New `src/app/review-screen.test.tsx`: 16 tests, one `describe` per criterion AC-019…AC-024.
- `src/app/Review.test.tsx`: 7 existing tests updated for the new footer, numbering, rest
  position and notes policy.
- Nothing changed in GitHub or any external service. The vendored design system is untouched.

## Assumption to review: superset/circuit block notes

"After the full sequence, then repeat" does not occur anywhere in product code or history. It comes
from generated `block_notes`: the prompt allows block notes only for execution instructions, and for
a superset or circuit that instruction is exactly what the sequence line and rest now say.
**Superset/circuit groups therefore no longer render `block_notes`.** Standard and timed blocks still
do, and the persisted payload is unchanged. A side effect: a coaching note on a circuit, such as the
fixture's "Build then come back down.", is no longer shown on Review. If the owner wants coaching
notes kept on these groups, the alternative is to render them while filtering the round
instruction. That means parsing generated prose, which this repo avoids.

## Verification (2026-10-27)

| Command | Result |
| --- | --- |
| `npm test -- review-screen` | pass, 16/16 |
| `npm run typecheck` | pass |
| `npm run lint` | pass, 0 errors (133 warnings, none in changed files) |
| `npm run lint:ds` | pass |
| `npm run build` | pass (existing chunk-size warning) |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass |
| `npm test` | **fail**: 2 of 5568, both in `src/test/design-0143-final-audit.test.ts` |

The first full run also failed 7 `Review.test.tsx` tests that asserted the old layout (two-button
footer, `1.` numbering, rest directly after the badge, circuit note shown, and no `<p>` in the
overview). After updating them, and changing the equipment label from `<p>` to `<span>`, they pass.

## Blocker: runtime-source-bound audit evidence

These are the same two failures TASK-006 recorded. The audit names a runtime source hash, and any
runtime source change moves it. This tree hashes to `70cfd016…`. Refreshing the audit means
re-running the TASK-034 mobile format-preview capture on a committed candidate with an
authenticated-session backend. This worker has no such backend, and editing the hash without a
capture would fabricate evidence.

`git fetch origin main` was not permitted in this worker, so integration with current `main` was not
done here.

## Next safe action

The controller or a credentialed lane should:

1. Commit this diff.
2. Integrate current `origin/main`.
3. Re-run the TASK-034 mobile capture on that commit and re-derive the audit runtime hash and
   lineage, as `b3ff59e` / `3a4c281` did.
4. Re-run `npm test`.

Separately, the owner should confirm the block-notes assumption above.

## Operator review correction and current next action

The block-notes assumption above is superseded by the approved scope. Only the redundant repeat
description is removed; legitimate existing execution instructions must remain. The view model now
filters only the complete known sentence "After the full sequence, then repeat", retaining adjacent
instructions and all other freeform wording. Standard/timed notes, persisted payloads, omitted
overview/section introductions and the rest of the layout remain intact. Existing coaching-note
assertions were restored and six focused regressions cover necessary instructions, combined
sentences/newlines and unrelated repeat wording. 139 focused tests across Review, review-screen
and review state passed, as did typecheck/diff checks.

The existing current-version mobile Review journey's01/02 expectations now follow the approved
numbering, preserving group order/count/rest assertions. Its lifecycle narrative correctly states
that Start is pinned and Regenerate ends the scroller. The vendored DS diff is empty.

No owner reinterview or origin/main integration is needed for this correction. The approved build
base is3a4c28168a834cb6f252d57239e39cd88969a18c. Initial native50767 returned exit1 solely on the
two stale source-bound audit checks, after the worker succeeded and16 native task tests passed;
that history and attempt1/max2 remain intact. Next: commit this corrected source, execute genuine
mobile browser proof against the owned disposable local backend, then native full recovery and
protected build-branch delivery. No success is claimed until those actual outcomes.

## Actual operator browser proof

Foreground63900 returned exit0: five existing mobile cases passed (27.5s), comprising the four-skin
format-preview collector/eight phone-short captures plus the current-version REQ-011 grouped Review
to Workout journey. Actual source `b1c15ee580008b99c2e98f8a9c5552cf497696ef`, runtime `68a768f5944d3fe39312fbe61a5e1d62aad0a384ad37ba6527a6294868e31455`.
New group `docs/design/evidence-0143/task034-format-preview-ui-polish-task005` holds actual records/PNGs and unchanged-format native input provenance;
payload SHA256 `9477316b4f19c4d51d65cd4a0b2d6686d8738c64e8d95a71f9d033043f845107`. Preview walk made zero generation/preview writes. Review fixture
setup and normal Start/session writes were confined to the owned disposable local database; model
forwarding stayed blocked. Historical captures remain intact. Native recovery and delivery still
pending; no task completion is claimed here.

The actual existing audit consumer passed all38 checks on the genuine new group, and its independently computed payload digest matches provenance. Owned backend stop94793 returned exit0. Native full recovery is next.
