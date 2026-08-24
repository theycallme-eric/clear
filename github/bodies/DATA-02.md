> **DATA-02** · Layer `data` · Milestone `M0` · Carry-over `keep`

Export the catalog from the old project and seed the new one. **Plus the taxonomy equivalence check** — the anchor split is a separate staged migration, and this is where it is proven safe before the old structures are dropped. A dev-only flag seeds Eric's profile + default location so the M1 loop is usable before onboarding exists (ONB-01 is M2).

**Spec:** `specs/DATA_MODEL.md` §3

## Acceptance

- [ ] Row counts match the old project — **173 exercises** with `component_movements` and `exercise_role` intact
- [ ] Seed is idempotent — running twice changes nothing
- [ ] Pattern-bearing rows migrate from `exercise_anchors` into `exercise_pattern_weights`; region rows (`upper_body`, `lower_body`, `full_body`) are dropped deliberately, not silently
- [ ] **Equivalence verified before the old table is dropped:** candidate sets and focus suggestions compared derived-vs-original across all four focuses, false positives inspected, lost primary/secondary distinctions listed
- [ ] `exercise_anchors` and `anchor_type` dropped only after that comparison passes
- [ ] `--dev` flag seeds a complete profile + one location; without it, no user data
- [ ] Export artifacts committed so the seed is reproducible without old-project access

---

**Depends on:** DATA-01
**Blocks:** GEN-02

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
