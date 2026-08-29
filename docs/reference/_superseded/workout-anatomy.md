# Clear — Workout Anatomy Spec

> **Status:** v1 — Ready for Implementation
> **Last Updated:** 2026-05-21
> **Purpose:** Defines how Clear builds workouts at the architectural level — the thematic framework, the relationship between exercises, the goal-driven character of each session, and the data + prompt + generation logic changes required to implement them.
> **Audience:** Claude Code (implementation), product designer (review and future iteration).
> **Scope:** This spec is self-contained. All rules, definitions, and examples needed for implementation live in this document. References to other docs are for traceability only.

---

## How to Read This Spec

Each section is labeled with one of two markers:

- **[LOCKED]** — Architectural decisions and rules. Implement as written. If something is unworkable, escalate before changing.
- **[WORKING]** — v1 vocabularies and classifications. Propose refinements as you encounter the actual data. The spec version is a starting point, not gospel.

Goal ratios are **LOCKED in shape** but executed with tolerance — see Section 6.

---

## 1. Glossary [LOCKED]

| Term | Definition |
|------|------------|
| **Anchor** | A movement pattern category that defines a workout's central theme. Values: `squat`, `hinge`, `press`, `pull`, `power`. (Note: `surprise` is being retired — see Section 7.) |
| **Primary anchor** | The single anchor designated as the workout's focus. Set per-workout (auto-suggested or user-overridden). |
| **Secondary anchor** | Additional anchor(s) an exercise serves. An exercise with `primary: hinge, secondary: pull` is primarily a hinge movement but also contributes to pull development. |
| **Theme** | The thematic connection between every exercise in a workout and the day's anchor. Universal across all goals. |
| **Relationship type** | The role an exercise plays relative to the day's anchor. Four values: `focal`, `contrasting`, `prep-recovery`, `general`. Internal classification only. |
| **Focal** | An exercise that directly serves the day's anchor. The primary lift and its supporting accessories. |
| **Contrasting** | An exercise that deliberately works the opposing or complementary pattern for balance and joint health. |
| **Prep-recovery** | An exercise that prepares the body for the anchor (warmup) or recovers from it (cooldown). |
| **General** | A full-body, heart-rate, or thematically-neutral exercise that serves session intensity rather than the anchor. |
| **Component primitive** | An atomic movement quality that a complex exercise requires or trains. Example: a deadlift requires the primitives `hip-hinge`, `posterior-chain-activation`, `grip`, `brace`. |
| **Exercise role** | A classification field on exercises that replaces the retired `surprise` anchor for non-pattern movements. Values: `compound_lift`, `accessory`, `activation`, `mobility`, `conditioning`, `stability`, `cardio`. |
| **Goal** | The user's training intent for a session. Five values: `strength`, `hypertrophy`, `conditioning`, `balanced`, `active_recovery`. Read from the user's profile. |
| **Goal ratio** | The target proportion of focal / contrasting / prep-recovery / general work for a given goal. Targets are approximate (±5-10% tolerance). |
| **Anchor exercise** | The primary lift selected for the workout. Drives the warmup's component-prep logic and the workout's thematic relationships. |

---

## 2. The Thematic Framework [LOCKED]

### 2.1 Universal Theme Rule

Every workout has one anchor. Every exercise in the workout connects thematically to that anchor via one of the four relationship types. This applies across all goals — strength, hypertrophy, conditioning, balanced, and active recovery. Theme is not a feature of one goal type; it is the constitution under which all goals operate.

### 2.2 The Four Relationship Types

Every exercise in a generated workout must be classifiable as one of the following relative to the day's anchor:

**Focal.** Directly serves the anchor. Includes the primary lift and accessories that train the same pattern, muscles, or supporting structures.
- Example (hinge day): Deadlift (primary), Romanian Deadlift (accessory), Glute-Ham Raise (accessory).

**Contrasting.** Deliberate balancing work for the opposing or complementary pattern. Present for joint health, well-roundedness, and development of antagonist muscles.
- Example (hinge day): Anti-rotation core work (Pallof press), light overhead pressing.

**Prep-recovery.** Warmup that previews the anchor's component primitives, or cooldown that targets muscles worked. Always present at the bookends of a workout.
- Example (hinge day): Glute bridges (warmup — trains posterior-chain-activation), hamstring stretches (cooldown).

**General.** Full-body, heart-rate, or unanchored movements that serve session intensity rather than the day's anchor. Includes burpees, mountain climbers, jumping jacks, carries, planks, and similar movements that don't anchor to a specific pattern.
- Example: Burpees, jumping jacks, mountain climbers, jump rope.

### 2.3 The Exercise Inclusion Rule

An exercise belongs in a workout if **(a)** its anchor list includes the day's anchor (primary or secondary), or **(b)** its `exercise_role` justifies inclusion based on contextual need (heat-building in warmup, mobility, conditioning, cooldown). Exercises that satisfy neither must not appear.

**Negative example:** Squat jumps on a hinge day. Squat jumps have anchor `squat` (or `power` with secondary `squat`). They share no anchor with hinge, and their role (`conditioning`) does not justify inclusion on a non-conditioning-themed day. Exclude.

**Positive example:** Thrusters on a press day. Thrusters have anchor `power` with secondary `squat, press`. Press is in the secondary list. Include — emphasize the press portion per Section 2.5.

### 2.4 The Component Prep Rule

The warmup must train every component primitive of the day's anchor exercise. This is a hard rule, not a guideline.

**Purpose:** Movement rehearsal. Every loaded pattern should be practiced bodyweight first.

**Priority order when warmup duration is constrained:** mobility/activation primitives first, pattern-rehearsal primitives last. Drop heat-building general work before dropping component prep.

**Example (deadlift day):** Deadlift requires `hip-hinge, posterior-chain-activation, grip, brace`. The warmup must include at least one exercise that trains each of those four primitives. Acceptable: bodyweight RDLs (hip-hinge + posterior-chain-activation), dead hangs (grip), planks (brace). Not acceptable: cat-cow alone (trains none of the deadlift primitives).

### 2.5 The Multi-Anchor Emphasis Rule

When an exercise serves multiple anchors and is selected for a workout, its prescription must emphasize the day's anchor.

**What this affects:** coaching cues, rep schemes, loading, tempo.

**Example:** Thrusters selected for a squat day → heavier load, lower reps, cues emphasize squat drive. Thrusters selected for a press day → lighter load, higher reps, cues emphasize the press lockout. Same exercise, different prescription.

### 2.6 The Yoga Rule

Yoga movements (poses, flows) are valid exercises when they are the right tool. Use them when a specific pose targets the muscle group, pattern, or mobility quality needed, regardless of whether other exercises in the section are yoga.

**Do not** use yoga as scaffolding ("include a yoga pose for variety"). **Do not** avoid yoga as a category. Selection is driven by what the exercise *does*, not whether it falls under a yoga label.

**Example (yes):** Eagle pose in a press-day warmup to target shoulder mobility. Pigeon pose in a hinge-day cooldown to release hips. Downward dog in a warmup to stretch hamstrings.

**Example (no):** Sun salutation flow in a strength warmup because "workouts should have a yoga element." Forced inclusion violates the rule.

---

## 3. Movement Primitive Vocabulary [WORKING]

Component primitives are atomic movement qualities that complex exercises require (in the case of loaded compound lifts) or train (in the case of warmup/prep exercises). The vocabulary below is v1. Propose additions, mergers, or removals as you tag the 140 exercises.

### 3.1 Lower-Body Primitives

| Primitive | Definition |
|-----------|------------|
| `hip-hinge` | Hip-dominant flexion/extension with neutral spine. The motion underlying deadlifts, RDLs, swings. |
| `knee-flexion` | Knee bending under load. Underlies squats, lunges, step-ups. |
| `posterior-chain-activation` | Engagement of glutes, hamstrings, erectors. Trained by glute bridges, good mornings, bird dogs. |
| `ankle-mobility` | Dorsiflexion range and stability. Trained by ankle circles, weighted squats to depth, calf stretches. |
| `hip-mobility` | Hip flexor, adductor, and external rotator range. Trained by 90/90s, pigeon, deep lunges. |
| `single-leg-stability` | Unilateral lower-body balance. Trained by single-leg RDLs, split squats, balance work. |

### 3.2 Upper-Body Primitives

| Primitive | Definition |
|-----------|------------|
| `vertical-press` | Overhead pressing pattern. Underlies overhead press, push press, jerks. |
| `horizontal-press` | Forward pressing pattern. Underlies bench press, push-ups, dips. |
| `vertical-pull` | Pulling from overhead toward body. Underlies pull-ups, lat pulldowns. |
| `horizontal-pull` | Pulling from in front toward body. Underlies rows of all kinds. |
| `scapular-control` | Scapular protraction, retraction, depression, elevation. Trained by scap pull-ups, scap push-ups, band pull-aparts. |
| `shoulder-mobility` | Range across flexion, abduction, external rotation. Trained by pass-throughs, wall slides, eagle pose. |

### 3.3 Core and Stabilizer Primitives

| Primitive | Definition |
|-----------|------------|
| `brace` | Anti-extension trunk rigidity under load. Trained by planks, dead bugs, hollow holds. |
| `anti-rotation` | Resisting rotational force through the trunk. Trained by Pallof presses, suitcase carries. |
| `anti-lateral-flexion` | Resisting sideways bending. Trained by side planks, suitcase carries. |
| `thoracic-mobility` | Upper-spine rotation and extension. Trained by thread-the-needle, T-spine rotations, cat-cow. |

### 3.4 Grip, Power, and Conditioning Primitives

| Primitive | Definition |
|-----------|------------|
| `grip` | Forearm and hand endurance under load. Trained by dead hangs, farmer carries, heavy holds. |
| `triple-extension` | Simultaneous extension of hips, knees, ankles. Underlies all power movements (clean, snatch, jump). |
| `landing-mechanics` | Absorbing force with control. Trained by box step-downs, controlled jump landings. |
| `cardio-output` | Sustained heart-rate elevation. Trained by general conditioning work (jumping jacks, jump rope, light rowing). |

**Total: 20 primitives in v1.** Expected to shift during implementation. Specific concerns:

- `cardio-output` may need to split into intensity bands (low/moderate/high) once energy systems work begins. For now it is a single primitive.
- Some compound lifts may need primitives not listed (e.g., overhead squats might need a dedicated `overhead-stability` primitive). Flag and propose additions when tagging.

---

## 4. Exercise Role Vocabulary [WORKING]

The `exercise_role` field replaces the retired `surprise` anchor for exercises that don't anchor to a movement pattern. Every exercise gets exactly one role.

| Role | Definition | Example Exercises |
|------|------------|-------------------|
| `compound_lift` | Multi-joint loaded movement that can serve as a primary lift. | Deadlift, back squat, bench press, pull-up. |
| `accessory` | Single- or multi-joint movement that supports a compound lift. | Lateral raises, bicep curls, leg curls, RDLs (when not primary). |
| `activation` | Light bodyweight exercise that trains a specific primitive for movement prep. | Glute bridges, scap pull-ups, dead bugs (when used in warmup). |
| `mobility` | Movement that increases joint range or releases tension. | Downward dog, pigeon pose, 90/90s, ankle circles. |
| `conditioning` | Full-body or sustained-effort movement that builds work capacity. | Burpees, mountain climbers, rowing intervals. |
| `stability` | Movement that trains anti-motion qualities (brace, anti-rotation, anti-lateral-flexion). | Planks, Pallof presses, suitcase carries. |
| `cardio` | Sustained heart-rate work that doesn't fit conditioning's intensity profile. | Jump rope, light cycling, brisk walking. |

**Note on exercises with both an anchor and a role:** Exercises with a primary anchor (squat, hinge, press, pull, power) get the role that describes how they're typically used. A deadlift has `anchor: hinge` and `role: compound_lift`. A bodyweight RDL used for warmup has `anchor: hinge` and `role: activation`. Roles are not mutually exclusive with anchors; they layer.

---

## 5. The `surprise` Retirement [LOCKED]

The `surprise` anchor is being retired. Its current uses are dispersed and conflicting (dual identity as "dealer's choice randomizer" UI value and as "catch-all for non-pattern exercises" data tag — see CATCHUP.md traceability).

**Migration plan:**

1. Make `primary_anchor` and entries in `exercise_anchors` nullable.
2. For every exercise currently tagged `anchor: surprise`, replace the anchor with `NULL` and assign an `exercise_role` per Section 4.
3. Remove `surprise` from the `anchor_type` enum after all references are cleared.
4. Remove `SURPRISE` from the `AnchorType` enum in `src/types/workout.ts`.
5. Remove `resolveSurprise()` function and any other dead code paths in `anchor-mapping.ts`.
6. Verify `suggest_anchor()` RPC has no references (it should not — confirmed in data response).

**Selection logic for non-anchored exercises after retirement:** Selection is driven by `exercise_role` + `sections` field + `muscle_groups`, not by anchor. The prompt must be updated to query non-anchored exercises by role and section need (see Section 8).

---

## 6. Goal Definitions [LOCKED in shape, approximate in execution]

Goal definitions describe the *character* of each session, expressed as ratios across the four relationship types plus structural rules. Ratios are targets with ±5-10% tolerance per category. Drift within tolerance is acceptable when it produces a more natural workout; drift across categories that changes the session's character is not.

**Tolerance principle:** A balanced workout landing at 42/22/15/21 is fine. A balanced workout landing at 60/20/15/5 is not — it has drifted into strength-territory and lost balanced character.

### 6.1 Strength

| Relationship | Target | Notes |
|--------------|--------|-------|
| Focal | 70% | The primary lift dominates. Accessories all serve the primary. |
| Contrasting | 5% | Minimal balancing work for joint health only. |
| Prep-recovery | 25% | Warmup previews primary's component primitives. Cooldown targets worked muscles. |
| General | 0% | No conditioning finishers. No heart-rate work. Not this session's purpose. |

**Structure:** Traditional sets/reps with prescribed rest (2-5 minutes between sets of primary, 90s-3min for accessories). No timed structures in main work. The clock is not part of strength training.

**Rep scheme:** Low reps (1-6 for primary, 6-10 for accessories). Long rest. Heavy load (75-90%+ of working range for primary).

### 6.2 Hypertrophy

| Relationship | Target | Notes |
|--------------|--------|-------|
| Focal | 60% | Primary plus multiple accessories hitting the same muscle groups from different angles. |
| Contrasting | 15% | Antagonist pairings common (e.g., chest day includes back work). |
| Prep-recovery | 20% | Warmup previews primary. Cooldown stretches worked muscles. |
| General | 5% | Optional brief metabolic finisher. Not central. |

**Structure:** Sets/reps with shorter rest (60-90s typical). Tempo prescriptions (e.g., 3-second eccentric) and intensity techniques (drop sets, antagonist supersets) are appropriate.

**Rep scheme:** Moderate reps (6-15 for most work). Moderate load (65-80% of working range).

### 6.3 Conditioning

| Relationship | Target | Notes |
|--------------|--------|-------|
| Focal | 25% | Movement theme exists (e.g., hinge-conditioning day uses swings, deadlifts, broad jumps) but doesn't anchor in the strength sense. |
| Contrasting | 5% | Minimal. Not the goal. |
| Prep-recovery | 20% | Warmup builds heart rate progressively and previews conditioning movements. Cooldown brings heart rate down. |
| General | 50% | This is where conditioning lives. Full-body movements, timed structures dominate. |

**Structure:** Timed structures (AMRAP, EMOM, For Time, intervals) dominate. Traditional sets/reps appear sparingly, mostly for prep work. The clock *is* the workout.

**Future note (energy systems):** The `general` category in conditioning sessions is the future home for the aerobic / glycolytic / alactic distinction. When energy systems work begins (parked ticket — see Section 13), this section is where the implementation slots in. The 50% general allocation will be further differentiated by energy system rather than restructured.

### 6.4 Balanced

| Relationship | Target | Notes |
|--------------|--------|-------|
| Focal | 40% | Real primary lift (heavier than hypertrophy, lighter and lower-volume than pure strength) plus 1-2 supporting accessories. |
| Contrasting | 15% | Deliberate balancing work for well-roundedness within the single session. |
| Prep-recovery | 20% | Meaningful warmup previewing primary's components. Cooldown targets worked muscles. |
| General | 25% | Conditioning finisher or mid-session metabolic block. Timed structure. |

**Structure:** Mixed. Primary lift uses traditional sets/reps. The general/conditioning portion uses a timed structure. Both in the same workout.

**Character:** Balanced is the goal where all four relationship types are most visible. The bell curve shape applies — warmup builds, primary peaks intensity in load, conditioning peaks intensity in tempo, cooldown descends. This is the default goal and the one most users will experience.

### 6.5 Active Recovery

| Relationship | Target | Notes |
|--------------|--------|-------|
| Focal | 10% | Light primary movement (mobility flow, light KB work, gentle pattern). More theme than heavy lift. |
| Contrasting | 10% | Light balancing work, often anti-rotation or postural correction. |
| Prep-recovery | 70% | Dominates the session. Mobility work, gentle stretching, joint circles, breath work. |
| General | 10% | Very light heart-rate work. Walking-pace movement. No timed structures, no finishers. |

**Structure:** Low rep counts. Long holds for stretches. No rest prescriptions (movement is continuous and gentle). Intensity stays low throughout — the bell curve is flat, not a curve.

**Character:** Active recovery is the inverse of conditioning. Conditioning is "general dominates, the clock is the workout." Active recovery is "prep-recovery dominates, the body is the workout."

---

## 7. Data Layer Changes [LOCKED]

### 7.1 New Field: `component_movements`

Add to `exercise_definitions` table:

```sql
ALTER TABLE exercise_definitions
ADD COLUMN component_movements TEXT[] NOT NULL DEFAULT '{}';
```

**Values:** Drawn from the Movement Primitive Vocabulary (Section 3). Use lowercase, hyphenated identifiers exactly as listed.

**For compound lifts:** Tag with the primitives the exercise *requires* to be performed correctly.
- Example: `deadlift` → `['hip-hinge', 'posterior-chain-activation', 'grip', 'brace']`
- Example: `back-squat` → `['knee-flexion', 'hip-mobility', 'ankle-mobility', 'brace']`
- Example: `overhead-press` → `['vertical-press', 'scapular-control', 'brace', 'shoulder-mobility']`

**For accessory/activation/mobility exercises:** Tag with the primitives the exercise *trains*.
- Example: `glute-bridge` → `['posterior-chain-activation', 'hip-hinge']`
- Example: `dead-hang` → `['grip', 'scapular-control']`
- Example: `pigeon-pose` → `['hip-mobility']`

**For conditioning/cardio exercises:** Tag with `cardio-output` plus any specific patterns they train.
- Example: `burpees` → `['cardio-output', 'triple-extension', 'horizontal-press']`
- Example: `jumping-jacks` → `['cardio-output']`

### 7.2 New Field: `exercise_role`

Add to `exercise_definitions` table:

```sql
CREATE TYPE exercise_role AS ENUM (
  'compound_lift', 'accessory', 'activation',
  'mobility', 'conditioning', 'stability', 'cardio'
);

ALTER TABLE exercise_definitions
ADD COLUMN role exercise_role NOT NULL DEFAULT 'accessory';
```

Every exercise gets exactly one role per the vocabulary in Section 4.

### 7.3 `surprise` Removal

Execute the migration plan from Section 5 in this order:

1. Make `primary_anchor` in `exercise_definitions` nullable.
2. Make rows in `exercise_anchors` deletable without breaking FK constraints (drop NOT NULL on relevant columns if needed).
3. For each exercise currently anchored as `surprise`:
   - Delete the `surprise` entries from `exercise_anchors`.
   - Set `primary_anchor = NULL` if the exercise has no other anchors.
   - Assign `exercise_role` per Section 4.
4. Remove `surprise` from the `anchor_type` enum.
5. Remove the `SURPRISE` literal from `AnchorType` in `src/types/workout.ts`.
6. Remove `resolveSurprise()` and related dead code from `src/lib/anchor-mapping.ts`.
7. Remove any references in `AnchorGrid.tsx` if the file still exists.

### 7.4 View Update

Update `exercise_definitions_with_anchors` view to include `component_movements` and `role` fields. The exercise listing sent to the prompt must include both.

**New prompt line format:**

```
deadlift | Deadlift | role:compound_lift | equipment:[barbell] | sections:[primary_lift,accessory] [PRIMARY w/barbell] | anchors:[hinge,pull] | components:[hip-hinge,posterior-chain-activation,grip,brace] | muscles:[hamstrings:primary,glutes:primary,erectors:primary,traps:synergist,lats:synergist,forearms:stabilizer,core:stabilizer] | regression:rdl
```

### 7.5 Migration Concerns

- All 140 exercises must be tagged with `component_movements` and `role` before the prompt rewrite ships. Partial migration would cause inconsistent generation behavior.
- The migration is non-trivial (~140 rows × 2 fields = 280 manual assignments). Batch the work into role-grouped sessions: all compound lifts first, then accessories, then mobility, etc. Group-by-role makes the work less error-prone than going alphabetically.
- Validate after migration: every exercise has a non-empty `role`, every compound_lift has at least 3 entries in `component_movements`, every activation/mobility exercise has at least 1.

---

## 8. Prompt Layer Changes [LOCKED]

### 8.1 New Top-Level Section: Thematic Framework

Insert at the top of the system prompt, above existing sections. Contents:

- The Universal Theme Rule (Section 2.1)
- The Four Relationship Types with definitions (Section 2.2)
- The Exercise Inclusion Rule (Section 2.3)
- The Component Prep Rule (Section 2.4)
- The Multi-Anchor Emphasis Rule (Section 2.5)
- The Yoga Rule (Section 2.6)

These rules apply to every generation regardless of goal. They are the constitution.

### 8.2 Replace Section: Goal Handling

The current prompt uses goal to determine section templates ("strength has 4 sections: warmup, primary, accessory, cooldown"). Replace with goal-as-character: goal determines ratios and structural preferences, not section count.

Each of the five goals (Section 6) becomes a sub-section in the prompt:

- Target ratios for the four relationship types (with explicit ±5-10% tolerance language)
- Structure preference (sets/reps vs. timed)
- Rep scheme guidance
- Character note ("this is what makes this session feel like itself")

### 8.3 Rewrite Section: Warmup Logic

Current warmup logic ("3-phase: general → pattern prep → ramp") is replaced with component-driven logic:

1. Identify the day's anchor exercise (the primary lift).
2. List its `component_movements`.
3. Build the warmup such that every primitive in that list is trained by at least one warmup exercise.
4. If duration permits, add heat-building general work (jumping jacks, light cardio) after component coverage is complete.
5. Warmup duration target: 5-7 minutes for a 60-minute session. Scale proportionally for other durations.

**Hard rule:** Component coverage is mandatory. Heat-building is optional. If short on time, drop heat-building first.

### 8.4 Rewrite Section: Cooldown Logic

Cooldown targets the muscles worked in the session. Identify the primary lift's `muscle_groups` (primary + synergist roles only, not stabilizer), and build a cooldown that stretches or releases each. Duration target: 3-5 minutes for a 60-minute session.

### 8.5 Update Section: Anchor Interpretation

Remove all references to `surprise`. Add explicit logic for handling exercises with `exercise_role` but no anchor — these are selected by role and section need, not by anchor matching.

### 8.6 Update Section: Exercise Selection

Current logic primarily uses `anchors` and `muscle_groups`. Update to use:

- `anchor` match (primary or secondary) for thematic inclusion
- `role` for sectional appropriateness (activation in warmup, compound_lift as primary, etc.)
- `muscle_groups` for muscle coverage and balance
- `component_movements` for warmup component verification

### 8.7 Add Section: Tolerance Language

Add an explicit paragraph stating that goal ratios are targets, not constraints, and that drift within ±5-10% per category is acceptable when it produces a more natural workout. Drift that changes the session's overall character is not acceptable.

---

## 9. Generation Logic Changes [LOCKED]

### 9.1 Exercise Filtering

Update the exercise library query to filter by:

1. Equipment availability (existing logic, unchanged).
2. `sections` field includes the section being built (existing logic, unchanged).
3. **New:** For sections that thematically depend on the day's anchor (primary_lift, accessory), filter to exercises where `primary_anchor = day_anchor OR day_anchor IN secondary_anchors`.
4. **New:** For non-thematic sections (warmup, cooldown, general conditioning), filter primarily by `role` and `muscle_groups`, not by anchor.

### 9.2 Warmup Component Verification

After the AI returns a generated workout, verify (in code, not the prompt) that every component primitive of the day's anchor exercise is trained by at least one warmup exercise. If gaps exist, log a warning. (Hard enforcement via regeneration is out of scope for v1; logging is sufficient to surface drift.)

### 9.3 No Changes Required

The following continue to work as-is:

- `suggest_anchor()` RPC (already uses only the LOWER/UPPER/FULL BODY surface)
- Weekly muscle coverage tracking
- Per-set logging
- History-aware balancing

---

## 10. Decision Rules for Conflicts [LOCKED]

When two rules tension against each other, the following priority applies:

1. **Safety / equipment availability** wins over everything. Never generate an exercise the user can't perform.
2. **The Component Prep Rule** (Section 2.4) wins over heat-building. Drop general warmup work before dropping component coverage.
3. **The Exercise Inclusion Rule** (Section 2.3) wins over ratio targets. Better to miss a ratio than include an off-theme exercise.
4. **Duration cap** wins over ratio targets. If the user requested 30 minutes, fit the work to 30 minutes — drop `general` first, then `contrasting`.
5. **Goal character** wins over individual ratio precision. ±5-10% drift is fine; drift that crosses into another goal's character is not.
6. **User override notes** win over auto-suggested anchor. If the user explicitly requests a different focus, honor it.

---

## 11. Acceptance Criteria [LOCKED]

### 11.1 Data Layer

- [ ] `component_movements` field exists on `exercise_definitions`.
- [ ] All 140 exercises have non-empty `component_movements` if they are compound lifts, or have appropriate primitives if accessory/activation/mobility.
- [ ] `exercise_role` field exists on `exercise_definitions`.
- [ ] All 140 exercises have a non-null `role`.
- [ ] All `surprise` anchor references removed from active code paths (DB enum, TypeScript types, anchor-mapping logic).
- [ ] `exercise_definitions_with_anchors` view exposes `component_movements` and `role`.

### 11.2 Prompt Layer

- [ ] Thematic framework section is at the top of the system prompt and applies to all goals.
- [ ] Goal section is replaced with goal-as-character (ratios + structure + character note) for all five goals.
- [ ] Warmup logic uses component coverage, not 3-phase template.
- [ ] All `surprise` references removed from the prompt.
- [ ] Exercise listing format includes `role` and `components` fields.
- [ ] Tolerance language for ratios is explicit.

### 11.3 Generation Logic

- [ ] Exercise filtering uses anchor match for thematic sections and role/muscle match for non-thematic sections.
- [ ] Warmup component verification logs gaps (no regeneration required in v1).

### 11.4 Quality Verification

After implementation, generate one workout for each of the five goals at intensity 7, 60 minutes, with a clear anchor. Verify:

- [ ] Every exercise can be classified as one of the four relationship types relative to the anchor.
- [ ] Warmup trains every component primitive of the primary lift.
- [ ] Cooldown targets the muscles worked.
- [ ] Goal ratios are hit within ±10% per category.
- [ ] Conditioning sessions use timed structures; strength sessions do not.
- [ ] No `surprise` anchor appears anywhere in the output.

---

## 12. Out of Scope [LOCKED]

The following are explicitly **not** part of this spec:

- **Energy systems classification** for conditioning work (aerobic/glycolytic/alactic). Parked. See ticket to be filed (Section 13).
- **Coaching cues from database** (#37). Adjacent but separate. Coaching cues continue to be AI-generated for now.
- **Adaptive learning / per-user personalization** (issues #51–#56). Blocked on this spec landing first.
- **Single-page workout view** (#50). UI work, unrelated.
- **Movement primitive UI exposure.** The vocabulary is internal-only. End users never see primitive names.
- **Renaming the four relationship types in user-facing copy.** The labels (focal, contrasting, prep-recovery, general) are internal classifications. Users see workouts, not classifications.

---

## 13. Adjacent Tickets to File

After this spec ships, file the following tickets:

### 13.1 Energy Systems Classification [High Priority]

**Title:** Add energy_system tagging to conditioning exercises and structures

**Body:** Once base generation quality from `Clear_-_Workout_Anatomy_Spec.md` is stable, extend the `conditioning` and `cardio` exercise roles with an `energy_system` field (aerobic / glycolytic / alactic). Use it in weekly coverage logic, similar to muscle group coverage, so conditioning variety is tracked across sessions. The conditioning goal definition in the Workout Anatomy Spec is the natural home for this work — the `general` category (50% of conditioning sessions) is where the differentiation will be applied. Reference Section 6.3 of the spec.

### 13.2 `surprise` Cleanup Migration [Track as Discrete Work]

**Title:** Remove `surprise` from anchor_type enum and related code paths

**Body:** Part of `Clear_-_Workout_Anatomy_Spec.md` implementation. Tracked separately because it touches multiple migration files, the TypeScript type system, and dead code in anchor-mapping. See Section 7.3 of the spec for the exact migration plan.

### 13.3 Coaching Cues from Database [Adjacent, Not Required]

**Title:** Move coaching cues from AI-generated to database-stored

**Body:** Existing ticket #37. Flagged as adjacent to the Workout Anatomy Spec because it would compound well with the new framework (specifically the Multi-Anchor Emphasis Rule, Section 2.5, which would benefit from pre-written context-specific cues). Not required for the spec to ship.

---

## 14. Traceability

This spec consolidates decisions made in conversation across multiple Clear planning sessions. For reference only — implementation should use this spec as the source of truth, not the source docs.

- **`Clear_-_Generation_Philosophy.md`** — The April 2026 philosophy doc that established the thematic-coherence direction and questioned the goal-as-section-templates approach.
- **`Clear_-_Alchemy_Manual_Digest.md`** — Reference material on movement preparation, the bell curve, the foundational movement hierarchy, and the C2E principle that informed the relationship framework.
- **`CATCHUP.md`** — May 2026 context transfer covering the state of the system at the time this spec was authored, including the May 21 test generation that surfaced the quality issues this spec addresses.
