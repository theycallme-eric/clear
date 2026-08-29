> **DATA-02** · Layer `data` · Milestone `M0` · Carry-over `keep`

**Spec:** `docs/specs/DATA_MODEL.md` §3

Export the catalog from the old project and seed the new one. **Plus the taxonomy equivalence check** — the anchor split is a separate staged migration, and this is where it is proven safe before the old structures are dropped.

A dev-only flag seeds Eric's profile + default location so the M1 loop is usable before onboarding exists (ONB-01 is M2).

## Acceptance
- [ ] Row counts match the old project — **173 exercises** with `component_movements` and `exercise_role` intact
- [ ] Seed is idempotent — running twice changes nothing
- [ ] Pattern-bearing rows migrate from `exercise_anchors` into `exercise_pattern_weights`; region rows (`upper_body`, `lower_body`, `full_body`) are dropped deliberately, not silently
- [ ] **Equivalence verified before the old table is dropped:** candidate sets and focus suggestions compared derived-vs-original across all four focuses, false positives inspected, lost primary/secondary distinctions listed
- [ ] `exercise_anchors` and `anchor_type` dropped only after that comparison passes
- [ ] `--dev` flag seeds a complete profile + one location; without it, no user data
- [ ] Export artifacts committed so the seed is reproducible without old-project access
- [ ] **Coaching cues and regressions are nullable, and every surface renders correctly when they are absent** — the expandable panel, the review row, and the notes field each have a defined empty presentation. Absent is a real state, not a rendering accident (folds LIB-01: enriching cue *content* is ongoing writing, not a build ticket, and we have no professional to author it)

---

**Depends on:** DATA-01a
**Blocks:** ENV-07, GEN-02a

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
