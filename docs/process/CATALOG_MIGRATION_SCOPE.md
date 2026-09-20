# Catalog migration scope

Owner decision recorded 2026-08-29: the rebuild keeps reusable workout catalog/reference data from
the old CLEAR database and starts user history fresh.

Owner decision recorded 2026-09-07 (REQ-008): the "old CLEAR database" **is** the reused live
Supabase project (`qxckevxniacktaqecypl`) — the rebuild runs on the same project, so the catalog
export reads from it in place rather than from a separate old project. The REQ-008 gate
(`docs/backend/dispositions.md`) must be owner-approved before any live mutation.

## Include

- exercise IDs and display names;
- equipment options, defaults, and equipment-specific display names;
- section eligibility and primary-lift eligibility;
- coaching cues and regression/progression relationships, preserving valid nulls;
- component movements and exercise roles;
- muscle-group mappings and their primary/synergist/stabilizer roles;
- pattern/anchor information required to produce the new pattern weights and prove taxonomy
  equivalence.

## Exclude

- authentication users, profiles, locations, preferences, limitations, and onboarding state;
- generated, saved, scheduled, or completed workouts and their sections/exercises;
- set logs, block results, streaks, history, favorites, and other personal activity;
- secrets, access tokens, private contact data, and service credentials.

DATA-02's optional `--dev` mode creates new dev-only data. It must never copy an old user row.

## Verified source status

The archived private repository `theycallme-eric/clear-app` contains the old schema and seed history.
Static audit of its migrations found:

- 145 unique exercise IDs inserted before consolidation;
- consolidation/removal produces 140 final exercise definitions;
- all 140 final definitions receive `component_movements` and `exercise_role` tags;
- 488 exercise-to-muscle-group rows are committed;
- primary anchors are derived from the old pattern relationship and 13 secondary anchor mappings are
  explicitly added.

The 2026-09-18 read-only live capture proves that the reused project contains the same 140 exercise
definitions, plus 150 anchor links, 488 muscle mappings, and 27 legacy movement-pattern rows. No
173-row live source exists. DATA-02 must use the committed snapshot as its input, preserve all 140
definitions and related reference rows, and retire the unsupported 173-row expectation only with
owner approval of `docs/backend/dispositions.md`. It must never export user tables.
