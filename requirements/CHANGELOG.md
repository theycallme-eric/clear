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
