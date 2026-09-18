# Backend live inventory — reused Supabase project

REQ-008 (TASK-008, issue #80). Prepared 2026-09-18.

**Boundary this document enforces:** the rebuild runs on the *reused* live Supabase project
(`qxckevxniacktaqecypl`) as infrastructure for a *newly implemented* CLEAR platform. The previous
`clear-app` client, its physical schema, its auth population, and its personal/test rows are
evidence, not preservation targets. The preservation target is the authoritative exercise catalog,
taxonomy, workout structure, and workout-anatomy reference content (owner decisions of 2026-09-07,
`sources/source-01-CLEAR_REBASE_CONTEXT.md`).

**Gate:** no backend task (TASK-009 through TASK-013 / the DATA issues) may mutate the live
project until §5 Live capture is completed and `docs/backend/dispositions.md` carries the owner's
approval. Authoring and dry-running migrations locally is allowed.

---

## 1. Method and provenance

Two evidence layers feed this inventory:

1. **Repository evidence** — the previous implementation `theycallme-eric/clear-app` at
   `131c9b536ea193667046673c6c2b989ffae186cd` (2026-05-28). Its 31 ordered migrations, two Edge
   Functions, and local Supabase config are vendored read-only under `docs/backend/evidence/` so
   the diff baseline is committed in this repository and reproducible offline.
2. **Live capture** — read-only queries against the live project via
   `npm run backend:inventory` (`scripts/backend-audit/inventory.sh`, which wraps the SQL in a
   `READ ONLY` transaction) and the recoverable snapshot via `npm run backend:snapshot`.

Repository evidence proves *intended and previously deployed* state; only live capture proves
*current* state. The previous audit (`sources/source-02-BACKEND_CHANGE_AUDIT.md`) established that
production migrations are proven only through the 2026-04-24 CLI checkpoint, which predates
migrations `00030` and `00031`; whether they are applied live is one of the questions §5 answers.

## 2. Expected state from repository evidence

What the live project should contain **if** all 31 migrations are applied. Everything below is
derived from `docs/backend/evidence/previous-migrations/` and is the baseline for the live diff.

### 2.1 Tables (public schema, final expected state)

| Table | Content class | RLS |
|---|---|---|
| `profiles` | Personal (onboarding, preferences, goal) | Owner-scoped select/update |
| `locations` | Personal (equipment locations) | Owner-scoped CRUD |
| `workout_sessions` | Personal (generated/completed workouts) | Owner-scoped CRUD |
| `workout_sections` | Personal (per-session sections) | Owner-scoped CRUD |
| `exercises` | Personal (per-section exercise rows) | Owner-scoped CRUD |
| `structure_results` | Personal (timed/scored section results) | Owner-scoped select/insert/update |
| `saved_workouts` | Personal (favorites) | Owner-scoped CRUD |
| `saved_workout_completions` | Personal (favorite completion records) | Owner-scoped select/insert/delete |
| `exercise_set_logs` | Personal (per-set logging) | Owner-scoped CRUD |
| `exercise_definitions` | **Catalog** (the exercise library) | Readable by all authenticated |
| `exercise_anchors` | **Catalog** (exercise↔anchor taxonomy) | Readable by everyone |
| `exercise_muscle_groups` | **Catalog** (muscle mappings, 488 committed rows) | Readable by everyone |

`movement_patterns` was dropped by migration `00030` (its `pattern_id` column on
`exercise_definitions` was dropped with it). If it still exists live, live state predates `00030`.

### 2.2 Views

`exercises_with_context`, `exercise_definitions_with_anchors` — both rebuilt by `00030`.

### 2.3 Functions / RPCs

| Function | Kind |
|---|---|
| `complete_onboarding(...)` | RPC — onboarding write path |
| `save_generated_workout(...)` | RPC — workout persistence (signature revised through 00018→00030) |
| `suggest_anchor(uuid)` | RPC — coverage-based focus recommendation |
| `get_last_set_data(...)` | RPC — last-session set prefill |
| `update_updated_at_column()` | Trigger function (timestamps) |
| `handle_new_user()` | Trigger function on `auth.users` insert → creates profile |
| `ensure_single_default_location()` | Trigger function (single default location) |

### 2.4 Triggers

`update_<table>_updated_at` on profiles, locations, workout_sessions, workout_sections,
exercise_definitions, exercises, saved_workouts; `enforce_single_default_location` on locations;
`on_auth_user_created` on `auth.users`.

### 2.5 Enums (final expected values)

| Enum | Values |
|---|---|
| `experience_level` | new, some, confident |
| `goal_preset` (v2 renamed) | strength, hypertrophy, conditioning, balanced, active_recovery |
| `equipment_tier` | minimal, home, building, full |
| `anchor_type` (v2 renamed) | squat, hinge, press, pull, power, upper_body, lower_body, full_body |
| `section_type` | warmup, mobility, primary_lift, accessory, skill_power, carries, core, stability_balance, conditioning, cooldown |
| `section_status` | not_started, completed, skipped |
| `streak_status` / `streak_pause_reason` / `rest_day_reason` / `movement_category` | Defined in 00001; usage to be confirmed in live capture |

If live enums still show pre-`00030` `anchor_type`/`goal_preset` value sets (or surviving
`*_v2` names), migrations `00030`/`00031` are not applied live.

### 2.6 Edge Functions

`generate-workout` (prompt 4.0.0, model `claude-sonnet-4-20250514` at evidence head) and
`generate-section`. Sources vendored at `docs/backend/evidence/previous-functions/`. Environment
dependencies read inside the functions: `ANTHROPIC_API_KEY` (project secret), `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (platform-provided). Deployed revisions and
`verify_jwt` posture are live-capture items — the local config disabled JWT verification for
development only.

### 2.7 Auth configuration (evidence layer)

The committed local config (`docs/backend/evidence/previous-config.toml`) shows email signup with
OTP (6 digits, 3600 s expiry), no confirmations, no SMS/OAuth/MFA providers enabled, refresh-token
rotation on, and localhost site/redirect URLs. Live dashboard values (site URL, redirect
allow-list, SMTP, rate limits) are unverified and must be recorded in §5.

### 2.8 Environment dependencies (all surfaces)

| Dependency | Where it lives | Used by |
|---|---|---|
| `SUPABASE_URL` / anon key | Vercel + gitignored local env (browser-safe) | New CLEAR client (DATA-03) |
| `SUPABASE_SERVICE_ROLE_KEY` | CI/host secret store only (PRE-003) | Audit reads, test lifecycle, seeding |
| `SUPABASE_DB_URL` | Operator env only (PRE-004) | Inventory/snapshot/migration application |
| `ANTHROPIC_API_KEY` | Supabase Edge Function secrets | generate-workout / generate-section |
| Supabase CLI auth | CLI-owned credential store (PRE-007) | Metadata inventory, function deploys |

## 3. Rebuild model to diff against

The target is `docs/specs/DATA_MODEL.md`: first-class `workout_blocks`, discriminated
prescriptions, explicit lineage/status, `user_constraints`, `block_results` replacing
`structure_results`, staged taxonomy tables with ranking preserved, and revised enums. It is
**materially incompatible** with the previous physical schema; the diff is therefore expected to
justify replace/transform dispositions, not schema reuse.

## 4. The 140-versus-173 exercise count

- Committed evidence reconstructs **140** final exercise definitions (145 inserted, consolidated
  by `00011`), all 140 tagged with `component_movements` and `exercise_role` by `00031`.
- The legacy DATA-02 acceptance criterion expects **173** live exercises.
- Neither number is canonical until the live count from §5 exists. The reconciliation rule
  (`docs/process/CATALOG_MIGRATION_SCOPE.md`) stands: export the live catalog, reconcile the
  difference row-by-row, and do not silently lower the expectation to 140.

## 5. Live capture — status: **PENDING**

> **This section is the gate.** Run these from an environment holding PRE-003/PRE-004/PRE-007
> (verify with `npm run backend:prereqs`), then record results here and check the boxes.
> This attempt's execution environment denied all network/database commands (see
> `docs/journal/2026-09-18.md`), so capture could not run here; every command below is committed
> and rehearsable as-is.

- [ ] `npm run backend:prereqs` — PRE-003/PRE-004 present
- [ ] `npm run backend:inventory` — read-only inventory written to `docs/backend/capture/`
- [ ] `npm run backend:snapshot` — schema + catalog snapshot committed under
      `docs/backend/snapshot/<stamp>/`; full dump in `backups/` (gitignored) with verified TOC,
      second copy stored off-machine
- [ ] Applied-migration list compared with the 31 evidence migrations — are `00030`/`00031` live?
- [ ] Live `exercise_definitions` count recorded here: ______ (140 / 173 / other) and reconciled
      per §4
- [ ] Deployed Edge Function list + secret **names** captured (no values)
- [ ] Auth dashboard settings recorded (site URL, redirect URLs, email OTP, SMTP, providers)
- [ ] Deviations from §2 listed below and reflected in `docs/backend/dispositions.md`

### Deviations found

*None recorded yet — fill in after capture.*

## 6. Companion documents

- `docs/backend/dispositions.md` — per-surface preserve/transform/replace/retire + owner approval.
- `docs/backend/rollback.md` — rehearsable rollback procedure.
- `docs/backend/post-cutover-checks.md` — named post-cutover verification checklist.
