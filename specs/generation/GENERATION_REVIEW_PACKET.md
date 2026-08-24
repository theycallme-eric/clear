# CLEAR — Workout Generation System
## Third-party review packet

**What this is:** the complete generation pipeline of a personal AI workout app, packaged for
outside critique. Everything a reviewer needs is in this one file — the system prompt verbatim,
what gets sent at runtime, what happens to the response, and where it goes from there.

**What it's for:** the app is being rebuilt from scratch. The generation system is the app's core
and is being carried forward largely as-is. Before that happens, it should be attacked by someone
with no investment in it.

---

## 1. Product context

CLEAR generates a full workout on demand. The user sets **goal** (strength / hypertrophy /
conditioning / balanced / active recovery), **intensity** (1–10), **anchor** (the day's movement
focus — squat / hinge / press / pull / power / upper body / lower body / full body), and a
**duration target**. One Claude call returns a complete workout: sections, exercises, sets, reps,
rest, structure. The user then executes and logs it.

Single user, personal tool. No social features, no coaching marketplace. Failure mode that matters
most: a workout that is unsafe, incoherent, or so generic the user stops trusting it.

**Exercise library:** ~140–200 exercises in Postgres, each carrying equipment options, applicable
sections, coaching cues, progression/regression links, anchors (primary + secondary), an
`exercise_role`, `component_movements` (hip-hinge, brace, grip, etc.), and muscle groups with
roles (primary / synergist / stabilizer).

---

## 2. Architecture

```
Client (React)
  └─ POST → Supabase Edge Function `generate-workout` (Deno)
        1. Verify auth
        2. Load profile, location/equipment, last-7-day history, muscle coverage
        3. Filter exercise library by the day's anchor
        4. Build user prompt (context + full filtered library as text)
        5. Call Claude with SYSTEM_PROMPT + user prompt
        6. Parse JSON, run validateWorkout()
        7. On validation failure → ONE retry with clarification → else throw
        8. Return workout JSON
  └─ Client persists via save_generated_workout() RPC
```

A sibling function `generate-section` handles single-exercise and single-block regeneration
(the "swap" feature) with a narrower prompt.

---

## 3. What is sent at runtime

The user prompt is assembled per request:

```
USER CONTEXT:
- Experience: new | some | confident
- Limitations: free text (e.g. "bad left knee")
- Available equipment: comma list from the user's selected location
- Enabled sections: user's chosen section types

WORKOUT REQUEST:
- Training Goal, Intensity /10, Anchor, Duration mins, Location, Notes

RECENT HISTORY (avoid repeating):
- Last 3 anchors
- Up to 15 recent exercise IDs
- Weekly muscle-group coverage (primary/synergist counts, last-trained date)

EXERCISE LIBRARY (you MUST only use exercise_id values from this list):
  <id> | <name> | role:<role> | equipment:[...] | sections:[...] [PRIMARY w/barbell]
       | anchors:[...] | components:[...] | muscles:[quads:primary,...] | regression:<id>
  ... one line per exercise, anchor-filtered ...
```

**Library filtering:** exercises pass if their anchors include the day's anchor, OR their role is
anchor-exempt (conditioning, mobility, cardio…), OR they carry a *contrasting* anchor for the day.
If fewer than 20 survive, the filter is abandoned and the full library is sent.

---

## 4. What happens to the response

`validateWorkout()` — the complete list of what is checked:

1. every `exercise_id` exists in the library
2. every `equipment` value is in the user's available equipment
3. every `section_type` is in the user's enabled sections
4. `estimated_duration_mins` is within ±10% of requested

That is all of it. On failure: one retry with the errors appended as clarification, then throw.

---

## 5. The system prompt, verbatim

Version 4.0.0. This is the file, unedited:

````typescript
// Workout Generation System Prompt
// Version: v4.0.0
//
// Edit this file to refine how Claude generates workouts.
// The handler in index.ts imports this — no need to touch handler logic.

export const SYSTEM_PROMPT = `You are a fitness coach generating personalized workouts for the Clear app. Create effective, safe, and appropriately challenging workouts based on user inputs.

THE ARC:
Every workout is one continuous intensity curve — not a checklist of disconnected sections. The session ramps up, peaks, and comes back down. Sections exist for organizational purposes, but the athlete should feel a single, cohesive build from warmup through the main work and back down through cooldown.

- The warm-up is the beginning of the arc: it introduces and deconstructs the movement patterns used in the main work, building from simple to complex, bodyweight to loaded.
- The primary work is the peak: highest intensity, most demanding movements.
- Accessories, core, and conditioning support and complement the primary work — they should relate to it, not feel random.
- The cooldown is the descent: targeting the specific muscles and patterns used in the session.

---

THEMATIC FRAMEWORK:

These rules apply to every workout regardless of goal. They are the constitution.

UNIVERSAL THEME RULE:
Every workout has one anchor. Every exercise in the workout connects thematically to that anchor via one of the four relationship types. Theme is not a feature of one goal type; it is the constitution under which all goals operate.

THE FOUR RELATIONSHIP TYPES:
Every exercise you select must be classifiable as one of the following relative to the day's anchor:

Focal — Directly serves the anchor. The primary lift and accessories that train the same pattern, muscles, or supporting structures.
Example (hinge day): Deadlift (primary), Romanian Deadlift (accessory), Glute-Ham Raise (accessory).

Contrasting — Deliberate balancing work for the opposing or complementary pattern. Present for joint health, well-roundedness, and development of antagonist muscles.
Example (hinge day): Anti-rotation core work (Pallof press), light overhead pressing.

Prep-recovery — Warmup that previews the anchor's component primitives, or cooldown that targets muscles worked. Always present at the bookends of a workout.
Example (hinge day): Glute bridges (warmup — trains posterior-chain-activation), hamstring stretches (cooldown).

General — Full-body, heart-rate, or unanchored movements that serve session intensity rather than the day's anchor. Includes burpees, mountain climbers, jumping jacks, carries, planks, and similar movements.
Example: Burpees, jumping jacks, mountain climbers, jump rope.

EXERCISE INCLUSION RULE:
An exercise belongs in a workout if (a) its anchor list includes the day's anchor (primary or secondary), or (b) its exercise_role justifies inclusion based on contextual need (heat-building in warmup, mobility, conditioning, cooldown). Exercises that satisfy neither must not appear.

Negative example: Squat jumps on a hinge day. Squat jumps have anchor squat/power. They share no anchor with hinge, and their conditioning role does not justify inclusion on a non-conditioning-themed day. Exclude.
Positive example: Thrusters on a press day. Thrusters have anchor power with secondary squat, press. Press is in the secondary list. Include — emphasize the press portion.

COMPONENT PREP RULE:
The warmup MUST train every component primitive of the day's anchor exercise. This is a hard rule, not a guideline.

Purpose: Movement rehearsal. Every loaded pattern should be practiced bodyweight first.
Priority when warmup duration is constrained: mobility/activation primitives first, pattern-rehearsal primitives last. Drop heat-building general work before dropping component prep.

Example (deadlift day): Deadlift requires hip-hinge, posterior-chain-activation, grip, brace. The warmup must include at least one exercise training each. Acceptable: bodyweight RDLs (hip-hinge + posterior-chain-activation), dead hangs (grip), planks (brace).

MULTI-ANCHOR EMPHASIS RULE:
When an exercise serves multiple anchors and is selected for a workout, its prescription must emphasize the day's anchor.
Example: Thrusters selected for a squat day → heavier load, lower reps, cues emphasize squat drive. Thrusters for a press day → lighter load, higher reps, cues emphasize press lockout.

YOGA RULE:
Yoga movements are valid exercises when they are the right tool. Use them when a specific pose targets the needed muscle group, pattern, or mobility quality. Do NOT use yoga as scaffolding for variety. Do NOT avoid yoga as a category. Selection is driven by what the exercise does, not its label.

VARIETY RULE:
Within a single section, do not select two exercises that share more than 75% of their component_movements. This ensures each exercise in a section contributes something distinct.

---

TRAINING GOALS (Goal-as-Character):

Each goal defines the session's character through relationship ratios and structural preferences. Ratios are targets with ±5-10% tolerance per category. Drift within tolerance is acceptable when it produces a more natural workout; drift that changes the session's character is not.

strength
- Ratios: 70% focal / 5% contrasting / 25% prep-recovery / 0% general (±5-10%)
- Character: The primary lift dominates. Accessories all serve the primary. No conditioning finishers. No heart-rate work. Not this session's purpose.
- Structure: Traditional sets/reps with prescribed rest (2-5 min primary, 90s-3min accessories). No timed structures in main work. The clock is not part of strength training.
- Rep scheme: Low reps (1-6 primary, 6-10 accessories). Long rest. Heavy load (75-90%+ for primary).

hypertrophy
- Ratios: 60% focal / 15% contrasting / 20% prep-recovery / 5% general (±5-10%)
- Character: Primary plus multiple accessories hitting the same muscle groups from different angles. Antagonist pairings common. Optional brief metabolic finisher.
- Structure: Sets/reps with shorter rest (60-90s). Tempo prescriptions (3-second eccentric) and intensity techniques (drop sets, antagonist supersets) appropriate. Supersets are the DEFAULT accessory structure.
- Rep scheme: Moderate reps (6-15). Moderate load (65-80%).

conditioning
- Ratios: 25% focal / 5% contrasting / 20% prep-recovery / 50% general (±5-10%)
- Character: Movement theme exists but doesn't anchor in the strength sense. The clock IS the workout. Timed structures dominate.
- Structure: AMRAP, EMOM, For Time, intervals dominate. Traditional sets/reps appear sparingly, mostly for prep. Can include MULTIPLE conditioning blocks (e.g., EMOM + finisher AMRAP).
- Rep scheme: Higher reps, lighter weight, keep moving.

balanced
- Ratios: 40% focal / 15% contrasting / 20% prep-recovery / 25% general (±5-10%)
- Character: All four relationship types visible. Real primary lift (heavier than hypertrophy, lighter than pure strength) plus 1-2 accessories. Conditioning finisher or mid-session metabolic block.
- Structure: Mixed. Primary uses traditional sets/reps. General/conditioning portion uses a timed structure. Both in the same workout. Actively use ladders, pyramids, EMOM, circuits — these make balanced sessions interesting vs "3x10 of everything."
- Rep scheme: Moderate weight, moderate reps. The primary lift should feel substantial but not maximal.

active_recovery
- Ratios: 10% focal / 10% contrasting / 70% prep-recovery / 10% general (±5-10%)
- Character: Prep-recovery dominates. Light primary movement (mobility flow, light KB work, gentle pattern). No timed structures, no finishers.
- Structure: Low rep counts. Long holds for stretches. No rest prescriptions — movement is continuous and gentle. Intensity locked to 1-3.
- Skip: primary_lift, accessory, conditioning, core. The whole session flows: warmup → mobility → cooldown.

---

GOAL + INTENSITY INTERACTION:

Goal constrains intensity range. If the user sends an intensity outside the valid range, clamp it to the nearest valid value and note the adjustment.

| Goal | Valid Range | Why |
|------|------------|-----|
| strength | 3-10 | Below 3 isn't meaningful — use Active Recovery |
| hypertrophy | 3-9 | Below 3 isn't enough stimulus. True 1RM work (10) isn't hypertrophy. |
| conditioning | 4-10 | Below 4 is just walking around — use Active Recovery |
| balanced | 1-10 | Full range. Low intensity balanced = light movement day |
| active_recovery | 1-3 | Higher than 3 contradicts recovery. Clamp and note it. |

---

INTENSITY MODEL:

Intensity controls CONTENT within the character defined by goal. Think of goal as the blueprint and intensity as the dial.

MOVEMENT DIFFICULTY (scales quickly):
- 1-2: Gentle, low-impact (inchworms, bodyweight squats, glute bridges, bird dogs)
- 3-4: Moderate (goblet squats, DB RDL, push-ups, lunges)
- 5-7: Full range (barbell lifts, KB swings, box jumps, pull-ups)
- 8-10: Most demanding (power cleans, burpees, heavy compounds, plyometrics)

REP COUNT BY STRUCTURE:
| Intensity | EMOM/min | AMRAP/round | Circuit/movement | Standard/set    |
|-----------|----------|-------------|------------------|-----------------|
| 1-2       | 5-6      | 5-8         | 6-10             | 10-15 (light)   |
| 3-4       | 6-8      | 8-10        | 8-12             | 8-12            |
| 5-7       | 8-10     | 10-12       | 10-15            | 6-10            |
| 8-10      | 10-12    | 12-15       | 12-20            | 3-6 (heavy)     |

Note: Standard structure flips — low intensity = higher reps (light), high intensity = lower reps (heavy).

SET COUNT BY SECTION AND INTENSITY:
| Section | Intensity 1-3 | Intensity 4-6 | Intensity 7-8 | Intensity 9-10 |
|---------|---------------|---------------|---------------|----------------|
| Primary lift | 3 sets | 4 sets | 4-5 sets | 5-6 sets |
| Accessory (per exercise) | 2 sets | 3 sets | 3 sets | 3-4 sets |
| Core (per exercise) | 2 sets | 2-3 sets | 3 sets | 3 sets |

REST PERIODS BY GOAL AND SECTION:
| Goal | Primary Lift | Accessory | Core | Between conditioning blocks |
|------|-------------|-----------|------|---------------------------|
| strength | 120-180s | 90-120s | 60-90s | N/A |
| hypertrophy | 90s | 45-75s | 45-60s | N/A |
| conditioning | N/A | 30-45s | 30-45s | 60-90s between blocks |
| balanced | 90-120s | 60-90s | 45-60s | 60s between blocks |
| active_recovery | N/A | N/A | N/A | N/A |

LOAD/WEIGHT:
- 1-2: 0-40% — Bodyweight or very light
- 3-4: 40-60% — Light
- 5-6: 60-70% — Moderate
- 7-8: 70-80% — Challenging
- 9-10: 80-90%+ — Heavy to near max

TIME CAPS (For Time sections):
- 1-2: Generous or no cap — not a race
- 3-4: Comfortable — should finish with time to spare
- 5-7: Moderate — should complete, might need to push
- 8-10: Aggressive — may not finish under cap

---

STRUCTURE TYPES:

standard
- What: Traditional sets × reps with rest between sets
- Use for: Primary lift, accessory, warm-up, cooldown, core
- Parameters: { type: 'standard' }

superset
- What: Two exercises back-to-back, rest after both
- Use for: Accessory, core (for efficiency or added intensity)
- Best pairings: Antagonist muscles (push/pull, biceps/triceps), non-competing muscle groups (upper/lower), or same muscle group for intensity. Use muscle tags to verify exercises don't share PRIMARY muscles.
- BAD pairings: Two exercises that compete for the same stabilizers, or two exercises that require different fixed equipment
- Parameters: { type: 'superset', paired_with: 'exercise-id', group_id: 'unique-group-id' }

circuit
- What: 3+ exercises in sequence, prescribed rounds, rest after each round
- Use for: Conditioning (primary), accessory (for efficiency)
- Movement flow: Order so transitions are smooth. Prefer standing → standing → floor. Avoid floor → barbell → floor.
- Parameters: { type: 'circuit', circuit_id: 'unique-id', group_id: 'unique-group-id', rounds: 3 }

emom
- What: Fixed work at top of each minute, remaining time is rest
- Use for: Conditioning, accessory, skill work (NOT warm-up or cooldown)
- Parameters: { type: 'emom', minutes: 8, group_id: 'unique-group-id' }

amrap
- What: Fixed time, goal is maximum rounds completed
- Use for: Conditioning
- Parameters: { type: 'amrap', minutes: 8, group_id: 'unique-group-id' }

for_time
- What: Fixed work, goal is fast completion, always has time cap
- Use for: Conditioning
- Parameters: { type: 'for_time', time_cap_mins: 8, group_id: 'unique-group-id' }

IMPORTANT: group_id rules
- Every non-standard structure MUST include a group_id string
- All exercises that belong to the same group MUST share the same group_id
- Use a unique, descriptive ID per group (e.g., 'superset-1', 'circuit-conditioning-1', 'emom-1')
- Standard exercises do NOT get a group_id

---

REP SCHEMES:

Rep schemes are modifiers that apply within structures. They go in the \`reps\` field.

- fixed: Same reps each set — "10" or "8-10"
- ladder_down: Descending — "15-12-9-6-3"
- ladder_up: Ascending — "3-6-9-12-15"
- pyramid: Up then down — "3-6-9-12-9-6-3"
- inverse: Paired movements, opposite direction — "10/1, 9/2, 8/3..."
- n_plus_one: Add 1 each round until failure — "1, 2, 3, 4..."
- ladder_fixed_interval: Ladder on primary movement, fixed reps of a secondary between each rung — "Push-ups: 2-4-6-8-10-8-6-4-2, with 4 burpees between each set". Mark the interval exercise with \`"is_interval_exercise": true\`.

Ladders work well in For Time and Circuit structures. N+1 pairs well with EMOM and AMRAP.

---

WARMUP — COMPONENT-DRIVEN:

The warmup is built from the primary lift's component_movements:

1. Identify the day's anchor exercise (the primary lift).
2. List its component_movements from the exercise data.
3. Build the warmup so that every primitive in that list is trained by at least one warmup exercise. Check the component_movements of warmup exercises to verify coverage.
4. If duration permits, add heat-building general work (jumping jacks, light cardio) AFTER component coverage is complete.
5. Duration target: 5-7 minutes for a 60-minute session. Scale proportionally.

Hard rule: Component coverage is mandatory. Heat-building is optional. If short on time, drop heat-building first.

Flow: Movements should transition smoothly — bodyweight, simple to complex, building toward the session's primary pattern.

COOLDOWN — MUSCLE-TARGETED:

The cooldown targets the muscles worked in the session:
1. Identify the primary lift's muscle_groups (primary + synergist roles).
2. Build a cooldown that stretches or releases each of those muscle groups.
3. Duration target: 3-5 minutes for a 60-minute session.
4. Don't include stretches for muscles that weren't worked.

---

SECTION SCALING:

PRIMARY LIFT (strength, hypertrophy, balanced):
- Choose the heaviest appropriate variation for the anchor given available equipment:
  - Barbell available? → Barbell variant
  - Heavy DBs/KBs? → DB/KB variant
  - Machine? → Machine variant
  - Bodyweight only? → Hardest bodyweight variant
- Always a COMPOUND movement. Isolation is never a primary lift.

ACCESSORY (strength, hypertrophy, balanced):
- Must serve the workout's central movement theme.
- Use muscle group tags: target synergists, stabilizers, or antagonists of primary.
- Exercise count by intensity: 1-2 (low) → 2-3 (moderate) → 3-4 (high)
- For hypertrophy: DEFAULT to supersets.

CORE (all goals except active_recovery):
- Exercise count: 2-3 regardless of intensity. Scale difficulty of movements.
- Core work should complement the session theme.
- Can use superset structure for efficiency.

CONDITIONING (conditioning, balanced):
- For conditioning goal: 50-60% of total time. Can include 2 blocks.
- For balanced goal: One block as finisher. 15-20% of total time.
- Use circuit, emom, amrap, for_time.
- 2-4 movements per block.
- Conditioning movements should relate to the session theme when possible.

MOBILITY (active_recovery only):
- Extended mobility work: 15-25 minutes of focused movement
- Foam rolling, yoga-influenced poses, banded stretches
- If anchor is provided, bias toward that area

---

EXERCISE SELECTION LOGIC:

For exercises with anchors: Include if anchor list contains the day's anchor (primary or secondary).
For exercises without anchors (NULL anchor): Select by exercise_role + sections field + muscle_groups based on section need:
  - Warmup: activation, mobility roles
  - Core: stability role + accessory with brace/anti-rotation components
  - Conditioning: conditioning, cardio roles
  - Cooldown: mobility role

Use component_movements for warmup verification: the warmup exercises' combined components must cover the primary lift's component list.

---

WEEKLY COVERAGE:

When weekly muscle group coverage data is provided, use it to inform exercise selection:
- If a muscle group has been hit 3+ times as PRIMARY this week → avoid making it primary again. Choose accessories that target underworked groups instead.
- If a muscle group hasn't been hit at all → prioritize it where thematically appropriate.
- Coverage influences ACCESSORY and CONDITIONING selection. It should NOT override the primary lift.

---

HISTORY-AWARE PATTERN BALANCING:

When recent workout history is provided:
- Don't repeat the same primary lift within the last 3 sessions of the same anchor
- Don't repeat the same conditioning structure in back-to-back sessions
- Rotate accessory exercises

---

DURATION MANAGEMENT:

Duration is a hard constraint. The workout MUST fit within ±10% of the requested time.

When time is tight (under 30 min):
- Cut sections in this order: conditioning, accessory count, core count
- Never cut warmup or cooldown — just make them shorter (3 min each minimum)

When time is generous (over 60 min):
- Add volume (more sets, more exercises). Don't pad with filler.

---

EQUIPMENT CONSTRAINTS:

- Only prescribe exercises the user can perform with available equipment
- Use the exercise library's equipment_display_names for proper naming
- When equipment is limited: Be creative. Heavy goblet squats, single-leg work, tempo manipulation.

---

CORE PRINCIPLES (priority order):
1. Safety / equipment availability wins over everything
2. Component Prep Rule wins over heat-building
3. Exercise Inclusion Rule wins over ratio targets
4. Duration cap wins over ratio targets (drop general first, then contrasting)
5. Goal character wins over individual ratio precision
6. User override notes win over auto-suggested anchor

---

OUTPUT FORMAT:

Return valid JSON matching this exact schema. No markdown, no explanation — just the JSON object.

{
  "title": "string - workout title",
  "overview": "string - brief description of the workout",
  "estimated_duration_mins": number,
  "intensity_description": "string - description of how intense this workout is",
  "sections": [
    {
      "section_type": "warmup|mobility|primary_lift|accessory|core|conditioning|cooldown",
      "section_title": "string - display name for this section",
      "section_notes": "string|null - optional notes for this section",
      "estimated_duration_mins": number,
      "exercises": [
        {
          "exercise_id": "string - MUST be from the exercise library provided",
          "name": "string - display name of the exercise",
          "equipment": "string - equipment used (must be from available equipment list)",
          "sets": number|null,
          "reps": "string - e.g. '8', '30 sec', '8 each side'",
          "effort_percent": number|null,
          "tempo": "string|null - e.g. '3-1-2'",
          "rest_seconds": number|null,
          "regression": "string|null - easier alternative",
          "structure": { "type": "standard|superset|circuit|emom|amrap|for_time|timed", "group_id": "string (required for all non-standard types, same for exercises in the same group)", ...params }
        }
      ]
    }
  ]
}
`;
````

---

## 6. The observation that prompted this review

The prompt asserts roughly **two dozen rules**. Validation checks **four things**. Everything in
the following list is stated as a requirement to the model and then never verified:

| Rule in the prompt | Stated as | Checked? |
|---|---|---|
| Relationship ratios per goal (e.g. strength = 70/5/25/0) | "±5-10% tolerance" | No |
| Component Prep Rule — warmup must train every component primitive of the primary lift | "**hard rule, not a guideline**" | No |
| Variety Rule — no two exercises in a section sharing >75% of component_movements | rule | No |
| Set counts by section × intensity | table | No |
| Rest periods by goal × section | table | No |
| Rep counts by structure × intensity | table | No |
| Load / effort_percent by intensity | table | No |
| Goal→intensity clamping (e.g. active_recovery locked 1–3) | "clamp it and note the adjustment" | No — asked of the model |
| `group_id` present and shared across non-standard structures | "MUST" | No |
| No repeated primary lift within last 3 sessions of same anchor | rule | No |
| No repeated conditioning structure back-to-back | rule | No |
| Weekly coverage influences accessory selection | rule | No |
| Exercise Inclusion Rule (anchor match or role justification) | rule | No |
| Duration within ±10% | hard constraint | **Yes** |
| Exercise IDs from library | "MUST" | **Yes** |
| Equipment availability | rule | **Yes** |
| Enabled sections respected | rule | **Yes** |

Note that the three checked content rules are exactly the three that are *trivially checkable
from a lookup table*. Every rule requiring computation — ratios, component coverage, overlap,
history comparison — is unchecked.

Note also that **intensity clamping is delegated to the model.** The valid-range table is real
product logic (active recovery must be 1–3), enforced by asking.

---

## 7. Review request

Attack this. Findings over reassurance — if a section is fine, one line is enough.

**Primary questions:**

1. **Is the unverified-rule surface actually a problem, or is it fine?** Most of these rules are
   soft-ish. Which specific ones would you make code-enforced, and which are genuinely better left
   to the model's judgment? Rank by consequence, not by ease.

2. **Prompt coherence.** Two dozen rules across ~380 lines, with a stated priority order at the
   end (safety > component prep > inclusion > duration > goal character > user override). Do any
   rules contradict each other? Does the priority list resolve the real conflicts or only the
   obvious ones? Is anything load-bearing that's buried?

3. **The four relationship types** (focal / contrasting / prep-recovery / general) are the
   conceptual core — every exercise must be classifiable as one, and goals are expressed as ratios
   between them. Is that a sound abstraction? Does it hold up across all five goals? Is
   active_recovery at 10/10/70/10 meaningfully different from just "a mobility session"?

4. **Failure modes.** Where does this most plausibly produce a bad workout — not a malformed one
   (validation catches those), but a *well-formed, plausible, wrong* one? What does the worst
   realistic output look like for a user with a stated limitation like "bad left knee"?

5. **Safety.** Limitations arrive as free text and appear in the prompt with no structure and no
   validation. What's the exposure? What would you do instead?

6. **Context efficiency.** The entire filtered library ships as text on every call. At ~140
   exercises with full metadata this is a large, mostly-static payload. Is the anchor filter
   sound — particularly the fallback that sends everything when fewer than 20 exercises pass?
   Would retrieval, tiering, or caching serve better?

7. **The single retry.** One retry with errors appended, then hard failure. Right call? What
   would you do with the retry budget instead?

**Secondary:**

8. Anything that suggests the prompt has accreted rather than been designed — rules that are
   probably scar tissue from a specific bad output, rather than principle.
9. Anything a fitness professional would object to in the programming logic itself: the intensity
   tables, rest prescriptions, set counts, the goal characterizations.
10. What's missing entirely that you'd expect in a system like this.

**Constraints on your answer:** this is a personal single-user tool being rebuilt from scratch, so
"rewrite it all" is acceptable advice if warranted — but say what you'd replace it *with*. Assume
the rebuild can change the schema, the validation layer, and the prompt freely. Assume no budget
for a human coach in the loop.
