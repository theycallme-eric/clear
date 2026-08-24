# SESSION PLAN: EMOM Workout Mode — Clarity Fix

## Session Goal
Make the EMOM section in Workout Mode (Screen 3) instantly communicate which exercise is active on the current minute, without requiring the user to think or expand cards.

## Context
- **Reference:** `docs/specs/Clear_-_Structure_Types_Spec.md` (EMOM section), `docs/specs/Clear_-_UI_Component_Spec.md` (EMOM card layout)
- **Figma:** Check the Workout Mode / EMOM section frames for any updated designs. If no Figma updates exist, implement from this spec.
- **Skill:** Read `.claude/skills/chamfered-component.md` before touching any card components. Read `.claude/skills/figma-ui-implementer.md` if checking Figma.
- **Current state:** EMOM sections render exercises as a flat list inside a timed card. There is no minute indicator, no visual distinction between active/inactive exercises, and no labeling of the alternation pattern. The timer color changes (green → magenta) but this meaning is unexplained. See the two attached screenshots for reference of the current broken state.

## Problem Statement
In an alternating EMOM (e.g., 10 min: odd minutes = Hollow Body Hold, even minutes = V-Up), the current UI fails to communicate:
1. **Which minute you're on** — no "Minute 4 of 10" indicator exists
2. **Which exercise is active NOW** — both exercises appear equal; nothing highlights the current one
3. **The alternation pattern** — nothing tells the user these exercises rotate by minute vs. being done simultaneously

This is a usability failure in a sweaty-hands, quick-glance context. The user should never have to think about what to do next.

## Tasks

### 1. Add Minute Indicator to EMOM Timer
**Do:** Inside the EMOM timer card, add a line showing the current minute out of total. Format: `MIN 4 OF 10`. This should sit directly below the countdown timer, above the Pause/Finish buttons. Use the same monospace font as the timer (`font-mono` / JetBrains Mono). Use `--text-timer` token color (lime/green-400).

**Implementation notes:**
- The EMOM timer already tracks total minutes (from `structure.minutes`). You need to derive `currentMinute` from elapsed time: `currentMinute = Math.floor(elapsedSeconds / 60) + 1`
- Expose `currentMinute` and `totalMinutes` as state that sibling components can read (either via props drilling or the existing workout context/state)

**Acceptance:**
- [ ] "MIN X OF Y" displays below the timer and updates every 60 seconds
- [ ] Minute 1 shows on start, increments correctly
- [ ] Uses `--text-timer` color token and monospace font
- [ ] Does not appear for non-EMOM timed sections (AMRAP, For Time)

---

### 2. Highlight Active Exercise, Dim Inactive
**Do:** For alternating EMOMs (2+ exercises), visually distinguish the active exercise from inactive ones based on the current minute.

**Active exercise treatment:**
- Full opacity (opacity-100)
- Left border accent: 2px solid using `--border-cta-primary` (orange) — or if using `LeftColumn`, set accent to orange
- Exercise name color: `--text-color-header` (full brightness)

**Inactive exercise treatment:**
- Reduced opacity: `opacity-40`
- No left border accent (or neutral/dim border)
- Exercise name color: `--text-color-disabled` (neutral-400)

**Logic for determining active exercise:**
```typescript
// For alternating EMOM with N exercises:
const activeExerciseIndex = (currentMinute - 1) % exercises.length;
```

This works for 2-exercise alternating (odd/even) and 3+ exercise rotating EMOMs.

**Acceptance:**
- [ ] On odd minutes, exercise 0 is highlighted and exercise 1 is dimmed
- [ ] On even minutes, exercise 1 is highlighted and exercise 0 is dimmed
- [ ] Transition between active/inactive is immediate (on minute change), no animation needed
- [ ] Works for 2-exercise and 3-exercise EMOMs
- [ ] Collapsed AND expanded states both show the active/inactive distinction
- [ ] Uses design tokens, no hardcoded colors

---

### 3. Add Minute Assignment Labels
**Do:** Add a small label/badge above or to the right of each exercise name showing which minutes it covers. This makes the alternation pattern self-documenting.

**For 2-exercise alternating EMOM:**
- Exercise 0: label reads `ODD MIN` (or `MIN 1, 3, 5...`)
- Exercise 1: label reads `EVEN MIN` (or `MIN 2, 4, 6...`)

**For 3+ exercise rotating EMOM:**
- Exercise 0: `MIN 1, 4, 7...`
- Exercise 1: `MIN 2, 5, 8...`
- Exercise 2: `MIN 3, 6, 9...`

**For single-exercise EMOM (every minute is the same):**
- No label needed — skip this entirely

**Style:** Small caps text, `text-xs`, color `--text-color-paragraph` (blue-100). Position it on the same line as the exercise name, right-aligned. Or as a subtle badge left of the exercise name — use your judgment for what fits the existing card layout.

**Acceptance:**
- [ ] 2-exercise EMOM shows "ODD MIN" / "EVEN MIN" labels
- [ ] 3+ exercise EMOM shows minute number patterns
- [ ] Single-exercise EMOM shows no labels
- [ ] Labels use design tokens
- [ ] Labels are visible in both collapsed and expanded card states

---

### 4. Timer Color — Document or Remove
**Do:** The EMOM timer currently changes color (green → magenta/rose) but this is unexplained. Pick ONE approach:

**Option A (preferred):** Make the timer color meaningful. Use green (`--text-timer` / green-400) for the first half of each minute (user should be working) and switch to rose/magenta (`--surface-intensity-high` / rose-500) in the final 10 seconds of each minute as a "wrap it up" warning. This gives the color change a clear purpose.

**Option B:** Remove the color change entirely. Keep the timer consistently green (`--text-timer`).

Do NOT leave the current state where the color changes without explanation.

**Acceptance:**
- [ ] Timer color behavior is intentional and documented in a code comment
- [ ] If Option A: color shifts in last 10 seconds of each minute, resets on new minute
- [ ] If Option B: timer stays green throughout
- [ ] Uses design tokens for both colors

---

## Design System Compliance
- Use CSS custom properties from `src/index.css`, not hardcoded hex values
- Match existing component patterns — check how other structure types (Circuit, AMRAP) render their cards for consistency
- Follow the `ChamferedFrame` + `LeftColumn` pattern if exercise cards use chamfered components
- Mobile-first: all changes must work on 375px viewport width
- Large touch targets: don't add any interactive elements smaller than 44px
- Typography: Rajdhani for labels/headers, JetBrains Mono for timer/data, Inter for body text

## Files Likely Touched
- EMOM timer component (wherever `SectionTimer` or EMOM-specific timer lives)
- Exercise card component used inside EMOM sections
- Workout mode page/container (to wire `currentMinute` state)
- Possibly `src/index.css` if new semantic tokens are needed

## What NOT to Do
- Don't restructure the entire workout mode — this is scoped to EMOM clarity only
- Don't change how the timer counts or how EMOM completion works
- Don't touch non-EMOM section rendering
- Don't add new dependencies

## After Session (REQUIRED — you are not done until this is complete)
- [ ] Update SESSION_LOG.md with: Date, Tasks Completed, Files Touched
- [ ] Update PROJECT_MAP.md if any new components were created
- [ ] Mark completed items as `[x]` in BACKLOG.md
- [ ] Test with a real EMOM workout section — verify minute indicator, active highlighting, and labels all work together
- [ ] Confirm: "Session complete. Log and Backlog updated. Ready for next plan."
