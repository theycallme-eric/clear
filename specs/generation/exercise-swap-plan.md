# SESSION PLAN: Exercise Swap (Phase A)

## Session Goal
Implement context-aware exercise swapping on the Review screen (Screen 2) — single exercise swap, unit swap for grouped structures, swap history with 3-swap limit.

## Context
- **Spec:** `Clear_-_Exercise_Swap_Spec.md` — READ THIS FULLY BEFORE STARTING
- **Review screen wireframe:** `Clear_-_Screen_2__Review___Edit__Wireframe_.md`
- **Data model / API shape:** `Clear_-_Data_Model_UPDATED.md` (see `POST /generate/section`)
- **Prompt reference:** `Clear_-_Workout_Generation_Prompt_v3.md`
- **Structure types:** `Clear_-_Structure_Types_Spec.md`
- **Design tokens:** `design-tokens.json`, `design-tokens-colors.js`
- **Current state:** Review screen exists with "Randomize Section" button (not wired up). Exercise cards expand/collapse. No swap functionality exists yet.

## Important: Read the Spec First
The spec at `Clear_-_Exercise_Swap_Spec.md` contains all design decisions, API shapes, state management patterns, and acceptance criteria. Every task below references it. Read it fully before writing any code.

---

## Tasks

### 1. Extend `POST /generate/section` Edge Function
**Do:**
- Open `supabase/functions/generate-workout/index.ts` (or wherever the section generation edge function lives — find it first)
- Add support for three new request fields: `swap_mode` ('section' | 'single' | 'unit'), `swap_target`, and `keep_exercises`
- Implement three prompt variations based on `swap_mode` (see spec → API Design → Prompt Strategy for exact prompt text):
  - `single` — replace one exercise, context of what stays
  - `single` within circuit — replace one exercise, context of other circuit exercises
  - `unit` — replace entire group (superset/EMOM/AMRAP/For Time), maintain structure type
- Existing `swap_mode: 'section'` behavior (or calls without `swap_mode`) should work exactly as before — this is backward compatible
- Validate that the AI response maintains the correct structure type for unit swaps
- Add `swap_mode` to request type definitions

**Acceptance:**
- [ ] Existing section regeneration still works (backward compatible)
- [ ] Single swap mode returns a full section with one exercise replaced
- [ ] Unit swap mode returns a full section with the group replaced, same structure type
- [ ] Circuit swap includes other circuit exercises in prompt context
- [ ] Request types updated in TypeScript

**Update:** `PROJECT_MAP.md` if edge function structure changes

---

### 2. Remove "Randomize Section" Button
**Do:**
- Find the "Randomize Section" button in the Review screen component
- Remove it from every section card
- Do NOT remove the underlying API call logic — we'll reuse it for the swap feature

**Acceptance:**
- [ ] No "Randomize Section" button visible on any section card
- [ ] No console errors or broken layouts from removal
- [ ] Underlying section generation API utility still exists and is importable

---

### 3. Add Swap State Management
**Do:**
- Create swap state tracking alongside the existing `generatedWorkout` state (or equivalent) in the Review screen
- Implement the `SwapSlot` and `SwapState` interfaces from the spec:
  ```typescript
  interface SwapSlot {
    current: GeneratedExercise | GeneratedExercise[];
    history: (GeneratedExercise | GeneratedExercise[])[];
    swapCount: number;
  }
  ```
- State is keyed by section type + exercise index (for single) or section type + group ID (for unit)
- Implement helper functions:
  - `performSwap(sectionType, targetIndex, newExercise)` — updates workout state, pushes old exercise to history, increments counter
  - `performUnitSwap(sectionType, groupId, newExercises)` — same but for grouped exercises
  - `revertToPrevious(sectionType, targetIndex)` — cycles backward through history, no API call
- History capped at 3 entries per slot (oldest drops off)
- Nothing persists to database — all in-memory until "Start Workout"

**Acceptance:**
- [ ] Swap state initializes empty when workout loads
- [ ] `performSwap` updates the correct exercise and tracks history
- [ ] `performUnitSwap` updates all exercises in a group
- [ ] `revertToPrevious` restores the prior exercise without API call
- [ ] History stays capped at 3
- [ ] Swap counter increments correctly

---

### 4. Single Exercise Swap UI
**Do:**
- Add a swap icon (↻) inside expanded exercise details on exercises with `structure.type === 'standard'`
- Add the same swap icon on individual exercises inside circuits (`structure.type === 'circuit'`)
- Icon is ONLY visible when the exercise card is expanded — not visible in collapsed state
- Icon spec: 16-20px icon, 44×44px touch target, muted color default, primary on hover/tap
- Use design tokens for all colors — no hardcoded values
- On tap:
  1. Disable icon, show placeholder loading state (dim card to opacity 0.5, spinner replaces swap icon)
  2. Call `POST /generate/section` with `swap_mode: 'single'`, exercise context, and `keep_exercises`
  3. Extract replacement exercise from response
  4. Call `performSwap()` to update state
  5. Card updates with new exercise
- Debounce: 2-second minimum between swap calls per slot
- On error: show inline error on card, preserve existing exercise, do not count toward swap limit
- After first swap on a slot, show "← Previous" button next to swap icon
- "Previous" taps call `revertToPrevious()` — no API call, cycles through history
- After 3 swaps: disable swap icon, fire informational toast: "Nothing feeling right? Try regenerating with different inputs." with "Regenerate Workout" action that navigates to Screen 1 with current settings pre-filled
- Toast auto-dismisses after standard duration; swap icon stays disabled
- Use existing toast component with informational variant

**Acceptance:**
- [ ] Swap icon visible only inside expanded details on standard + circuit exercises
- [ ] Swap icon hidden on collapsed cards
- [ ] Swap icon hidden on superset/EMOM/AMRAP/For Time exercises (these use unit swap)
- [ ] Tapping swap triggers API call with full context
- [ ] Only the targeted exercise updates
- [ ] Loading state: card dims, spinner on icon
- [ ] Error preserves existing exercise
- [ ] "Previous" button appears after first swap
- [ ] Previous cycles through history without API calls
- [ ] After 3 swaps: icon disabled + informational toast shown
- [ ] Touch target ≥ 44px
- [ ] All styling uses design tokens

---

### 5. Unit Swap UI
**Do:**
- For superset groups: add one swap icon labeled "Swap Pair" on the expanded superset container
- For EMOM/AMRAP/For Time/Ladder blocks: add one swap icon labeled "Swap Block" on the expanded block container
- Icon placement: bottom of the expanded group, same style as single swap icon
- On tap:
  1. Dim all cards in the group, show spinner on the group container
  2. Call `POST /generate/section` with `swap_mode: 'unit'`, group context
  3. Extract replacement group from response
  4. Call `performUnitSwap()` to update state
  5. All cards in the group update together
- Same swap limit (3), history, previous, and toast behavior as single swap — but tracked per group, not per exercise within the group
- Debounce: 2-second minimum

**Acceptance:**
- [ ] Superset pairs show "Swap Pair" icon on expanded group
- [ ] EMOM/AMRAP/For Time/Ladder blocks show "Swap Block" icon on expanded group
- [ ] No individual swap icons on exercises within these groups
- [ ] Tapping swap replaces the entire unit
- [ ] AI returns replacement with same structure type
- [ ] All cards in the group update together
- [ ] Loading state dims all group cards
- [ ] Swap limit + history + previous work per group

---

### 6. Verify Edge Cases
**Do:**
- Test: Section with one standard exercise (swap icon appears, works normally)
- Test: Section that is entirely one EMOM block (unit swap = full section replacement)
- Test: Circuit with 4 exercises, swap one — other 3 unchanged
- Test: Swap 3 times on same slot → icon disables, toast fires
- Test: Use "Previous" to cycle back through all 3 history entries
- Test: Error during swap → exercise preserved, counter not incremented
- Test: Rapid tapping swap → debounce prevents multiple API calls
- Test on mobile viewport — touch targets ≥ 44px, no layout shifts during loading

**Acceptance:**
- [ ] All edge cases pass
- [ ] No layout shifts or broken states
- [ ] Mobile-friendly

---

## Design System Compliance
- Use tokens from `design-tokens.json` — no hardcoded colors, spacing, or font values
- Match existing exercise card patterns and component structure
- Toast uses existing toast component with informational variant
- Icons use existing icon system/library
- Mobile-first: all touch targets ≥ 44px

## After Session (REQUIRED — you are not done until this is complete)
- [ ] Update `SESSION_LOG.md` with: Date, Tasks Completed, Files Touched
- [ ] Update `PROJECT_MAP.md` if architecture changed (edge function extension, new state patterns)
- [ ] Add to `BACKLOG.md`: "Exercise Swap Phase B — multi-select edit mode" (if not already there)
- [ ] Mark completed items as `[x]` in `BACKLOG.md`
- [ ] Confirm: "Session complete. Log and Backlog updated. Ready for next plan."
