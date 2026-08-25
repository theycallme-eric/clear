> **OVR-04** · Layer `state` · Milestone `M3` · Carry-over `new`

**Spec:** `specs/OVR-01_progressive-overload.md` (§4, slice d)

**In plain language:** the app notices when you have been grinding — same weights, everything feeling like a 9 or 10, reps starting to slip — and suggests taking a lighter week before you stall out or get hurt. A *deload* is that lighter week: same movements, ~15% less weight, ~40% fewer sets, capped effort. Not a rest day.

It is only ever a **suggestion**. A banner on the Generate screen says why ("your last 3 squat sessions stalled at RPE 9+"), and you either take it or dismiss it. It never quietly changes your workout — an app that reduces your weights without asking is one you stop trusting.

Six conditions can raise the suggestion: a lift stalling while feeling maximal, a lift going backward, everything feeling hard for a week straight, too many hard sessions with no easy ones, missed reps piling up, and a six-week calendar backstop.

## Acceptance
- [ ] Triggers D1–D6 implemented as pure tested functions; a single-lift stall suggests a deload for that movement only, whole-session signals suggest a full one
- [ ] Banner states the specific reason in one line; **Apply** clamps intensity and passes the directive to generation; **Not today** dismisses for 3 sessions and records the override
- [ ] Never auto-applies. Choosing a hard intensity on a flagged day confirms once, then does what you asked
- [ ] Deload sessions are tagged and excluded from load-anchor updates — a deliberately light day is not evidence you got weaker

---

**Depends on:** OVR-01a, OVR-02, GEN-04
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
