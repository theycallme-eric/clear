# OVR-01 — Progressive Overload

> **Status:** DRAFT — for review
> **Last Updated:** August 21, 2026
> **Purpose:** Define how Clear decides what to prescribe when a generated workout includes an exercise with logged history.
> **Depends on:** `Clear_-_Intensity_Model_Spec.md`, `Clear_-_Structure_Types_Spec.md`, `Clear_-_Workout_Anatomy_Spec.md`
> **Scope:** Personal tool. No social, no coaching layer, no shared leaderboards.

---

## Jargon (plain language)

| Term | Meaning |
|---|---|
| **RPE** | Rate of Perceived Exertion, 1–10. How hard a set felt. RPE 8 = "I could have done 2 more reps." RPE 10 = "nothing left." |
| **RIR** | Reps In Reserve = `10 − RPE`. RPE 8 → 2 RIR. |
| **e1RM** | Estimated 1-Rep Max. The heaviest single you'd probably manage, calculated from a set you actually did. Never tested directly. |
| **Load anchor** | Clear's stored e1RM per exercise. The single number all prescriptions derive from. |
| **Double progression** | Add reps until you hit the top of a rep range, then add weight and drop back to the bottom. |
| **Autoregulation** | Adjusting today's load based on how the last session actually felt, rather than a fixed schedule. |
| **Deload** | A planned, temporary reduction in training stress so accumulated fatigue can clear. Not a rest day — a lighter week. |
| **Detraining** | Losing capacity from time off. Starts becoming measurable around 3 weeks without exposure. |
| **Working set** | A real set, not a warmup. `is_warmup_set = false`. |

---

## 1. Model Selection

**Primary model: RPE-based autoregulation, anchored to a stored e1RM.**
**Secondary mechanism: double progression within a rep band, when the same rep target recurs.**

### Why this one

Percentage-of-max is out. It needs a tested 1RM and a fixed program to run the percentages against. Clear has neither — the user never maxes out, and the next workout is unknown until it's generated. Percentages would be built on a number nobody ever verified.

Double progression alone is out **as the primary driver**. It assumes the same rep target reappears next session. Clear's intensity model deliberately varies rep prescriptions with intensity (3–6 reps at intensity 9, 6–10 at intensity 5–7), and the anatomy spec varies them again by goal. Double progression has nothing to progress against when today's prescription is 5×3 and last time was 3×8. It survives as a *mechanism* inside a rep band, not as the model.

RPE autoregulation fits the data Clear already has:

- RPE is **already logged per set** (`exercise_set_logs.rpe`) — no new capture required.
- RPE is **rep-scheme agnostic**. "That felt like an 8" is meaningful whether it was 3 reps or 12.
- It **self-corrects**. Bad sleep, hard week, hot gym — the number adjusts without the app knowing why.
- It **degrades gracefully**. One session of history is still one usable signal.

The e1RM anchor is what makes autoregulation work across varying prescriptions. Without it, you can only compare like-for-like sessions, which Clear rarely produces.

### The anchor math

Compute a candidate e1RM from every working set:

```
effective_reps = min(reps_completed + (10 − rpe), 12)
e1RM_candidate = weight × (1 + effective_reps / 30)
```

Rules:
- Working sets only (`is_warmup_set = false`).
- Skip sets where `rpe` is null or `weight` is null.
- Take the **highest candidate** from the session — that's the session's best expression of capacity.
- Session anchors are then smoothed across sessions (see §5) into the stored `load_anchor`.
- Effective reps clamp at 12. The Epley formula degrades badly above that; sets over 12 effective reps contribute but drop the anchor's confidence one level.

Invert it to prescribe:

```
suggested_weight = load_anchor / (1 + (target_reps + target_RIR) / 30)
```

Then round to the equipment's increment (§ Data needed), and apply the **safety clamp**:

> Never suggest more than **110%** of the heaviest weight actually logged for that exercise in the last 8 weeks.

The clamp is the guardrail against formula drift. Epley is an approximation; the clamp keeps an approximation error from becoming a barbell you can't lift.

### Where double progression rides on top

When the generated prescription lands in the **same rep band** as the previous session for that exercise (bands: 1–3, 4–6, 7–10, 11–15, 16+), prefer the double-progression step over a pure anchor recalculation:

- All prescribed reps completed at RPE ≤ 8 → add reps first (up to top of band), then load.
- Top of band reached at RPE ≤ 8 → add one increment, return to bottom of band.

This produces more legible progress ("I added a rep") than a recalculated decimal, and it's what the Review screen should show as the reason.

---

## 2. RPE → Next Prescription

### Which RPE

Use the **median RPE of working sets** for that exercise in its most recent session. Median, not mean — one grinder set on a 5-set exercise shouldn't drag the read.

Separately compute **rep completion**: `reps_completed / reps_prescribed` summed across working sets. Parsed from `exercises.reps` (see flagged gap in Data needed).

Also compute **first-set RPE**. If set 1 is already ≥9, load was wrong for the set count regardless of what the median says — treat as overshoot.

### The rules

| Last session read | Interpretation | Next prescription |
|---|---|---|
| RPE ≤ 6, all reps completed | Too light. Unambiguous. | **+5–10%** (see below), or +2 reps if in a hypertrophy band |
| RPE 6.5–7, all reps completed | Slightly light | **+one increment**, or +1 rep |
| RPE 7.5–8.5, all reps completed | On target | **+one increment** (strength/balanced) or **+1 rep** (hypertrophy) |
| RPE 9–9.5, all reps completed | On target for heavy work | **Hold load.** Add a rep or a set if volume allows |
| RPE 10, all reps completed | At the ceiling | **Repeat exact load.** No progression |
| RPE 10, reps missed | Overshoot | **−5–10%** |
| Any RPE, ≥1 rep missed on ≥half the sets | Overshoot | **−5%** |
| First set already RPE ≥ 9 | Load wrong for set count | **−5%**, hold rep target |

### Sizing the step

`+5–10%` means: upper-body pressing/pulling → 5%, lower-body squat/hinge → 10%. Lower body tolerates larger absolute jumps.

Then round to the equipment increment. **If rounding produces zero change but the rule said "go up," force one increment.** A 5 lb barbell jump on a 315 lb deadlift is 1.6% — the percentage is advisory, the increment is the reality.

### Goal modulates direction

The anatomy spec already distinguishes goals. Progression should respect that:

| Session goal | Progress first by |
|---|---|
| `strength` | Load. Reps stay in the 3–6 band. |
| `hypertrophy` | Reps, then load. Add sets before adding weight. |
| `conditioning` | Density (§3). Load stays sub-maximal. |
| `balanced` | Load on the primary lift, reps on accessories. |
| `active_recovery` | **No progression at all.** Suggestions are capped at 60% of anchor, RPE cap 5. |

`active_recovery` sessions must be excluded from anchor updates entirely — a light day is not new capacity information.

---

## 3. Timed Formats: AMRAP / For Time / EMOM

### The honest constraint

For standard sets, the anchor makes any two sessions comparable. **For timed formats, it doesn't.** An 8-minute AMRAP of swings/burpees/box jumps and a 10-minute AMRAP of thrusters/pull-ups are not the same test. There is no valid score comparison between two differently-generated conditioning pieces.

So timed formats split into two mechanisms:

**(a) Like-for-like comparison — only when the work is identical.** Requires matching `structure_type` + exercise set + rep scheme + duration/cap + loads. In practice this means **Favorites/repeats only** (`Clear_-_Favorites_Spec_v2.md` already handles "Previous Best"). Everywhere else, don't show a comparison — a false one is worse than none.

**(b) Density prescription — for freshly generated conditioning.** Progress isn't *measured*, it's *prescribed*. The app tracks a rolling read on how conditioning is landing and nudges the next prescription's density.

### Normalized scores

Store a comparable score per timed section so (a) works and (b) has a signal:

| Format | Score | Normalized rate |
|---|---|---|
| **AMRAP** | `rounds_completed` + `partial_reps` → total reps | **reps per minute** = total reps ÷ duration |
| **For Time** (finished) | `completion_time_seconds` | **reps per minute** = prescribed reps ÷ (time ÷ 60) |
| **For Time** (hit cap) | reps completed at cap | reps ÷ cap minutes. Flag `completed_under_cap = false` |
| **EMOM** | `minutes_completed / minutes_prescribed` | Binary-ish: completion ratio. EMOM is a pass/fail density test, not a score. |
| **Ladder / N+1** | `highest_rung` | Rung count. Directly comparable when the ladder pattern matches. |

Reps-per-minute normalizes across durations, which is what makes an 8-min and a 12-min AMRAP of the *same* movements comparable.

### The density nudge

Requires a new field: **section-level perceived effort**. Timed sections have no per-set logs, so there is currently no effort signal for them at all. This is the single biggest data gap in this spec.

Rules, evaluated over the last 3 conditioning sections at intensity ≥5:

- **Two consecutive sections finished as prescribed at section RPE ≤ 7** → next conditioning section at the same intensity gets **+1 round, +2 reps per round, or −10% time cap** (generator's choice). Directive passed as `conditioning_trend: "ready"`.
- **Two consecutive sections hitting the cap or failing to complete** → next gets **−1 round or +15% cap**. Directive: `conditioning_trend: "backing_off"`.
- **Mixed / insufficient data** → `conditioning_trend: "hold"`.

### What "progress" means, per format, in plain language

- **AMRAP** — more total reps in the same time window, at the same loads. Or the same reps at a heavier load.
- **For Time** — finishing the same work faster. Secondary win: finishing under a cap you previously hit.
- **EMOM** — completing every minute where you previously dropped one. Then: more reps per minute, or heavier, at the same completion rate. EMOM progresses by *surviving more*, not by scoring higher.
- **Ladder / N+1** — a higher rung.

---

## 4. Deload Rules

Triggers, not vibes. Any single trigger firing surfaces a **suggestion**, never an automatic change.

### Trigger conditions

| # | Trigger | Condition |
|---|---|---|
| **D1** | Performance stall | Same exercise: 3 consecutive sessions where `load_anchor` has not increased **and** median working-set RPE ≥ 9 |
| **D2** | Regression | `load_anchor` for any primary-lift movement drops ≥5% below its 4-week rolling best, across 2 consecutive sessions |
| **D3** | Effort inflation | Rolling 7-day median working-set RPE ≥ 9.0 across ≥3 completed sessions |
| **D4** | Accumulated load | ≥6 sessions in the last 14 days at `intensity ≥ 7`, with **zero** sessions at `intensity ≤ 4` |
| **D5** | Missed-rep pattern | ≥30% of prescribed working sets in the last 2 sessions came in under prescribed reps |
| **D6** | Calendar backstop | 6 consecutive weeks with no week averaging `intensity ≤ 5` |

D1–D2 are exercise-scoped and can trigger a **movement-specific** deload. D3–D6 are session-scoped and trigger a **full** deload.

The RPE ≥9 condition in D1 matters — without it, every stretch of light sessions would look like a stall. A stall is only a stall if you're working hard and not moving.

### What a deload prescribes

Not a rest day. Same movements — deloading is about reducing stress, not introducing novelty.

- Load anchors × **0.85** for suggestions
- Working sets reduced by **~40%** (round down, minimum 2)
- Rep targets **unchanged**
- Hard **RPE cap of 7** — surfaced in coaching cues
- Conditioning capped at intensity 6, `conditioning_trend: "backing_off"`
- Duration: **next 3 completed sessions**, or 7 days, whichever comes first

**Anchors do not update during a deload.** Deload sessions are excluded from anchor calculation — you're deliberately underperforming, that's not new capacity data.

### How it surfaces and how it's overridden

On the Generate screen, before intensity selection:

> **Deload suggested** — Your last 3 squat sessions stalled at RPE 9+.
> [Apply deload] [Not today]

- **Apply** → intensity clamped to ≤5, deload directive added to prompt, session tagged `is_deload = true`.
- **Not today** → snoozed for 3 sessions, override logged. If the same trigger fires after the snooze, the banner returns with the count: "suggested 2 sessions ago."
- If the user picks intensity ≥8 on a flagged day, confirm once, then honor it. **The user knows things the app doesn't** — sleep, stress, whether they're actually sick. Log the override; don't fight it.

Never auto-apply. A personal tool that silently changes your workout because of a rolling median is a tool you stop trusting.

---

## 5. Sparse and Stale Data

### Session count

| Sessions logged | Behavior | Confidence |
|---|---|---|
| **0** | No weight suggestion. Prescribe by `effort_percent` language only (current behavior). Show: *"First time — pick a weight you could do for about [target_reps + 3] reps."* | — |
| **1** | Suggest last session's working weight, **no progression**. One data point can't distinguish a good day from a bad one. **Exception:** if that session was RPE ≤ 6 with all reps completed, allow **one increment** — "too light" is unambiguous. | LOW |
| **2** | Progression allowed at **half the normal step**. | MEDIUM |
| **3+** | Full rules. Anchor = weighted average of last 3 session anchors (weights 0.5 / 0.3 / 0.2, most recent first). | HIGH |

Confidence must be **visible**: "Suggested: 185 lb · 1 session" reads very differently from "· 5 sessions," and the user should be able to weight it accordingly.

### Staleness decay

| Time since last logged session | Behavior |
|---|---|
| **< 3 weeks** | No decay. |
| **3–6 weeks** | Anchor × **0.95**. Session flagged `re_entry` — RPE cap 8. |
| **6–12 weeks** | Anchor × **0.90**. **Recalibration session:** one fewer working set, RPE cap 7, prescription labeled *"Re-entry — confirm this number."* Anchor is fully **rewritten** from this session, not averaged with old data. |
| **> 12 weeks** | **Discard the anchor.** Treat as zero history. |

The 12-week discard is the contamination principle applied to training data: a confident-looking number from four months ago is worse than no number, because it looks authoritative and isn't.

### No cross-exercise inference in v1

If there's history for front squat but none for back squat, **do not derive one from the other**. Ratio-based estimates between movements are a deep rabbit hole with poor accuracy for a single user. Treat as no history. Flagged as an open question.

---

## Data Needed

### Already available

| Source | Field | Use |
|---|---|---|
| `exercise_set_logs` | `weight` (NUMERIC), `reps`, `rpe`, `is_warmup_set`, `set_number` | Anchor computation, RPE rules |
| `exercises` | `exercise_id`, `equipment_used`, `sets`, `reps`, `effort_percent`, `structure` | Prescription context, rep-band matching |
| `workout_sessions` | `intensity`, `goal_preset`, `date`, `status`, `anchor` | Deload triggers D3/D4/D6, goal modulation |
| `structure_results` | `rounds_completed`, `completion_time_seconds`, `completed_under_cap`, `highest_rung`, `rep_scheme` | Timed-format scoring |
| RPC | `get_last_set_data()` | Existing per-exercise history read — extend rather than replace |

### 🚩 New — required

| Field | Where | Why |
|---|---|---|
| `perceived_effort` (INT 1–10) | `structure_results` | **Biggest gap.** Timed sections have no effort signal at all today. Without it, §3's density nudge cannot run. Capture at section completion, same UI as set RPE. |
| `partial_reps` (INT) | `structure_results` | AMRAP partial round is currently prose in `notes`. Needs to be an integer to compute reps-per-minute. |
| `minutes_completed` (INT) | `structure_results` | EMOM completion ratio. Not currently captured. |
| `weight_suggested` (NUMERIC) | `exercises` | Store what the app *prescribed*, separate from `weight_logged`. The gap between suggested and actual is itself a progression signal, and it's how you debug bad suggestions. |
| `reps_prescribed` (INT) | `exercise_set_logs` | `exercises.reps` is TEXT ("8", "30 sec", "AMRAP"). Rep-completion rules need a parsed integer target per set. Parse at generation, store at log time. |
| `load_anchors` table | New | `user_id`, `exercise_id`, `equipment_used`, `anchor_value`, `unit`, `confidence`, `session_count`, `last_session_date`, `updated_at`. Recomputed on session completion. Cached rather than derived on every generation — the query is a multi-join and generation is already latency-sensitive. |
| `is_deload` (BOOL) | `workout_sessions` | Excludes the session from anchor updates; drives history display. |
| `equipment_increments` | Config (code, not DB, for v1) | Barbell 5 lb / 2.5 kg · Dumbbell 5 lb / 2 kg per hand · Kettlebell snap-to-available (8/12/16/20/24/28/32 kg) · Machine 10 lb / 5 kg · Bodyweight → progress reps, not load |

### 🚩 Flags

1. **Unit ambiguity.** `exercise_set_logs.weight` is a bare NUMERIC with no unit. Everything in this spec assumes a consistent unit. Needs either a user-level `weight_unit` setting or a per-log unit column. **Must resolve before any of this ships** — a kg anchor rendered as lb is a real injury path, not just a display bug.
2. **Legacy `weight_logged` is TEXT.** `exercises.weight_logged` accepts free text ("185lbs x 8,8,8,7"). Anchor computation must read **only** from `exercise_set_logs`. Sessions predating migration `00028` have no usable numeric history and should be treated as no history, not parsed heuristically.
3. **Bodyweight and loaded-bodyweight movements** (pull-ups, dips, push-ups) don't fit the anchor model — `weight` is null or represents *added* load. v1: exclude from anchor progression, progress by reps only. Flagged as open question.

---

## Generation Impact

### Architecture: the AI doesn't do arithmetic

Two-part flow around a single generation call:

**Pre-generation (code):** Build a `TRAINING HISTORY` block from `load_anchors`. One row per exercise with a live anchor, capped at the 40 most recently trained. At current library size (~140 exercises) that's a few hundred tokens.

```
TRAINING HISTORY (anchors are estimated 1RM in <unit>)

exercise_id       | anchor | conf   | last seen | note
------------------|--------|--------|-----------|------------------
back-squat        | 285    | HIGH   | 4d ago    | stalled 2 sessions
barbell-bench     | 205    | HIGH   | 6d ago    | progressing
rdl               | 245    | MEDIUM | 11d ago   |
kb-swing          | 32     | HIGH   | 3d ago    |
strict-press      | 125    | LOW    | 38d ago   | re-entry — cap RPE 8

SESSION DIRECTIVE: normal | deload | re_entry
CONDITIONING TREND: ready | hold | backing_off
```

**Post-generation (code):** For each generated exercise that has an anchor, compute `weight_suggested` from `anchor`, the AI's chosen `reps`, and the target RIR implied by `intensity` and `effort_percent`. Round to increment. Apply the safety clamp. Write to `exercises.weight_suggested`.

### Prompt changes required

Additions to `prompt.ts` (currently v3.1.0):

1. **`TRAINING HISTORY` block** — injected variable, above the intensity model section.
2. **Explicit instruction: do not compute weights.** The prompt must say the app fills in loads post-generation. Left to its own devices the model will helpfully invent numbers, and they'll conflict with the computed ones.
3. **Directive handling:**
   - `deload` → reduce set counts ~40%, hold rep targets, cap conditioning at intensity 6, write RPE-cap language into `section_notes`.
   - `re_entry` → one fewer working set on flagged exercises, conservative coaching cues.
   - `conditioning_trend` → adjust round counts, reps per round, and time caps per §3.
4. **Rep-band awareness** — when an exercise shows `progressing` and the goal is hypertrophy, prefer keeping it in the same rep band so double progression has something to progress against. Soft preference, not a constraint. Thematic coherence still wins.
5. **Stall handling** — an exercise marked `stalled` may be swapped for a close variation, which is often the right response to a plateau. Anchor does **not** transfer to the variation (see §5 no-cross-exercise-inference).

Prompt version bump: **v3.2.0**.

---

## UI Touchpoints

| # | Screen | What appears | Override |
|---|---|---|---|
| 1 | **Generate** | Deload banner above intensity selector when triggered. Reason stated in one line. | `Apply` / `Not today` (3-session snooze) |
| 2 | **Review** | Per exercise: `Suggested: 185 lb · ↑5 · 4 sessions`. Confidence shown as session count. Low confidence gets a distinct treatment (muted / dashed). | Tap to edit — overrides for this session only, does not rewrite the anchor |
| 3 | **Review** | Tap the suggestion → "Why this number" `Dialog`: last session's actual sets, RPE, and the rule that fired ("all reps at RPE 7.5 → +1 increment"). | — |
| 4 | **Workout Mode** | `weight_suggested` pre-fills the first set's weight input. Per-set RPE input already exists. | Edit inline — this is the real log |
| 5 | **Workout Mode** | Timed sections: new section-RPE input at completion, alongside rounds/time. Same control as set RPE. | — |
| 6 | **Summary** | "What moved" — exercises where the anchor increased this session. First-time exercises: "Baseline set." | — |
| 7 | **Settings** | Progression on/off · aggressiveness (conservative / standard / aggressive → scales the step sizes in §2) · weight unit · equipment increments | — |
| 8 | **History → exercise detail** | Anchor over time, sparkline. **v2 — do not build in the first pass.** | — |

**Design system:** all new UI uses existing chamfered patterns and tokens from `design-tokens.json`. The suggestion badge should reuse the Favorites "Previous Best" treatment rather than inventing a new one — same semantic role. No new hardcoded values.

---

## Open Questions

1. **Unit.** lb or kg, per-user setting or per-log column? Blocks everything. *(My recommendation: user-level setting, stored on profile, all logs in one unit.)*
2. **Bodyweight movements.** Pull-ups, dips, push-ups don't have a load anchor. Progress by reps only, or introduce a separate "bodyweight capacity" anchor?
3. **Cross-exercise inference.** Ever? Front squat → back squat ratios are well-documented in the literature but poorly calibrated for one person. Currently ruled out for v1.
4. **Aggressiveness default.** Should the Settings default be `conservative` for the first 4 weeks, then move to `standard` once anchors have real confidence?
5. **Anchor smoothing window.** Weighted average of last 3 sessions is a guess. Should it be time-windowed (last 21 days) rather than count-windowed? Count-windowed breaks if you train an exercise twice in 3 months.
6. **Does the AI need the anchor at all,** or just `progressing / stalled / re_entry` labels? Passing the raw number risks the model narrating weights in coaching cues that then conflict with the computed value. *(Leaning toward: pass the labels and confidence, withhold the number.)*
7. **Deload interaction with Favorites.** If a favorited workout is repeated during a deload, does "Previous Best" still show? *(Leaning: show it, but suppress the "beat your time" framing.)*
8. **What happens to a suggestion the user overrides every time?** If the user consistently logs 20 lb below suggestion, the anchor is wrong. Should repeated downward overrides feed back into the anchor?

---

## Recommended Slice Order

This spec is 4–5 build sessions, not one.

| Slice | Contents | Value |
|---|---|---|
| **OVR-01a** | `load_anchors` table, anchor math, §2 RPE rules, §5 sparse/stale rules, `weight_suggested`, Review screen suggestion + "why this number" `Dialog`. Standard sets only. Unit resolution. | **~80% of the value.** Ship this first. |
| **OVR-01b** | Prompt v3.2.0 — `TRAINING HISTORY` block, directive handling, post-generation weight fill. | Closes the loop with generation |
| **OVR-01c** | §3 timed formats — new `structure_results` fields, section RPE capture, density nudge. | Conditioning progression |
| **OVR-01d** | §4 deload detection, Generate-screen banner, override + snooze. | Long-run sustainability |
| **v2** | History anchor charts, aggressiveness setting, override feedback loop (Q8). | Deferred |

**OVR-01a is buildable as soon as Open Question 1 (unit) is resolved.**

---

> **Requirements mapping (added 2026-08-24):** promoted into `CLEAR_REBUILD_REQUIREMENTS.md` v0.2 as OVR-01 (slice a) · OVR-02 (slice b) · OVR-03 (slice c) · OVR-04 (slice d). Open Question 1 is resolved there: the rebuild's baseline schema (DATA-01) keeps `weight_unit` per set log **and** adds a profile-level default unit. Schema fields from "New — required" land in DATA-01; section-effort capture lands in EXE-04.
