# Requirements Changelog

## v0.2 — 2026-08-24
**Changed:** Progressive overload promoted from stub to four requirements (OVR-01…04),
following the slice order in its own spec.
**Reached backward:** the spec flagged weight-unit ambiguity as blocking. DATA-01 now carries
`weight_unit` per set log plus a profile default; EXE-04 now captures section-level effort and
AMRAP partial reps during M1, so M3 has history to work with.
**Why it matters:** proof that stubs should stay stubs until specced. Faking OVR's detail in
v0.1 would have shipped the wrong schema.

## v0.1 — 2026-08-22
Initial draft. 46 requirements across M0–M2 plus 9 M3 stubs. Defect register established:
four named failures from the old app, each mapped to the requirements that kill it.

## v0.3 — 2026-08-24
**Eric's first review pass applied.**
- **DS-01 gated** — theme model is changing: several themes, not two, and the orange/blue swap is
  no longer that relationship. Build step rewritten theme-count agnostic; no hardcoded theme list.
- **DS-02, DS-06 gated**, **GEN-05 flagged** — all pending the Claude Design export.
- **CORE-04 added** (M0) — app-wide loading / empty / error / populated contract plus a top-level
  error boundary. Answers "what happens when things fail or don't render?", which the document was
  leaving implicit. Now a review criterion on every UI requirement.
- **OVR-04 rewritten** in plain language. The old version described mechanics without ever saying
  what a deload is or why the app would suggest one.
- **Independence:** every cited spec copied into `specs/`. No requirement sends anyone to the
  archived repo. The single remaining external read is the exercise library export (data, not code).

## v0.3.1 — 2026-08-24
IA decisions folded back into requirements. 204 → 211 acceptance criteria.
- **HOME-01** — Quick Start hidden until history exists. Not disabled, not defaulted: absent.
- **EXE-01** — Workout is a focus mode. No in-app navigation out of an active session except
  completing or abandoning; browser back triggers the abandon confirm. Leaving the *app* is still
  fine — the trap is on navigation, not the user. Rationale is state safety as much as focus.
- **FAV-02** — Comparison surface across completions of the same favorite. Each completion stays
  its own session; the favorite is the thread. Competitive framing suppressed during a deload.
- **SET-01** — Every onboarding choice editable in Settings; onboarding strictly first-run.
