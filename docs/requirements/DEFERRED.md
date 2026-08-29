# DEFERRED.md — considered and cut

The point of this file is that a cut idea comes back only with **new evidence**, not with
new enthusiasm. Each entry records what was proposed, why it was cut, and the specific
signal that would justify reopening it.

Nothing here is a judgement about whether the idea is good. Several are good. They are cut
because they are not the next thing, or because the app already answers the question they
were asked to answer.

Resolved 2026-08-25, replacing eight identical backlog placeholders.

---

## ORM-01 — 1RM testing mode

**Was:** a guided one-rep-max protocol with stored results.

**Cut because** OVR-01 already derives working weights from what the user actually logged.
A tested 1RM introduces a second source of truth for the same number, and the two will
disagree — the tested max is a single good day, the derived anchor is a trend. When they
disagree, which one drives the next session? Nothing in the product answers that.

There is also a safety dimension. A guided max-effort protocol is a coaching decision with
real injury risk, and the standing constraint from the metadata work applies: we have no
fitness professional to sign it off, and CLEAR does not invent authority it does not have.

**Reopen if** users are logging weights that plateau against a ceiling the derived anchor
cannot see — i.e. OVR-01's suggestions stop tracking reality.

---

## REV-04 — Inline sets/reps editing before starting

**Was:** editing prescribed reps and sets on the review screen.

**Cut because** the intensity slider is already the sanctioned way to say *harder* or
*easier*, and it says it to the thing that can act on it — the generator. Editing reps by
hand routes around that, and it competes with EXE-04's swap for the same screen space and
the same mental model.

The schema would support it (`target_kind` / `target_value` / `target_min` / `target_max`
on a superseded row is exactly the same lineage as a swap), so this is a product decision,
not a technical one.

**Reopen if** users habitually edit the same prescriptions in the same direction. That is
not a missing editor; it is a generation defect wearing an editor's clothes, and the fix
would be in GEN, not REV.

---

## CHART-01 — Per-exercise progression charts

**Was:** progression charts per exercise, deferred by the OVR spec to its own v2.

**Cut because** it visualizes a number the app already states outright. OVR-01 produces a
weight suggestion *and* a "why this number" explanation. A chart re-presents the same
history in a form that requires interpretation, for a user who has already been told the
answer.

There is a design argument too: a line chart is the first smooth curve in a system whose
non-negotiables include *no rounded containers, no bounce, no crossfade*. The CLEAR-shaped
version of "am I progressing" is a stepped `Progress` bar or a text delta — **`Bench · 135
→ 155 · 8 wk`** — not a plot.

**Reopen if** a user asks a question that a number cannot answer. "Am I getting stronger"
is a number. "Why did I stall in March" might be a chart.

---

## HIST-02 — History retention / pruning policy

**Was:** a policy for aging out old sessions.

**Cut because** it is a scale problem for an app with no users. A session is a few hundred
rows; a decade of daily training is well inside what Postgres and the Supabase tiers handle
without a policy.

Nothing in the schema forecloses it: `created_at` and `superseded_at` are already on the
lineage tables, so a retention policy can be added later without a migration that touches
existing data.

**Reopen if** storage cost or query latency becomes measurable — not before.

---

## NAT-01 — Capacitor packaging / App Store distribution

**Was:** native packaging and store distribution.

**Cut from the issue graph** — not from the future. PWA-01 keeps the door open, which was
the stated requirement ("web first, keep the door open, PWA isn't a bad temp solution").

The reason it does not belong in this backlog is that it is not a ticket. It is a project
with an Apple developer account, a review process, a native build pipeline, a signing
story, and an update cadence that does not match `git push → Vercel`. Carrying it as a
GitHub issue makes the backlog look like it contains a plan, and it does not.

**Reopen when** the PWA is shipped and something specific about it fails — background
audio for timers, home-screen install friction, notification delivery. That failure names
the requirement.

---

## LIB-01 — Coaching cues enrichment → **folded into DATA-02**

**Was:** a content pass enriching coaching cues across the exercise library.

**Not cut, and not a ticket.** Cue *content* is ongoing writing with no acceptance criteria
beyond "the cues are good", and we have no fitness professional to author or review them —
the same constraint that stopped the metadata expansion.

What the build actually needs is a **floor**, and that is now an acceptance criterion on
DATA-02: cues and regressions are nullable, and every surface that displays them has a
defined empty presentation. Typed absence, the same principle as everywhere else in the
schema — absent is a real state, not a rendering accident.

The writing happens whenever it happens, against a UI that already works without it.

---

## Promoted instead of cut

Two stubs were not backlog at all. They were requirements nobody had written down.

- **EXE-06 — Mid-workout exercise swap** → M3. The stub said "no spec exists." A spec does
  exist: `slot_id` + `replaces_id` + `revision_status` is the lineage REV-02 already uses,
  and mid-workout swap is that mechanism at a different moment. The only genuinely new
  question — what happens to sets already logged against the swapped exercise — has an
  answer the three-state model gives for free.

- **OFF-01 — Offline support** → narrowed to **EXE-07, M1**. Full offline sync is a
  project. The part that actually matters is one sentence: a set the user physically
  performed must not be lost to a dead signal, and the UI must not claim a set is logged
  when it is not. That is defect **D7**, not a feature, and it belongs in the milestone
  where set logging lands rather than in a backlog.
