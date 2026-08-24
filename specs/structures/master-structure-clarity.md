# MASTER SESSION: Workout Mode Structure Clarity

## Overview
This session covers three sequential plans that improve how timed workout structures communicate to the user during execution. Complete them **in order** — each builds on patterns established by the previous.

**Plan 1:** EMOM Clarity → minute indicator, active exercise highlighting, minute labels, timer color
**Plan 2:** AMRAP Logging → post-timer round stepper, partial notes, early finish, persistence
**Plan 3:** Ladder For Time → rep scheme display, LadderRungs component, completion paths, prompt update

---

## Before Starting

Read these files to understand the full context:
- `docs/specs/Clear_-_Structure_Types_Spec.md`
- `docs/specs/Clear_-_UI_Component_Spec.md`
- `docs/specs/Clear_-_Workout_Generation_Prompt_v2.md`
- `.claude/skills/chamfered-component.md`
- `src/index.css` (design tokens)

Then read **SESSION_PLAN_emom_clarity.md** in full before writing any code.

---

## Plan 1: EMOM Clarity

Execute all tasks in `SESSION_PLAN_emom_clarity.md`:
1. Add minute indicator (`MIN X OF Y`)
2. Highlight active exercise, dim inactive
3. Add minute assignment labels (`ODD MIN` / `EVEN MIN`)
4. Timer color — make it meaningful or remove the change

### After Plan 1
- [ ] Run `npm run dev` and test with an EMOM section
- [ ] Verify: minute indicator updates every 60 seconds
- [ ] Verify: active exercise highlights, inactive dims
- [ ] Verify: minute labels show on 2+ exercise EMOMs, hidden on single-exercise
- [ ] Verify: timer color behavior is intentional
- [ ] Update SESSION_LOG.md
- [ ] Update PROJECT_MAP.md if new components were created
- [ ] Update BACKLOG.md

### ⏸️ PAUSE — Check in with the user before continuing.
Say: "Plan 1 (EMOM Clarity) is complete. Here's what was done: [summary of changes, files touched, any decisions made]. Ready to proceed to Plan 2 (AMRAP Logging)?"

Wait for confirmation before continuing.

---

## Plan 2: AMRAP Logging

Read **SESSION_PLAN_amrap_logging.md** in full. Reference the patterns you just built in Plan 1 — specifically timer state management and token usage. Stay consistent.

Execute all tasks:
1. AMRAP completion state with round stepper (−/+ buttons, ≥48px touch targets)
2. Partial round notes (collapsed by default)
3. Early finish path (same UI whether timer expired or manually stopped)
4. Persist rounds to structure_results

**Key design principle to remember:** AMRAP is low-touch. The phone is on the floor during execution. No mid-workout interactions. All logging happens after the timer ends.

### After Plan 2
- [ ] Run `npm run dev` and test with an AMRAP section
- [ ] Verify: timer hitting 0 shows completion state with stepper
- [ ] Verify: stepper buttons are large and work (increment/decrement)
- [ ] Verify: early finish (tap Finish before timer) shows same UI with elapsed time
- [ ] Verify: round count persists when navigating Back then Forward
- [ ] Verify: data saves to structure_results on section advance
- [ ] Update SESSION_LOG.md
- [ ] Update PROJECT_MAP.md if new components were created
- [ ] Update BACKLOG.md

### ⏸️ PAUSE — Check in with the user before continuing.
Say: "Plan 2 (AMRAP Logging) is complete. Here's what was done: [summary of changes, files touched, any decisions made]. Ready to proceed to Plan 3 (Ladder For Time)?"

Wait for confirmation before continuing.

---

## Plan 3: Ladder For Time

Read **SESSION_PLAN_ladder_for_time.md** in full. Reference patterns from both Plan 1 and Plan 2 — specifically the AMRAP completion state (Plan 2) for the two completion paths, and token/component patterns from Plan 1.

Execute all tasks:
1. Restructure ladder card layout (rep scheme shown once, exercises listed clean)
2. Build LadderRungs component (chamfered rung cards, read-only + interactive modes)
3. Two completion paths (finished under cap vs. cap reached with rung selector)
4. Add fixed-interval ladder to generation prompt
5. Persist ladder results to structure_results

**Key things to remember:**
- LadderRungs uses ChamferedFrame — read the skill file
- Tap a rung → it highlights lime, everything before it fills as completed
- Max 11 rungs assumed, horizontal scroll if needed
- The fixed-interval prompt update touches the edge function AND spec docs

### After Plan 3
- [ ] Run `npm run dev` and test with a Ladder For Time section
- [ ] Verify: rep scheme displays once above exercise list, not repeated per exercise
- [ ] Verify: LadderRungs renders in read-only mode during workout
- [ ] Verify: completing before cap → all rungs fill, time saved
- [ ] Verify: cap reached → interactive rung selector appears
- [ ] Verify: tapping a rung fills all preceding rungs
- [ ] Verify: data persists correctly (highest_rung, completed_under_cap, rep_scheme)
- [ ] Verify: non-ladder For Time sections are unaffected
- [ ] Test generation prompt: request a ladder workout, verify output format
- [ ] Update SESSION_LOG.md
- [ ] Update PROJECT_MAP.md (LadderRungs component added)
- [ ] Update BACKLOG.md

---

## Final Wrap-Up

After all three plans are complete:

1. Do a final `npm run dev` and walk through a full workout that includes EMOM, AMRAP, and For Time (ladder) sections. Verify everything works together.

2. Write a single SESSION_LOG.md entry that covers the full master session:
   - Date
   - Plans completed (all 3)
   - All files created or modified
   - Any architectural decisions made
   - Any issues found or follow-up items

3. Confirm: "All three plans complete. Session log updated. Ready for next plan."
