# Quick Fix: Ladder "Each Rung" Label + Rung Card Styling

## What
Two changes to how ladders display in Workout Mode:
1. Add an `EACH RUNG:` label between the LadderRungs component and the exercise list
2. Restyle the rung number cards — they should NOT use ChamferedFrame. They need to be visually distinct from action cards and buttons so users read them as data/progress indicators, not interactive elements (in read-only mode).

## Where
Any section in Workout Mode that has a ladder rep scheme. Ladders can appear in multiple structure types — not just For Time. Per the Structure Types Spec, ladders apply to:
- **For Time** (most common — `ladder_down`, `ladder_up`, `pyramid`)
- **Circuit** (`ladder_down` is common for conditioning)
- **Accessory** (pyramids for volume, standard structure)
- **Core** (ladders for challenge, standard or circuit structure)

The detection logic should check the `rep_scheme` field on the exercise/section, NOT the structure type. If `rep_scheme` is `ladder_up`, `ladder_down`, `pyramid`, or `inverse`, apply this treatment regardless of whether the section is For Time, Circuit, or Standard.

## Do

### 1. "EACH RUNG:" Label
Insert `EACH RUNG:` between the LadderRungs row and the first exercise in the list. This connects the rep pattern to the movements — "do all of these at each of those numbers."

**Style** (matches the AMRAP `EACH ROUND:` label pattern):
- Text: `EACH RUNG:`
- Font: Rajdhani, uppercase, `text-xs`
- Color: `--text-color-header` (blue-300)
- Spacing: `mt-2 mb-1`

**Only show when:**
- A ladder rep scheme is detected (`ladder_up`, `ladder_down`, `pyramid`, `inverse`)
- There are 2+ exercises sharing the scheme

Single-exercise ladders don't need it — the rung pattern already implies "do this exercise at each number."

### 2. Restyle Rung Number Cards
The current rung cards look like ChamferedFrame buttons (orange border, chamfered corner). This makes them look interactive/tappable during the workout when they should read as a static progress visualization.

**New rung card style (read-only / pre-workout):**
- Shape: Simple rounded rectangle (`rounded-sm`), NOT chamfered — no angled corner
- Background: `transparent` or very subtle (`--surface-card` at low opacity)
- Border: 1px solid `--border-card` (neutral, not orange)
- Text: monospace (`font-mono`), `text-sm`, `--text-color-paragraph` (blue-100)
- Size: min-width 28px, height 32px, `px-1`, centered text
- Gap: 4px between cards

**New rung card style (interactive / post-completion):**
When the LadderRungs component is in interactive mode (after cap is hit), THEN the cards should look tappable:
- Default (not yet reached): same as read-only style above
- Completed (before selected): background `--surface-cta-primary` at 30% opacity, border stays neutral
- Selected (stopped here): background `--surface-intensity-low` (lime/green-500), text `--neutral-900`, border `--border-cta-primary` (orange)

This creates a clear visual shift: during the workout the rungs are quiet data, after completion they become interactive selectors.

### 3. Ensure Coverage Across Structure Types
Audit the exercise card rendering to confirm ladders are handled everywhere they appear:

- **For Time + ladder:** `LADDER:` label → LadderRungs → `EACH RUNG:` → exercise list (this is the primary case, should already work from the main Ladder plan)
- **Circuit + ladder:** Same pattern — show `LADDER:` label and LadderRungs inside the circuit card, above the exercise list
- **Standard/Accessory + ladder:** If a standard-structure section has a ladder rep scheme (e.g., pyramid bench press), show the LadderRungs inline on the exercise card where the "3×10" prescription would normally go
- **Core + ladder:** Same as accessory

If a structure type doesn't currently render LadderRungs, add it. The component should work anywhere — it just needs the `rungs` array parsed from the `reps` field.

## Don't
- Don't use ChamferedFrame for rung cards — the whole point is visual differentiation
- Don't make rungs look tappable in read-only mode
- Don't change the interactive behavior (tap-to-select, fill-left) — only the visual styling
- Don't change how non-ladder sections render
- No hardcoded colors — use CSS custom properties
