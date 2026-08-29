# CLEAR - Full Project Summary for Rebuild

> This document captures everything about the existing CLEAR app — what it does, how it's built, what's planned, and what the user wants to do next. It's intended as a handoff to an AI assistant tasked with producing a requirements spec and DAG-based task breakdown for a ground-up rebuild.

---

## What Is CLEAR?

CLEAR is an AI-powered workout generator and tracker with a distinctive low-tech sci-fi aesthetic (Star Wars, Alien, Blade Runner, Cyberpunk 2077, Evangelion). It's a personal tool — no social features, no gamification, no subscriptions.

**One-line pitch:** Set intensity + anchor + goal, tap generate, get a full workout in 30 seconds. Execute it, log your weights, done.

**Target users:**
- **Alex (primary):** Knows the gym, hates planning. Generates workouts AT the gym. Needs zero friction.
- **Jordan:** Beginner who needs coaching cues and structure to build confidence.
- **Sam:** Time-crunched parent who needs efficient 25-40 min sessions.

---

## Current Tech Stack

- **Frontend:** React 19 + TypeScript + Vite (SPA, no SSR)
- **Styling:** CSS custom properties (design tokens), no CSS framework (no Tailwind, no component library)
- **Routing:** React Router DOM 7.x (client-side)
- **State:** React Context (auth, workout flow, home data) + React Query v5 (server state)
- **Backend:** Supabase (PostgreSQL + Auth + Edge Functions + Row-Level Security)
- **AI:** Anthropic Claude API called via Supabase Edge Functions (Deno)
- **Deployment:** Vercel (frontend) + Supabase Cloud (backend)
- **Testing:** Vitest + React Testing Library
- **Icons:** Custom wrapper around Lucide React (48 icons)

**Explicit exclusions in current build:** No Tailwind, no styled-components, no MUI/Chakra, no SSR, no server components.

---

## Feature Inventory

### Currently Built & Working

#### Authentication & Onboarding
- Email/OTP login via Supabase Auth (migrated from password-based)
- Protected routes (redirect to login if unauthenticated)
- Onboarding flow: experience level, goal preset, location/equipment setup, section preferences, limitations (free text)
- Profile stored in `profiles` table with all preferences

#### Home Screen
- Streak display with 7-day weekly breakdown (workout/rest/upcoming)
- Quick action cards: "Generate Workout" + "Quick Start"
- Tabbed panel: History (recent 3) + Favorites
- Mark Rest Day functionality
- Incomplete session resumption prompt
- Suggested intensity & anchor based on workout history

#### Workout Generation (AI-Powered)
- **Inputs:** Intensity (1-10 slider), Anchor (Upper Body / Lower Body / Full Body / Power), Goal Preset, Location/Equipment, optional time target (default 45 min), optional notes
- **AI Model:** Claude Sonnet via Supabase Edge Function
- **Intelligence:**
  - Anchor-aware exercise filtering (only exercises relevant to day's focus)
  - Muscle group balancing (considers last 7 days of coverage)
  - Recent exercise avoidance (variety enforcement)
  - Equipment validation (only uses what's available)
  - Duration targeting (+/-10% tolerance)
  - Section compliance (respects user's enabled sections per goal)
- **Exercise library:** 200+ exercises in database with metadata (equipment options, coaching cues, progression/regression paths, muscle groups with roles, component movements, applicable sections)
- **Validation pipeline:** Parses Claude JSON response, validates exercise IDs, equipment, sections, duration. Retries once on failure.

#### Review Screen
- Displays generated workout structure (sections & exercises)
- Estimated duration, intensity & anchor summary
- Exercise/section swapping via AI regeneration
  - Single swap (one exercise)
  - Unit swap (entire superset/EMOM/AMRAP block)
  - Swap history (up to 3 per slot, with undo)
  - Nudge after 3 swaps to regenerate entirely
- "Start Workout" and "Regenerate" actions

#### Active Workout Execution
- Section-by-section progression
- Progress tracker (visual bar)
- Six structure types supported:
  - **Standard:** Traditional sets x reps with rest
  - **Superset:** Two exercises back-to-back, rest after both
  - **Circuit:** 3+ exercises x rounds
  - **EMOM:** Fixed work at top of each minute, rest fills remainder
  - **AMRAP:** Max rounds in a time box
  - **For Time:** Fixed work, race to finish with time cap
- Rep schemes: fixed, ladder_down, ladder_up, pyramid, inverse, n_plus_one, ladder_fixed_interval
- Per-exercise: set logging (weight, reps, RPE), coaching cues (expandable), regression suggestions, notes
- Rest timer with countdown
- Global session timer
- Workout navigation (prev/next section)

#### Post-Workout Summary
- Mood rating (1-5)
- Session notes capture
- Streak update display
- Save as favorite option

#### History & Favorites
- Chronological workout history list
- Per-workout detail view (sections, exercises, logged sets)
- Saved workout templates (favorites)
- Tracks completion count & last completion date per favorite
- One-click restart from favorite

#### Settings
- Location management (CRUD, set default)
- Equipment tier selection (minimal / home / building / full)
- Goal preset update
- Workout structure customization (enable/disable sections)
- Limitations update (free text)
- Sign out

### Planned / Spec'd But Not Yet Built

#### Near-term (spec'd in detail)
- Goal-based generation v3 (refined prompt, better section scaling per goal)
- EMOM clarity: minute indicators, active/inactive highlighting, ODD/EVEN MIN labels
- Ladder/For Time restructure: rep scheme shown once, rung selector on cap hit, distinct completion paths (under cap vs. cap reached)
- AMRAP logging improvements: completion state, partial round tracking
- Favorites v2: progression tracking, personal bests (min time for For Time, max rounds for AMRAP), "last time" weight display on repeats, completion history snapshots

#### Medium-term (discussed in docs)
- Progressive overload engine
- 1RM testing mode
- Mid-workout exercise swaps (swap during execution, not just review)
- Inline exercise editing (modify sets/reps before starting)
- Per-exercise progression charts

#### Long-term (backlog)
- Offline support (cache + sync)
- Coaching cues enrichment
- History pruning/retention policies
- App Store distribution (Capacitor or PWA wrapper)

---

## Data Model

### Core Tables

**profiles**
- `id` (UUID, FK to auth.users), `onboarding_completed`, `experience_level` (new/some/confident), `goal_preset` (strength/hypertrophy/conditioning/balanced/active_recovery), `limitations` (text), `enabled_sections` (array of section_type), `default_location_id` (FK), `streak_count`, `streak_status` (active/paused), `streak_pause_reason` (injury/sick/vacation), `streak_start_date`, `streak_pause_start`, `consecutive_rest_days`

**locations**
- `id`, `user_id` (FK), `name`, `tier` (minimal/home/building/full), `equipment` (text array), `is_default`

**workout_sessions**
- `id`, `user_id` (FK), `date`, `anchor` (squat/hinge/press/pull/power/upper_body/lower_body/full_body), `intensity` (1-10), `goal_preset`, `location_id` (FK), `duration_mins`, `is_rest_day`, `counts_for_streak`, `mood`, `session_notes`, `completed_at`, `started_at`, `generation_notes`, `prompt_version`, `rest_day_reason` (rest/injury/sick), `time_target_mins`

**workout_sections**
- `id`, `session_id` (FK), `section_type` (warmup/mobility/primary_lift/accessory/skill_power/carries/core/stability_balance/conditioning/cooldown), `order_index`, `status` (not_started/completed/skipped), `section_notes`, `started_at`, `completed_at`

**exercises**
- `id`, `section_id` (FK), `exercise_id` (FK to exercise_definitions), `name`, `order_index`, `sets`, `reps` (string), `equipment_used`, `effort_percent`, `tempo`, `rest_seconds`, `coaching_cues`, `exercise_notes`, `weight_logged`, `structure` (JSON for circuit/superset/emom/amrap metadata)

**exercise_set_logs**
- `id`, `exercise_row_id` (FK), `set_number`, `reps`, `weight`, `weight_unit`, `rpe` (1-10), `is_warmup_set`

**exercise_definitions** (master library, read-only)
- `id`, `name`, `default_equipment`, `equipment_options` (array), `sections` (array of applicable section_types), `coaching_cues` (array), `progression` (FK), `regression` (FK), `can_be_primary`, `exercise_role` (compound_lift/accessory/activation/mobility/conditioning/stability/cardio), `component_movements` (array: squat/hinge/push/pull), `equipment_display_names` (JSON)

**exercise_anchors**
- `exercise_id` (FK), `anchor` (enum), `is_primary`

**exercise_muscle_groups**
- `exercise_id`, `muscle_group` (e.g., "chest", "quadriceps"), `role` (primary/synergist/stabilizer)

**structure_results** (timed section outcomes)
- `id`, `section_id` (FK), `structure_type`, `rounds_completed`, `highest_rung`, `completion_time_seconds`, `completed_under_cap`, `rep_scheme`, `notes`

**saved_workouts** (favorites)
- `id`, `user_id`, `title`, `original_session_id` (FK), `workout_snapshot` (JSON), `anchor`, `intensity`, `duration_mins`, `goal_preset`, `times_completed`, `last_completed_at`

**saved_workout_completions**
- `id`, `saved_workout_id` (FK), `session_id` (FK), `completed_at`

### Key Enums
- `anchor_type`: squat, hinge, press, pull, power, upper_body, lower_body, full_body
- `section_type`: warmup, mobility, primary_lift, accessory, skill_power, carries, core, stability_balance, conditioning, cooldown
- `experience_level`: new, some, confident
- `goal_preset`: strength, hypertrophy, conditioning, balanced, active_recovery
- `equipment_tier`: minimal, home, building, full
- `section_status`: not_started, completed, skipped

### Database Infrastructure
- ~30 migrations (schema evolution from v1 to current)
- Row-Level Security (RLS) on all tables — users can only access their own data
- RPC functions for atomic operations:
  - `complete_onboarding()` — creates location + updates profile in single transaction
  - `save_generated_workout()` — persists full workout structure atomically
  - `suggest_anchor()` — analyzes history, suggests least-recently-trained anchor
  - `get_last_set_data()` — retrieves previous weights for pre-fill

---

## AI Generation Architecture

### Edge Functions
- `generate-workout` (main): Receives user context, builds prompt with exercise library + history + preferences, calls Claude, validates response, returns structured workout
- `generate-section`: Narrower scope — regenerates individual section or exercise for swapping

### Prompt Structure
- **System prompt:** Workout design rules, structure type definitions, intensity model, goal-based scaling
- **User prompt (constructed per request):** User profile (experience, limitations), request params (intensity, anchor, goal, duration), recent workout history (exercises to avoid), full exercise library with metadata, weekly muscle group coverage

### Intensity Model (locked design decision)
- 1-10 continuous scale
- Controls *content within sections* (movement difficulty, rep counts, load percentages, time caps)
- Does NOT control *which sections appear* (that's the goal's job)
- 1-2 = Recovery, 3-4 = Light, 5-7 = Standard, 8-10 = Push

### Section Scaling by Goal (locked)
- **Strength:** Primary lift 40-50% of time, no conditioning, rest 120-180s
- **Hypertrophy:** Accessory 40-50%, supersets default, rest 45-90s
- **Conditioning:** 50-60% conditioning blocks, no primary lift, rest 30-45s
- **Balanced:** All sections, spread evenly
- **Active Recovery:** Warmup + mobility + cooldown ONLY, intensity locked 1-3

---

## Design System

### Visual Identity
- **Metaphor:** Low-tech sci-fi OS for the body
- **Chamfered corners** everywhere (no rounded corners) — signature aesthetic via CSS clip-path
- **Emissive surfaces:** Alpha transparency (10-60% opacity), light-on-dark, translucent/glassy
- **Two themes:** Orange mode (orange = structure, blue = interaction) and Blue mode (swapped)
- **Green** = selection/confirmation, **Red** = urgency only (timer warnings)

### Typography (three fonts, three jobs)
- **Rajdhani:** Headings, titles — bold, uppercase, wide tracking
- **Oxanium:** Labels, CTAs, timers, data readouts — bold, uppercase, widest tracking
- **Space Grotesk:** Body text, descriptions — medium weight, normal case
- CSS classes: `.text-heading-h1` through `.text-paragraph-xl`, `.text-cta-xs` through `.text-cta-lg`, `.text-label-xs` through `.text-label-xl`, `.text-time-lg`/`xl`, `.text-tab-xs` through `.text-tab-xl`

### Color Palette (primitives)
- Orange: #F87823 (primary) + alpha variants
- Blue: #00A9F4 (secondary) + alpha variants
- Green: #99DD39 (selection)
- Red: #CD1958 (urgency)
- Purple: #A368FF (info)
- Neutrals: #171717 (dark bg) through #F1F1F1 (light surface)

### Semantic Token Layer
- `--surface-*`: Card/background surfaces
- `--text-*`: Header, paragraph, muted, disabled
- `--border-*`: Border colors
- `--icon-*`: Icon colors
- `--background`: Page background
- All themed — swap between orange and blue modes

### Spacing Scale
- 16 steps: `--spacing-0` (0px) through `--spacing-1600` (256px)
- Key values: `--spacing-200` (8px), `--spacing-400` (16px), `--spacing-600` (24px)

### Atmosphere Effects
- **Scanlines:** Faint horizontal lines via repeating-linear-gradient
- **Grain overlay:** Texture + global scan lines (page-level only)
- **Pulse/micro-flicker:** Brightness oscillation on structural elements
- **Glow emissive:** Text-shadow on key data (timers, streak, logo)
- **Stagger reveal:** Children materialize in sequence (CSS animation)

### Motion Rules
- Linear or stepped timing only — NO bounce, spring, or elastic easing
- 150-200ms max for transitions
- One exception: ChamferedFrame color transitions use 1-second ease (the system's "heartbeat")
- Every animation must communicate a state change — no decorative motion

### Voice & Copy
- Terse, imperative, gym-literate
- "Initiate Workout" not "Let's get started!"
- Labels are stenciled, not sentences — "Int. 7" not "Intensity Level: 7"
- Earned celebration only — "Nice Work!" then straight to debrief
- No guilt, no pressure, no gamification language

---

## Routing Map

```
/ .................. Home (protected, requires auth + onboarding)
/welcome ........... Welcome screen (public only)
/login ............. OTP login (public only)
/onboarding ........ First-time setup (auth'd, not yet onboarded)
/generate .......... Workout configuration
/review ............ Pre-workout briefing
/workout ........... Active execution
/summary ........... Post-workout debrief
/history ........... Past workouts list
/history/:id ....... Single workout detail
/settings .......... User preferences (sub-views: hub, locations, editLocation, addLocation, structure, limitations)
/dev/gallery ....... Component gallery (dev only)
/dev/test-workout .. Test playground (dev only)
* .................. 404 fallback
```

---

## Component Inventory (Key Components)

**Layout:** AppLayout, WorkoutLayout, PageHeader, Card, ChamferedFrame, LeftColumn, RightColumn

**Forms/Input:** CTAButton, ActionButton, IntensitySlider, LocationAccordion, OptionalFields, Checkbox, RadioButton, Input, Textarea, FilterDropdown

**Data Display:** WorkoutListItem, FavoriteListItem, ExerciseCard, WorkoutOverview, WeekStreakDisplay, TimerDisplay, ProgressTracker

**Workout-Specific:** ActiveExerciseCard (largest component ~30KB — handles all 6 structure types), SectionRenderer, SectionTimer, RestTimerBar, WorkoutNavigation, GlobalTimer, StructureCards, SupersetRenderer, CircuitRenderer, LadderRenderer, TimedRenderer

**Feedback/Status:** LoadingScreen, FullscreenLoader, BootScreen, ErrorState, ConfirmationModal, BottomSheet, TabbedPanel, EmptyState, ChamferedToast

**Decorative:** ClearLogo, Chip, MoodIcon, CornerAngle, AnimatedBackground, ScanLoader, CardLoader

---

## What The User Wants To Do

### The Goal
Rebuild CLEAR from the ground up with better architecture and engineering practices. This is explicitly a learning exercise — the user wants to understand professional development workflows by doing.

### The Process They Want To Learn
1. **Requirements spec** — comprehensive document covering all features
2. **GitHub Issues** — break the spec into discrete, well-scoped tasks with acceptance criteria
3. **DAG (Directed Acyclic Graph)** — map task dependencies so work can be parallelized and agents can pick up issues in the right order
4. **Agent-driven execution** — each issue is self-contained enough for an AI agent to implement

### Why Rebuild Instead of Refactor
- Original code was built while learning, resulting in spaghetti architecture
- The clunkiness has prevented the user from continuing development or using the app themselves
- They've learned better patterns from developers they work with and want to apply them
- Clean rebuild allows establishing proper foundations (testing, CI/CD, component architecture) from day one

### Design System: Build in Claude Design First
The user has been working in Claude Design (Pencil) to rebuild the design system properly. The existing design tokens and components evolved organically and are messy. **The rebuild should treat a finalized Claude Design export as the source of truth for the design system layer.**

Recommended sequence:
1. Finalize design system in Claude Design (tokens, component variants, states, spacing)
2. Export as a .zip (design handoff artifact)
3. Use that export as the spec for the design token and base component layers of the DAG
4. Code implementation becomes translation from the design spec, not interpretation

The design philosophy is already locked (see Design System section below) — Claude Design work is about making it concrete and complete, not redefining it.

The .zip export from Claude Design should be placed in the project and referenced during the component implementation phase. It will contain the finalized token values, component specs, and visual references that code tasks should implement against.

### Additional Context
- They want to potentially get it to App Store (fine with web-based approach like Capacitor/PWA)
- They want the rebuild to incorporate planned features, not just replicate what exists
- They're interested in understanding (but not expert in): monorepo structure, TDD, CI/CD, feature flags, state management patterns

---

## Key Files in the Existing Repo

For reference if direct codebase access is available at `/Users/eric/clear-app`:

- `CLAUDE.md` — Project instructions, decision tree, critical rules
- `DEVELOPMENT.md` — Local dev setup, Supabase commands, troubleshooting
- `src/index.css` — All design tokens (2000+ lines, both themes)
- `src/contexts/AuthContext.tsx` — Auth state management (670 lines)
- `src/contexts/WorkoutFlowContext.tsx` — Workout generation & session flow
- `src/components/workout/ActiveExerciseCard.tsx` — Most complex component
- `supabase/functions/generate-workout/index.ts` — AI generation (780 lines)
- `supabase/functions/generate-workout/prompt.ts` — System prompt for Claude
- `supabase/migrations/` — ~30 migration files (full schema history)
- `docs/design-philosophy.md` — Visual identity bible
- `docs/specs/` — Feature specifications
- `docs/architecture/` — Data model, generation prompt docs
- `.claude/` — Skills, agents, slash commands for the dev workflow

Additional docs at `/Users/eric/Documents/Projects/Clear/`:
- User personas, journey maps, session plans, workout anatomy spec, exercise swap spec
