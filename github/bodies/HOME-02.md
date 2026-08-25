> **HOME-02** · Layer `state` · Milestone `M2` · Carry-over `rebuild`

**Spec:** `specs/DATA_MODEL.md` §5 — streak derived, never stored

Full streak rules as pure, tested functions: `counts_for_streak`, rest-day marking with reasons (rest/injury/sick), pause states (injury/sick/vacation), consecutive-rest limits, and the week strip's three states driven by real logic.

## Acceptance
- [ ] Streak rules implemented as pure functions with unit tests covering: continue, break, pause, resume, rest-day allowance
- [ ] Mark Rest Day works from Home with reason capture
- [ ] Week strip states (workout/rest/upcoming) match the engine's output
- [ ] **Extends** SES-01c's derivation rather than replacing it — one function, one source of truth, still never stored
- [ ] Adds pause states (injury/sick/vacation), rest-day allowances, and consecutive-rest limits on top of the M1 consecutive-day count
- [ ] Backdating or deleting a session changes the streak correctly with no repair step

---

**Depends on:** HOME-01, SES-01c
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
