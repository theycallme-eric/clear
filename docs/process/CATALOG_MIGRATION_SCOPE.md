# Catalog migration scope

Owner decision recorded 2026-08-29: the rebuild keeps reusable workout catalog/reference data from
the old CLEAR database and starts user history fresh.

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

The live DATA-02 acceptance criterion expects 173 exercises. Therefore the committed old repository
is a reproducible starting point, but not proof of the old live database's final contents. DATA-02
must export/read the old live catalog, reconcile the 33-row difference, and commit a sanitized
catalog-only artifact. It may not silently lower the expectation to 140 or export user tables.
