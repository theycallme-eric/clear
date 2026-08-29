# SESSION PLAN: Superset & Circuit Clarity

## Session Goal
Make supersets and circuits visually and informationally distinct from each other, reduce noise in both card types, and ensure each communicates its execution model at a glance.

## Context
- **Reference:** `docs/specs/Clear_-_Structure_Types_Spec.md` (Superset + Circuit sections), `docs/specs/Clear_-_UI_Component_Spec.md` (card layouts)
- **Figma:** Check Workout Mode frames for superset and circuit cards. If Figma hasn't been updated for these changes, implement from this spec.
- **Skill:** Read `.claude/skills/chamfered-component.md` before modifying card internals.
- **Prior work:** The EMOM, AMRAP, and Ladder plans establish patterns for structure-level labels (`EACH ROUND:`, `EACH RUNG:`, `LADDER:`). This plan extends that pattern to circuits and introduces pairing language for supersets.
- **Current state:** Superset and circuit cards look nearly identical — same layout, same exercise list style, only the label text differs. Supersets show misleading per-exercise rest, redundant "SUPERSET" labeling, and a divider that fights the "paired unit" concept. Circuits show "Rest: 0s" noise and lack a clear round/sequence structure.

## Tasks

### 1. Superset — A1/A2 Pairing Labels
**Do:** Add `A1` and `A2` labels to superset exercises to communicate they're a paired unit.

**Layout change:**
```
Before:
  BARBELL BACK SQUAT                  ▼
  4 sets  6 reps  Tempo: 3-1-1
  Rest: 30s

After:
  A1  BARBELL BACK SQUAT              ▼
      4×6
  A2  BARBELL ROMANIAN DEADLIFT       ▼
      4×8
```

**A1/A2 label style:**
- Font: Rajdhani, uppercase, `text-xs`, bold
- Color: `--text-color-header` (blue-300)
- Position: inline, left of the exercise name, on the same line
- The label and exercise name should feel like one line: `A1  BARBELL BACK SQUAT`

**Acceptance:**
- [ ] First exercise in superset shows `A1`, second shows `A2`
- [ ] Labels use design tokens
- [ ] Labels appear in both collapsed and expanded states

---

### 2. Superset — Consolidate Rest Display
**Do:** Remove per-exercise rest from the collapsed state. Show rest once, after the second exercise, as a single line that applies to the pair.

**New rest display:**
```
  A1  BARBELL BACK SQUAT              ▼
      4×6
  A2  BARBELL ROMANIAN DEADLIFT       ▼
      4×8

  REST: 90s after both
```

**Rules:**
- The first exercise's rest value is ignored in display (it's the transition to A2 — there's no rest there by definition)
- The second exercise's rest value is shown as the pair rest: `REST: 90s after both`
- Style: `text-xs`, `--text-color-paragraph` (blue-100), Rajdhani
- If the second exercise has `rest: 0` or no rest, don't show a rest line at all

**In the expanded state:** Tempo and rest details can still appear per exercise for reference, but the collapsed view should be clean.

**Acceptance:**
- [ ] Collapsed state shows no per-exercise rest — only one shared rest line after A2
- [ ] "REST: 90s after both" renders below the second exercise
- [ ] Expanded state still shows full details (tempo, rest, cues) per exercise
- [ ] No "Rest: 0s" ever displays anywhere

---

### 3. Superset — Move Tempo to Expanded State
**Do:** In collapsed state, show only the essential execution info: exercise name and prescription. Move tempo and rest to the expanded (detail) view.

**Collapsed:** `A1  BARBELL BACK SQUAT · 4×6`
**Expanded:** Shows tempo, coaching cues, weight input, regression — all the detail

This reduces the cognitive load at a glance. During execution, you scan the card for "what exercise, how many." If you need tempo, you expand.

**Prescription format:** Combine sets and reps into a compact format: `4×6` or `4×8`. Drop the word "sets" and "reps" — the `×` notation is universally understood.

**Acceptance:**
- [ ] Collapsed state shows only: A-label, exercise name, sets×reps
- [ ] Tempo appears only in expanded state
- [ ] Prescription uses compact `4×6` format

---

### 4. Superset — Replace Divider with Side Connector
**Do:** Remove the horizontal divider line between the two superset exercises. Replace it with a vertical connector on the left side that spans both exercises, reinforcing that they're one linked unit.

**Implementation:**
- Remove the `<hr>` or border-bottom divider between A1 and A2
- Add a thin vertical line on the left side of the exercise list area that connects from A1 to A2
- Line style: 2px solid, `--border-cta-primary` (orange) or `--text-color-header` (blue-300) — use whichever feels right alongside the A1/A2 labels
- The line should NOT displace or shift the exercise text alignment. It runs in the existing left padding/margin space of the card. If the card already has a left accent bar (LeftColumn), the connector should be inset from that — a secondary visual element, not replacing the card-level accent.
- Keep vertical spacing between A1 and A2 tight — less gap than between separate sections, reinforcing the pairing

**Acceptance:**
- [ ] No horizontal divider between superset exercises
- [ ] Vertical connector line spans from A1 to A2 on the left side
- [ ] Exercise text alignment is unchanged
- [ ] Connector doesn't conflict with the card's LeftColumn accent bar
- [ ] Uses design tokens for the line color

---

### 5. Superset — Deduplicate Label
**Do:** The section header already says "PRIMARY SUPERSET" — the card-level "SUPERSET" label is redundant. Remove the card-level label.

The section header establishes the format. The card interior should focus on content (A1/A2, exercises, rest).

**Acceptance:**
- [ ] Card no longer shows "SUPERSET" label inside the card body
- [ ] Section header still shows the structure type (e.g., "PRIMARY SUPERSET")
- [ ] No loss of information — the format is still communicated via header + A1/A2 labels

---

### 6. Circuit — Add "EACH ROUND:" Label
**Do:** Add `EACH ROUND:` between the circuit header info and the exercise list. This is the same pattern used for AMRAP (from QUICK_FIX_amrap_round_label.md).

**Layout:**
```
  CIRCUIT · 3 ROUNDS

  EACH ROUND:
  1. DUMBBELL LATERAL RAISE            ▼
     12 reps
  2. CABLE FACE PULL                   ▼
     15 reps
  3. HAMMER CURL                       ▼
     10 each reps

  60s REST BETWEEN ROUNDS
```

**Style:** Same as AMRAP — Rajdhani, uppercase, `text-xs`, `--text-color-header` (blue-300)

**Only show when** there are 2+ exercises (always true for circuits by definition, but be safe).

**Acceptance:**
- [ ] `EACH ROUND:` label appears between the circuit header and exercise list
- [ ] Matches the AMRAP `EACH ROUND:` styling exactly
- [ ] Present on all circuit sections

---

### 7. Circuit — Number the Exercises
**Do:** Add sequence numbers to circuit exercises to reinforce the order of operations.

**Format:** `1.` `2.` `3.` etc., inline with the exercise name.

```
  1. DUMBBELL LATERAL RAISE
  2. CABLE FACE PULL
  3. HAMMER CURL
```

**Style:**
- Number: Rajdhani, `text-xs`, `--text-color-header` (blue-300) — same weight as the A1/A2 superset labels for consistency
- Position: inline, left of exercise name, same line

**Acceptance:**
- [ ] Exercises are numbered sequentially starting at 1
- [ ] Numbers appear in both collapsed and expanded states
- [ ] Style is consistent with superset A1/A2 label treatment

---

### 8. Circuit — Clean Up Rest Display
**Do:** Remove all per-exercise rest noise. Show rest once at the bottom as a single line about round rest.

**Rules:**
- Remove `Rest: 0s` from all exercises — if rest is 0, show nothing
- Remove per-exercise rest from collapsed state entirely
- Add a single line at the bottom of the exercise list: `60s REST BETWEEN ROUNDS`
- Only show this if rest > 0. If there's truly no rest between rounds, don't show a rest line.
- The rest value comes from the last exercise in the circuit (which is where the round rest lives in the data model)

**Style:** Same as the superset rest line — `text-xs`, `--text-color-paragraph` (blue-100), Rajdhani

**In expanded state:** Per-exercise rest can still appear if it's > 0 (some circuits have staggered rest). But `Rest: 0s` should never render.

**Acceptance:**
- [ ] No "Rest: 0s" displays anywhere, ever
- [ ] Collapsed state shows one rest line at bottom: `Xs REST BETWEEN ROUNDS`
- [ ] Rest line only appears if rest > 0
- [ ] Expanded state shows per-exercise rest only if > 0

---

### 9. Circuit — Compact Prescription (Match Superset)
**Do:** Same as the superset change — collapsed state shows only exercise name and reps in a compact format. No "Rest: 0s" clutter.

**Collapsed:** `1. DUMBBELL LATERAL RAISE · 12 reps`
**Expanded:** Full details (rest if applicable, coaching cues, weight input)

For circuits, the prescription is typically just reps (no sets — sets = rounds, handled at the section level). So the format is simpler: `12 reps` or `10 each reps`.

**Acceptance:**
- [ ] Collapsed circuit exercises show only: number, name, reps
- [ ] No rest, tempo, or other metadata in collapsed state
- [ ] Expanded state shows full details
- [ ] Consistent with superset collapsed treatment

---

## Design System Compliance
- Use CSS custom properties from `src/index.css`, no hardcoded values
- No rounded corners — all corners are sharp (90°) or chamfered
- Follow ChamferedFrame + LeftColumn patterns for card-level elements
- The vertical connector (Task 4) is a new visual element — keep it simple, use an existing border token
- Mobile-first: test at 375px
- Touch targets: ≥44px for expand/collapse areas
- Typography: Rajdhani for labels/headers, Inter for body

## Files Likely Touched
- Superset card component
- Circuit card component
- Exercise card component (collapsed state changes)
- Possibly shared exercise list renderer (if supersets and circuits share one)

## What NOT to Do
- Don't change the card container styling (LeftColumn, ChamferedFrame, borders)
- Don't touch EMOM, AMRAP, For Time, or Standard exercise rendering
- Don't add new interactive elements — these are display/clarity changes only
- Don't change how exercise data is stored or generated

## After Session (REQUIRED — you are not done until this is complete)
- [ ] Update SESSION_LOG.md with: Date, Tasks Completed, Files Touched
- [ ] Update PROJECT_MAP.md if component structure changed
- [ ] Mark completed items as `[x]` in BACKLOG.md
- [ ] Test: Superset shows A1/A2, no divider, vertical connector, consolidated rest, compact collapsed state
- [ ] Test: Circuit shows numbered exercises, EACH ROUND label, single rest line, compact collapsed state
- [ ] Test: Supersets and circuits look meaningfully different from each other at a glance
- [ ] Test: Expanding exercises still shows full detail (tempo, cues, weight, rest)
- [ ] Confirm: "Session complete. Log and Backlog updated. Ready for next plan."
