# Backend dispositions — reused Supabase project

REQ-008 (TASK-008, issue #80). Prepared 2026-09-18.

Every live backend surface gets exactly one disposition (definitions from
`sources/source-02-BACKEND_CHANGE_AUDIT.md`):

- **Preserve** — reusable as-is, compatible with the reviewed rebuild contract.
- **Transform** — retained through an explicit, tested migration or sanitized data transform.
- **Replace** — superseded by the reviewed rebuild design after a recoverable snapshot.
- **Retire** — intentionally removed; served only disposable test users or the old client.

Owner decisions grounding these dispositions (2026-09-07,
`sources/source-01-CLEAR_REBASE_CONTEXT.md`): the Supabase project is reused; existing auth users
and all personal rows are disposable test data; the previous client may be shut down with no
compatibility period; the live exercise catalog and other non-personal reference content must be
preserved before any reset.

## 1. Tables

| Surface | Disposition | Rationale / successor |
|---|---|---|
| `exercise_definitions` | **Transform** | Authoritative catalog content (names, equipment, cues, progressions, components, roles) carries into the DATA-01 catalog schema via sanitized export with taxonomy-equivalence proof; the physical table itself is superseded. |
| `exercise_anchors` | **Transform** | Anchor taxonomy (incl. the 13 explicit secondary mappings) carries into the staged taxonomy tables with ranking preserved (`DATA_MODEL.md` §3). |
| `exercise_muscle_groups` | **Transform** | 488 committed muscle mappings with primary/synergist/stabilizer roles carry into the new mapping tables. |
| `movement_patterns` (27 live rows) | **Transform → Retire** | Pattern/anchor data needed for pattern weights and taxonomy equivalence is captured in the snapshot; the table is live because migration `00030` was never deployed, then is removed by the rebuild. |
| `profiles` | **Replace** | New-model `profiles` + `user_constraints` supersede it. Rows are disposable test data — never migrated. |
| `locations` | **Replace** | Equipment/location concept re-modeled; rows are personal test data, not migrated. |
| `workout_sessions` | **Replace** | Superseded by new sessions model with lineage/status; rows not migrated. |
| `workout_sections` | **Replace** | Superseded by `workout_blocks`; rows not migrated. |
| `exercises` | **Replace** | Superseded by `workout_exercises` with discriminated prescriptions; rows not migrated. |
| `structure_results` | **Replace** | Superseded by `block_results` (`DATA_MODEL.md` §8); rows not migrated. |
| `saved_workouts` | **Replace** | Favorites re-modeled with snapshot versioning (favorites-v2); rows not migrated. |
| `saved_workout_completions` | **Replace** | Folded into the new favorites/results model; rows not migrated. |
| `exercise_set_logs` | **Replace** | Same name in the new model, new shape; rows are personal test data, not migrated. |

## 2. Views

| Surface | Disposition | Rationale |
|---|---|---|
| `exercises_with_context` | **Retire** | Old-client read convenience; the new model defines its own "as performed" view. |
| `exercise_definitions_with_anchors` | **Retire** | Superseded by the staged taxonomy tables and new catalog queries. |

## 3. Functions / RPCs

| Surface | Disposition | Rationale |
|---|---|---|
| `save_generated_workout(...)` | **Replace** | Persistence boundary re-authored for blocks/prescriptions per generation contract 4.1.0. |
| `complete_onboarding(...)` | **Replace** | New onboarding flow writes the new profile/constraint shape. |
| `suggest_anchor(uuid)` | **Replace** | Coverage-based focus recommendation is retained behavior, re-implemented against new tables. |
| `get_last_set_data(...)` | **Replace** | Last-set prefill retained as behavior, re-authored for the new log shape. |
| `update_updated_at_column()` | **Replace** | Re-authored in the new migration series. |
| `handle_new_user()` | **Replace** | Profile-on-signup retained as behavior against the new `profiles`. |
| `ensure_single_default_location()` | **Replace** | Re-evaluated with the new location model. |

## 4. Policies and triggers

| Surface | Disposition | Rationale |
|---|---|---|
| All owner-scoped RLS policies (~35, per `00008` onward) | **Replace** | RLS-by-default is a retained requirement; policies are re-authored per table in the new schema and verified by the post-cutover checks. |
| Catalog read policies (anchors/muscle groups readable) | **Replace** | Same access intent, new tables. |
| All `update_*_updated_at` and constraint triggers | **Replace** | Re-authored with their tables. |
| `on_auth_user_created` trigger on `auth.users` | **Replace** | Recreated to populate the new profile shape. |

## 5. Enums

| Surface | Disposition | Rationale |
|---|---|---|
| `anchor_type` (8 values) | **Transform** | Value set is taxonomy; carried into the new enum/staged tables, subject to `DATA_MODEL.md` §10. |
| `goal_preset` (5 values) | **Transform** | Goal vocabulary carries forward per the intensity model. |
| `section_type` (10 values) | **Transform** | Section vocabulary informs block types; mapping recorded in DATA-01. |
| `experience_level`, `equipment_tier` | **Transform** | Onboarding vocabulary retained in the new model. |
| `section_status` | **Replace** | Superseded by the new lineage/status design. |
| `streak_status`, `streak_pause_reason`, `rest_day_reason`, `movement_category` | **Retire** | Defined in `00001` for features the rebuild does not carry; confirm no live dependency during capture, then drop. |

## 6. Edge Functions

| Surface | Disposition | Rationale |
|---|---|---|
| `generate-workout` (only deployed function; legacy JWT verification off) | **Replace** | Prompt 5.0.0 / generation contract 4.1.0 supersede prompt 4.0.0; behavioral evidence vendored at `docs/backend/evidence/previous-functions/`. |
| `generate-section` (repository evidence only; not deployed live) | **Retire** | Superseded by the new swap/replace design; there is no live function to preserve or replace. |

## 7. Catalog datasets

| Surface | Disposition | Rationale |
|---|---|---|
| Exercise catalog rows (140 committed / 140 live) | **Transform** | The preservation target is the captured 140-row live export. The unsupported 173-row expectation is retired only when the owner approves this disposition. |
| Component-movement + exercise-role tags (not live) | **Transform** | Workout-anatomy reference content exists in migration `00031`, which was never deployed; carry the reviewed reference tags into the new schema rather than treating them as live data. |
| Muscle-group mappings (488 live rows) | **Transform** | Preserved with roles from the live snapshot. |
| Anchor/pattern relationships (150 anchor links + 27 legacy patterns) | **Transform** | Preserved from the live snapshot into staged taxonomy with ranking. |
| Structure/workout-anatomy reference content | **Transform** | Carried per `docs/specs/structures` and the workout-anatomy spec. |

## 8. Auth

| Surface | Disposition | Rationale |
|---|---|---|
| Auth **user population** (8 live test users) | **Retire** | Owner decision: disposable test users; the rebuilt product starts with new users. Never migrated. |
| Email OTP sign-in mechanism | **Preserve** | Same mechanism in the rebuild (AUTH issues). |
| Site URL + redirect allow-list | **Transform** | Replace the live old-client URL (`clear-app-1111.vercel.app` plus `/reset-password`) with reviewed new-platform deployment URLs. |
| Rate limits, token rotation settings | **Preserve** | Keep unless post-cutover checks demand change. |
| SMS/OAuth/MFA providers (all disabled) | **Preserve** | Remain disabled. |

## 9. Environment dependencies and secrets

| Surface | Disposition | Rationale |
|---|---|---|
| Supabase project ref `qxckevxniacktaqecypl`, URL, anon key | **Preserve** | The reused infrastructure itself. |
| `SUPABASE_SERVICE_ROLE_KEY` usage | **Preserve** | Server-side/CI only; rotation at owner's discretion after cutover. |
| `ANTHROPIC_API_KEY` Edge Function secret | **Preserve** | Reused by the new generation function; value never leaves Supabase secret store. |
| `SUPABASE_DB_URL` operator access | **Preserve** | Snapshot/migration channel only. |
| Old client deployment/env (previous Vercel app) | **Retire** | The previous application may be shut down; no compatibility period. |
| `supabase_migrations.schema_migrations` history | **Replace** | Bookkeeping resets to the rebuild's migration series after the snapshot records the old history. |

## 10. Approval record

**Status: LIVE-CAPTURED AND PROPOSED — awaiting owner approval.**

This disposition set is derived entirely from the owner decisions of 2026-09-07 and the reviewed
REQ-008 requirement; no new judgment calls were introduced. Approval must be recorded before any
live mutation:

- **Who:** Eric (repository owner).
- **How:** comment `Dispositions approved as of <commit sha>` on issue #80 (or check this box in a
  reviewed PR touching this file): 
  - [ ] **Owner approval recorded** — date: ______, commit: ______
- **Precondition for approval:** satisfied — `docs/backend/live-inventory.md` §5 is captured and
  deviations are reflected here. A second off-machine dump copy remains mandatory before mutation.
- **Effect:** TASK-009 through TASK-013 (DATA issues) may begin mutating the live project. Until
  then they may only author and dry-run changes.

If live capture contradicts a disposition above (for example, a live surface not listed here),
the contradiction is a blocking owner question per the evidence-authority order — do not resolve
it silently.
