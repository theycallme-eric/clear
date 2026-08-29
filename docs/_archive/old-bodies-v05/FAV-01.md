> **FAV-01** · Layer `ui` · Milestone `M2` · Carry-over `rebuild`

Save a completed workout as a named template (snapshot), favorites tab on Home, one-tap restart that skips generation and lands in review with the snapshot.

## Acceptance

- [ ] Restart reproduces the workout exactly from `workout_snapshot` — no regeneration
- [ ] Completing a restarted favorite writes `saved_workout_completions` and bumps `times_completed`
- [ ] Favorites tab lists with anchor/intensity/duration metadata; unfavorite works
- [ ] Snapshot carries `snapshot_contract_version`, validated against the schema for **that** version before restore
- [ ] A favorite predating a breaking contract change surfaces a clear message rather than failing obscurely

---

**Depends on:** SUM-01, SES-01, HOME-01
**Blocks:** FAV-02

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
