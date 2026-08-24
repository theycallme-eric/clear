> **HOME-02** · Layer `state` · Milestone `M2` · Carry-over `rebuild`

Full streak rules as pure, tested functions: `counts_for_streak`, rest-day marking with reasons (rest/injury/sick), pause states (injury/sick/vacation), consecutive-rest limits, and the week strip's three states driven by real logic.

## Acceptance

- [ ] Streak rules implemented as pure functions with unit tests covering: continue, break, pause, resume, rest-day allowance
- [ ] Mark Rest Day works from Home with reason capture
- [ ] Week strip states (workout/rest/upcoming) match the engine's output
- [ ] Streak is **derived from `workout_sessions`**, never stored — the six profile columns do not exist, so there is nothing to drift
- [ ] Backdating or deleting a session changes the streak correctly with no repair step

---

**Depends on:** HOME-01
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
