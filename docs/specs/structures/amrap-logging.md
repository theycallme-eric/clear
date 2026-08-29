# SESSION PLAN: AMRAP Post-Timer Logging

## Session Goal
When an AMRAP timer ends, surface a clear "rounds completed" input so the user can log their score immediately after finishing.

## Context
- **Reference:** `docs/specs/Clear_-_Structure_Types_Spec.md` (AMRAP section), `docs/specs/Clear_-_UI_Component_Spec.md` (AMRAP card layout)
- **Figma:** Check Workout Mode / AMRAP frames for any updated designs. If none exist, implement from this spec.
- **Skill:** Read `.claude/skills/chamfered-component.md` before touching card components.
- **Prior work:** The EMOM clarity session (SESSION_PLAN_emom_clarity.md) will have been completed first. Reference its patterns for minute indicator styling, timer behavior, and token usage — stay consistent.
- **Current state:** The AMRAP card works well as a glanceable countdown clock during execution. The collapsed view (exercise list + big timer) is correct for the "phone on the floor" use case. The gap is what happens AFTER the timer hits zero — there's no UI for logging `rounds_completed`, which is the entire point of an AMRAP.

## Design Principle for This Fix
**AMRAP is a low-touch-point structure.** The user sets the phone down, works until the buzzer, then picks it up to log. During execution, the phone is a passive clock. All interaction happens before (review exercises, set weights) and after (log rounds, add notes). Design accordingly — don't add mid-workout interactions.

## Tasks

### 1. AMRAP Completion State
**Do:** When the AMRAP timer reaches 0:00, transition the timer card from "running" state to "complete" state. The complete state replaces the countdown and Pause/Finish buttons with a results logging UI.

**Complete state layout:**
```
┌─────────────────────────────────────┐
│  AMRAP COMPLETE                     │
│                                     │
│  ┌─────────────────────────────┐   │
│  │        08:00 ✓              │   │  ← Final time (static, confirmed)
│  └─────────────────────────────┘   │
│                                     │
│  ROUNDS COMPLETED                   │
│  ┌──────┐  ┌──────┐  ┌──────┐     │
│  │  −   │  │  5   │  │  +   │     │  ← Stepper input (big touch targets)
│  └──────┘  └──────┘  └──────┘     │
│                                     │
│  + PARTIAL ROUND NOTES         │   │  ← Optional, collapsed by default
│                                     │
│  [exercises remain below, unchanged]│
└─────────────────────────────────────┘
```

**Implementation notes:**
- The round counter uses a stepper (−/+) rather than a text input. Sweaty hands, just picked up the phone. Big buttons > tiny keyboard.
- Stepper buttons: minimum 48px touch target, use `ChamferedFrame` or the existing button pattern
- Starting value: `0`. Min: `0`. No max (let the user enter what they did).
- The number display between the steppers should be large — same monospace font and size as the timer itself.
- Color for the number: `--text-timer` (lime/green-400) to match the timer aesthetic
- "AMRAP COMPLETE" header replaces the "AMRAP" label. Use `--text-color-header` token.
- The timer display switches from countdown to a static "08:00 ✓" showing total duration completed, using a muted style (reduce to `opacity-60` or use `--text-color-disabled`).

**Acceptance:**
- [ ] Timer reaching 0:00 triggers the completion state transition
- [ ] Stepper displays with −/+ buttons and round count
- [ ] Stepper buttons are ≥48px touch targets
- [ ] Round count starts at 0, cannot go below 0
- [ ] Number display uses monospace font and `--text-timer` color
- [ ] All tokens from design system, no hardcoded values

---

### 2. Partial Round Notes
**Do:** Below the stepper, add a collapsible "Partial round" text input for users who want to note how far they got into an incomplete final round (e.g., "+ 8 burpees into round 6").

**Behavior:**
- Collapsed by default — shows as a tappable `+ PARTIAL ROUND` link/button
- Tapping opens a single-line text input
- Placeholder text: `e.g., "+ 8 reps into next round"`
- This is optional and low-priority — most users will just log the round count and move on

**Style:** Use the same notes pattern that exists on exercise cards (the `NOTES: +` pattern visible in the current AMRAP expanded view). Stay consistent.

**Acceptance:**
- [ ] Collapsed by default, doesn't clutter the primary logging flow
- [ ] Expands to a text input on tap
- [ ] Matches existing notes UI pattern
- [ ] Input value is included when saving the structure result

---

### 3. Early Finish (Finish Button Before Timer Ends)
**Do:** If the user taps "Finish" before the timer hits zero, transition to the same completion state but show the actual elapsed time instead of the full duration.

**Example:** AMRAP was set for 8:00, user hits Finish at 5:23 → completion state shows `05:23` as the elapsed time, same stepper for rounds.

**Why this matters:** Sometimes a user needs to cut a section short. The logging experience should be the same regardless of whether the timer expired or was manually stopped.

**Acceptance:**
- [ ] Tapping Finish triggers the same completion UI as timer expiry
- [ ] Elapsed time displays correctly (not the original duration)
- [ ] Round stepper works identically in both cases

---

### 4. Persist Rounds to Structure Results
**Do:** When the user advances past the AMRAP section (via Next button), save the logged data to the `structure_results` record for this section.

**Data to save:**
```typescript
{
  structure_type: 'amrap',
  rounds_completed: number,       // From the stepper
  completion_time_seconds: number, // Elapsed time (full duration or early finish)
  notes: string | null,           // Partial round notes if entered
}
```

**Implementation notes:**
- Check how EMOM and For Time sections save their `structure_results` — follow the same pattern
- The save should happen on section advance (Next button), not on every stepper tap
- If the user goes Back and then Forward again, the previously entered round count should persist in local state

**Acceptance:**
- [ ] Round count persists to `structure_results` on section advance
- [ ] Partial round notes save if entered
- [ ] Elapsed time saves correctly for both timer-expiry and early-finish cases
- [ ] Data matches the `StructureResult` TypeScript type
- [ ] Going Back and returning preserves the entered values

---

## Design System Compliance
- Use CSS custom properties from `src/index.css`, not hardcoded hex values
- Follow existing component patterns — reference how the EMOM completion state was built (after that session is done)
- `ChamferedFrame` + `LeftColumn` for any card/button components that use chamfered corners
- Mobile-first: test on 375px viewport
- Touch targets: ≥48px for all interactive elements (especially the stepper buttons — these will be tapped with tired, sweaty hands)
- Typography: Rajdhani for labels, JetBrains Mono for the round number and timer, Inter for notes

## Files Likely Touched
- AMRAP timer component (wherever the AMRAP mode of `SectionTimer` lives)
- Workout mode state management (to hold `roundsCompleted` and wire it to save)
- Structure results save logic (wherever section completion data is persisted)
- Possibly shared completion UI if EMOM session created reusable patterns

## What NOT to Do
- Don't add mid-workout interactions (no "tap after each round" — the phone is on the floor)
- Don't change the AMRAP countdown/running state — it works fine as a passive clock
- Don't restructure exercise cards or the expand/collapse pattern
- Don't touch EMOM, For Time, or other structure types
- Don't add a "Complete Round" button during the timer — that's a high-touch pattern we explicitly rejected

## After Session (REQUIRED — you are not done until this is complete)
- [ ] Update SESSION_LOG.md with: Date, Tasks Completed, Files Touched
- [ ] Update PROJECT_MAP.md if any new components were created
- [ ] Mark completed items as `[x]` in BACKLOG.md
- [ ] Test: start an AMRAP, let timer run to 0, verify completion state appears with stepper
- [ ] Test: start an AMRAP, hit Finish early, verify elapsed time and stepper
- [ ] Test: log rounds, advance to next section, go back — verify data persists
- [ ] Confirm: "Session complete. Log and Backlog updated. Ready for next plan."
