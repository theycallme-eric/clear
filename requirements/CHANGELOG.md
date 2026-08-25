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

## v0.4 — 2026-08-24
**Two verified defects and three outside review rounds folded in.** 51 → 53 requirements,
211 → 257 acceptance criteria.

**New defects in the register:**
- **D5** — duration validation is tautological. The validator compares a number Claude was told the
  answer to against the request. It cannot fail.
- **D6** — swapped exercises are never persisted. Set logs attach to exercises never performed.
  Silent corruption of the table progressive overload will read.

**New requirements:** `DATA-05` (user-authored constraints) · `GEN-06` (duration plausibility check).

**Substantially revised:** `DATA-01` (blocks, discriminated prescriptions, temporal lineage, typed
absence) · `DATA-02` (taxonomy equivalence verification before dropping the old table) ·
`CORE-03` (contract v4.1 schemas mirroring database CHECK constraints) · `GEN-02` (eligibility
resolves in SQL before composition) · `SES-01` (three-state persistence; the D6 reproduction is now
a required regression test) · `REV-02`/`REV-03` (swaps create revisions with lineage) ·
`EXE-02`–`EXE-05` (render from structured prescriptions and blocks) · `FAV-01` (snapshot
versioning) · `HOME-02` (streak derived, never stored) · `HOME-03` (pattern-level staleness) ·
`OVR-01` (rep completion computed, not parsed).

**Added to the document itself:** a glossary of the terms v0.4 introduces, a specification index
mapping every spec to the requirements it serves, and version history.

**Withdrawn before issue:** `DATA-04`, `GEN-07`, `META-01` — proposed during review, cut when the
duration engine reduced to a guardrail and metadata proved unnecessary. Hence the ID gap between
`DATA-03` and `DATA-05`.

## v0.4.1 — 2026-08-24
Third review pass. Five mechanical contradictions resolved; three left as product decisions.

- **Sizing rule replaced.** "~1–3 hours" was never true and was the wrong criterion. Now:
  *independently mergeable and independently verifiable.* The real cost of an oversized node is
  **false serialization** — a dependent waiting on parts of a parent it does not need.
- **SET-01** no longer says "orange/blue toggle" — theme list comes from the export.
- **ENV-03** no longer instructs porting from the archived repo; the SPA rewrite is stated inline.
- **REV-01** shows the **effective target** duration. Computed and diagnostic estimates stay internal.
- **GEN-06** rejects with one targeted retry. **Not trimmed** — deciding what to cut is composition
  judgment and belongs to the model, not the validator.
- **Spec coverage 24/53 → 53/53.** Nine self-contained requirements say so explicitly rather than
  leaving the field absent, so a generated issue never looks like it lost a reference.

**Open, awaiting product decisions:** streak scope in M1 · favorites CTA in M1 · onboarding milestone.
**Open, pending the design export:** `specs/design/ATOMIC.md`, referenced by `specs/IA.md`.

**Three product decisions resolved (2026-08-24):**
- **Onboarding stays M2**, with AUTH-03 gaining a placeholder for authenticated users without a
  profile — a clear "setup isn't built yet" screen, never a redirect to a route that does not exist.
  Removed when ONB-01 lands.
- **Minimal streak derivation moves into SES-01 (M1)** — consecutive days with a completed session,
  computed from `workout_sessions`. HOME-02 *extends* that same function with pause states and
  rest-day rules rather than replacing it. One function, one source of truth.
- **Save-as-favorite is removed from M1.** FAV-01 introduces the button and the behavior together.
  SUM-01 gains an explicit criterion: nothing on that screen is non-functional — the same principle
  that killed the mock-workout fallback.
