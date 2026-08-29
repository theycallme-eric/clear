> **ONB-01** · Layer `ui` · Milestone `M2` · Carry-over `rebuild`

**Spec:** `docs/specs/screens/onboarding-wireframe.md`

Multi-step first-run: experience level, goal preset, location + equipment, section preferences, limitations — committed atomically via `complete_onboarding`. (M2 deliberately: DATA-02's dev-seeded profile makes the M1 loop usable first; onboarding is required before anyone else touches the app.)

## Acceptance
- [ ] New authenticated users are routed to onboarding until complete; onboarded users never see it (AUTH-03 guard)
- [ ] Commit is atomic — a failure leaves no partial profile or orphan location
- [ ] Every preference lands correctly in `profiles` + `locations` and feeds generation defaults
- [ ] Back-navigation preserves entered values

---

**Depends on:** AUTH-03, DS-01
**Blocks:** —

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
