# SESSION PLAN: Ladder For Time — Clarity & Completion Logging

## Session Goal
Restructure the Ladder For Time card to show the rep scheme once (not repeated per exercise), build a tappable rung selector for logging progress when the time cap is hit, and add fixed-interval ladder support to the generation prompt.

## Context
- **Reference:** `docs/specs/Clear_-_Structure_Types_Spec.md` (For Time + Rep Schemes sections), `docs/specs/Clear_-_UI_Component_Spec.md` (For Time card layout), `docs/specs/Clear_-_Workout_Generation_Prompt_v2.md` (rep scheme definitions)
- **Figma:** Check Workout Mode / For Time frames. The LadderRungs component is new — no Figma yet. Build from the spec below.
- **Skill:** Read `.claude/skills/chamfered-component.md` — the rung cards use the ChamferedFrame pattern.
- **Prior work:** EMOM clarity (SESSION_PLAN_emom_clarity.md) and AMRAP logging (SESSION_PLAN_amrap_logging.md) will have been completed first. Reference their patterns for timer completion states, token usage, and post-timer logging UX.
- **Current state:** The Ladder For Time card repeats the full rep scheme string ("2-4-6-8-6-4-2 each reps") on every exercise line. This is visually cluttered and makes the pattern harder to parse. There is also no way to log how far through the ladder the user got if the time cap is reached.

## Design Principles
- **Low touch during execution.** The phone sits on the floor. User memorizes the pattern before starting, glances at the timer occasionally. All interaction is before and after.
- **Show the pattern once.** The ladder rep scheme is a property of the section, not individual exercises. Display it once as a section-level label, then list movements underneath without repeating reps.
- **Two completion paths.** Finished under cap → time recorded, done. Cap hit → surface the rung selector so user can log where they stopped.

## Tasks

### 1. Restructure Ladder Card Layout
**Do:** Change how ladder-based For Time sections render. Instead of repeating the rep scheme on each exercise, use a three-tier hierarchy:

**New layout (collapsed):**
```
┌─────────────────────────────────────┐
│  FOR TIME                           │
│                                     │
│  ┌─────────────────────────────┐   │
│  │         00:00               │   │  ← Timer (count-up)
│  └─────────────────────────────┘   │
│  [          START              ]   │
│                                     │
│  LADDER: 2-4-6-8-10-8-6-4-2       │  ← Rep scheme shown ONCE
│                                     │
│  ─────────────────────────────────  │
│  SINGLE-LEG ROMANIAN DEADLIFT   ▼  │  ← Exercise (no reps shown)
│  PALLOF PRESS                   ▼  │  ← Exercise (no reps shown)
│                                     │
│  8 min cap                         │  ← Time cap reminder
└─────────────────────────────────────┘
```

**Key changes from current:**
- Add a `LADDER:` label row between the timer and the exercise list. This shows the full rep pattern once: `2-4-6-8-10-8-6-4-2`
- Remove the rep scheme from individual exercise lines. Exercises show only their name (collapsed) or name + coaching cues + weight input (expanded).
- The `LADDER:` label text uses `--text-color-header` (blue-300), `text-xs` uppercase, Rajdhani font. The rep pattern itself uses `--text-timer` (green-400), monospace, slightly larger.

**For non-ladder For Time sections** (fixed reps like "50 KB swings, 40 push-ups, 30 burpees"):
- Don't show a `LADDER:` label
- Keep reps on each exercise line as they are now
- Only apply this restructuring when `rep_scheme` is `ladder_up`, `ladder_down`, `pyramid`, or `inverse`

**Detection logic:**
```typescript
const isLadderScheme = (repScheme: string) => 
  ['ladder_up', 'ladder_down', 'pyramid', 'inverse'].includes(repScheme);

// The rep pattern string comes from the exercises' `reps` field
// e.g., "2-4-6-8-10-8-6-4-2"
// Parse it to extract rung values:
const parseRungs = (reps: string): number[] => 
  reps.split('-').map(Number).filter(n => !isNaN(n));
```

**Acceptance:**
- [ ] Ladder-based For Time sections show the rep scheme once above the exercise list
- [ ] Individual exercise lines do NOT repeat the rep scheme
- [ ] Non-ladder For Time sections are unaffected
- [ ] Expanded exercise cards still show coaching cues, weight input, regressions — just not the reps
- [ ] Uses design tokens, no hardcoded values

---

### 2. Build LadderRungs Component
**Do:** Create a reusable `LadderRungs` component that displays the rep pattern as a horizontal row of tappable chamfered cards. This component serves dual purpose: read-only pattern display during the workout, and interactive progress selector after the timer.

**Component API:**
```typescript
interface LadderRungsProps {
  rungs: number[];           // [2, 4, 6, 8, 10, 8, 6, 4, 2]
  interactive?: boolean;     // false during workout, true after cap hit
  selectedRung?: number;     // Index of the last completed rung (0-based)
  onSelect?: (rungIndex: number) => void;
}
```

**Visual spec:**

Each rung is a small ChamferedFrame containing the rep number.

| State | Surface | Border | Text Color |
|-------|---------|--------|------------|
| Default (not reached) | `--surface-card` or equivalent dark | `--border-cta-primary` (orange) | `--text-color-paragraph` (blue-100) |
| Completed (before selected) | `--surface-cta-primary` at ~30% opacity | `--border-cta-primary` (orange) | `--text-color-paragraph` (blue-100) |
| Selected (stopped here) | `--surface-intensity-low` (lime/green-500) | `--border-cta-primary` (orange) | `--neutral-900` (dark text on lime) |

**Behavior:**
- **Read-only mode** (`interactive={false}`): No rung is selected. All rungs show in default state. This is the pre-workout and during-workout display.
- **Interactive mode** (`interactive={true}`): User taps a rung. That rung gets the lime "selected" treatment. All rungs before it get the "completed" muted fill. All rungs after it stay in default. Tapping a different rung resets and reselects.

**Sizing:**
- Each rung card: min-width 32px, height 40px, gap 4px between cards
- Text: monospace, `text-sm`
- If rungs exceed container width (>9-10 rungs at 375px), enable horizontal scroll with `overflow-x-auto`
- Touch targets: the tappable area should be at least 44px even if the visual card is 32px wide (add padding to the tap zone)

**Where it renders:**
- In the ladder card layout from Task 1, below the `LADDER:` label (replacing the text string)
- In read-only mode during workout
- Switches to interactive mode in the completion state (Task 3)

**Acceptance:**
- [ ] Renders a horizontal row of chamfered rung cards
- [ ] Read-only mode shows all rungs in default state, no interaction
- [ ] Interactive mode: tapping a rung selects it + fills all preceding rungs
- [ ] Tapping a different rung resets and reselects correctly
- [ ] Handles up to 11 rungs; horizontal scrolls if needed
- [ ] Touch targets ≥44px
- [ ] Uses ChamferedFrame pattern and design tokens

---

### 3. Two Completion Paths

**Path A: Finished under cap (user taps "Complete")**

The user finishes the entire ladder before the time cap. They tap a "Complete" button which stops the timer.

**Completion state:**
```
┌─────────────────────────────────────┐
│  COMPLETE ✓                         │
│                                     │
│  ┌─────────────────────────────┐   │
│  │        06:23               │   │  ← Elapsed time (static)
│  └─────────────────────────────┘   │
│                                     │
│  [LadderRungs — all filled/lime]   │  ← All rungs selected (full completion)
│                                     │
│  [exercises below, unchanged]       │
└─────────────────────────────────────┘
```

- Timer stops and displays final time
- LadderRungs component shows all rungs as completed (auto-select last rung)
- Save `completed_under_cap: true` and `completion_time_seconds` to `structure_results`
- `highest_rung` is null (they finished everything)

**Path B: Cap reached (timer hits zero)**

The user didn't finish. Timer expires automatically.

**Completion state:**
```
┌─────────────────────────────────────┐
│  CAP REACHED                        │
│                                     │
│  ┌─────────────────────────────┐   │
│  │        08:00               │   │  ← Cap time (static, muted)
│  └─────────────────────────────┘   │
│                                     │
│  HOW FAR DID YOU GET?               │
│  [LadderRungs — interactive mode]  │  ← Tap last completed rung
│                                     │
│  [exercises below, unchanged]       │
└─────────────────────────────────────┘
```

- Timer stops at cap value, displayed muted (`opacity-60`)
- "HOW FAR DID YOU GET?" label in `--text-color-header`, Rajdhani, uppercase
- LadderRungs switches to interactive mode — user taps the last rung they completed
- Save `completed_under_cap: false`, `highest_rung` (index of selected rung), and `completion_time_seconds` (the cap value)

**Implementation notes:**
- Reference the AMRAP completion state pattern for the transition from running → complete
- "CAP REACHED" header uses the same position/style as the AMRAP "AMRAP COMPLETE" header
- If user doesn't select a rung and advances (taps Next), save `highest_rung: null` — don't block progression

**Acceptance:**
- [ ] Path A: tapping Complete stops timer, shows all rungs filled, saves time + `completed_under_cap: true`
- [ ] Path B: timer hitting cap shows "HOW FAR DID YOU GET?" with interactive LadderRungs
- [ ] Path B: tapping a rung selects it with the fill-left behavior
- [ ] User can advance without selecting a rung (graceful fallback)
- [ ] Both paths persist data to `structure_results` on section advance
- [ ] `highest_rung` saves correctly as the 0-based index of the selected rung
- [ ] Going Back and returning preserves the selected rung

---

### 4. Add Fixed-Interval Ladder to Generation Prompt
**Do:** The generation prompt currently supports ladder types but does not have a concept of "fixed-interval" ladders — where a fixed-rep exercise is performed between each rung of the ladder (e.g., ladder of push-ups with 20 high knees between each set).

Add this to the rep scheme definitions in `Clear_-_Workout_Generation_Prompt_v2.md` and the system prompt in the edge function:

**New rep scheme:**
```
- ladder_fixed_interval: Ladder pattern on primary movement, fixed reps of a secondary movement between each rung
  Example: "Push-ups: 2-4-6-8-10-8-6-4-2, with 4 burpees between each set"
```

**JSON output format:**
```json
{
  "exercise_id": "push-up",
  "name": "Push-Up",
  "reps": "2-4-6-8-10-8-6-4-2",
  "structure": { "type": "for_time", "time_cap_mins": 10 },
  "rep_scheme": "ladder_fixed_interval"
},
{
  "exercise_id": "burpee",
  "name": "Burpee",
  "reps": "4",
  "structure": { "type": "for_time", "time_cap_mins": 10 },
  "rep_scheme": "ladder_fixed_interval_rest",
  "is_interval_exercise": true
}
```

**Note:** The `is_interval_exercise: true` flag (or a similar marker — use your judgment on the cleanest approach) tells the UI to render this exercise differently: as a "between each rung" annotation rather than a peer exercise. Alternatively, this could be a `role` field like `"role": "interval"` vs `"role": "primary"`.

**UI rendering for fixed-interval ladders:**
```
LADDER: 2-4-6-8-10-8-6-4-2
[LadderRungs component]

PUSH-UP                               ← Primary movement
  4 BURPEES between each set          ← Interval movement shown as annotation
```

The interval exercise is NOT shown as a full exercise card. It's a subtitle/annotation under the primary exercise.

**Files to update:**
- `docs/specs/Clear_-_Workout_Generation_Prompt_v2.md` — add `ladder_fixed_interval` to rep scheme definitions
- `supabase/functions/generate-workout/index.ts` — update the system prompt with the new scheme
- `docs/specs/Clear_-_Structure_Types_Spec.md` — add `ladder_fixed_interval` to the rep schemes table

**Acceptance:**
- [ ] `ladder_fixed_interval` defined in generation prompt
- [ ] System prompt in edge function updated
- [ ] Structure Types Spec updated
- [ ] Test generation: request a ladder workout and verify the new format can appear
- [ ] UI renders interval exercises as annotations, not full cards
- [ ] LadderRungs component works the same regardless of whether it's a paired or fixed-interval ladder

---

### 5. Persist Ladder Results to Structure Results
**Do:** Wire up the save logic so ladder progress is captured on section advance.

**Data to save:**
```typescript
{
  structure_type: 'for_time',
  completion_time_seconds: number,       // Elapsed time or cap value
  completed_under_cap: boolean,          // true if finished, false if cap hit
  rep_scheme: string,                    // 'pyramid', 'ladder_up', etc.
  highest_rung: number | null,           // 0-based index, null if completed all
  notes: string | null,
}
```

**Notes:**
- The `highest_rung` and `rep_scheme` fields already exist on the `structure_results` table — no migration needed
- Follow the same save-on-advance pattern established in the AMRAP plan
- If the user completed everything (Path A), `highest_rung` is null
- If the user didn't select a rung (Path B, skipped), `highest_rung` is also null — that's fine

**Acceptance:**
- [ ] Path A saves: time, `completed_under_cap: true`, `highest_rung: null`
- [ ] Path B saves: cap time, `completed_under_cap: false`, `highest_rung: [selected index]`
- [ ] `rep_scheme` value persists correctly
- [ ] Data matches `StructureResult` TypeScript type
- [ ] Going Back and Forward preserves selections in local state

---

## Design System Compliance
- Use CSS custom properties from `src/index.css`, no hardcoded hex values
- ChamferedFrame + LeftColumn for rung cards (read `.claude/skills/chamfered-component.md`)
- Follow completion state patterns from the AMRAP logging session
- Mobile-first: test at 375px. LadderRungs must handle horizontal scroll gracefully.
- Touch targets: ≥44px for all tappable rung cards
- Typography: Rajdhani for labels/headers, JetBrains Mono for rung numbers and timer, Inter for annotations

## Files Likely Touched
- New: `src/components/workout/LadderRungs.tsx`
- For Time timer/card component (restructure layout, add completion states)
- Timed section card renderer (detect ladder scheme, change layout)
- `docs/specs/Clear_-_Workout_Generation_Prompt_v2.md`
- `supabase/functions/generate-workout/index.ts` (system prompt)
- `docs/specs/Clear_-_Structure_Types_Spec.md`
- Structure results save logic

## What NOT to Do
- Don't change how the For Time timer counts or how the cap works
- Don't add mid-workout interactions (no "advance rung" tapping during the ladder)
- Don't touch EMOM, AMRAP, or other structure types
- Don't change the exercise card expand/collapse pattern — just remove the repeated reps from the collapsed label
- Don't restructure non-ladder For Time sections (fixed rep schemes stay as-is)

## After Session (REQUIRED — you are not done until this is complete)
- [ ] Update SESSION_LOG.md with: Date, Tasks Completed, Files Touched
- [ ] Update PROJECT_MAP.md if new components were created (LadderRungs)
- [ ] Update BACKLOG.md — mark completed items
- [ ] Test: Ladder For Time displays rep scheme once, exercises listed without reps
- [ ] Test: Complete before cap → all rungs fill, time saved
- [ ] Test: Cap hit → interactive rung selector appears, selection saves
- [ ] Test: Generate a workout requesting ladder structure → verify prompt produces correct format
- [ ] Confirm: "Session complete. Log and Backlog updated. Ready for next plan."
