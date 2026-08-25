# CLEAR Rebuild — Requirements Specification

**Version:** 0.5 — design system folded in, backlog resolved
**Date:** 2026-08-25
**Requirements:** 55 · **Defects:** D1–D7

**Version history**

| Ver | Change |
|---|---|
| 0.1 | Initial draft. 46 requirements across M0–M2, 9 M3 stubs. Defect register D1–D4 established. |
| 0.2 | Progressive-overload spec landed; OVR stub promoted to four requirements. The spec reached back and changed M0 — weight-unit ambiguity resolved in the baseline schema. |
| 0.3 | First review pass. DS-01/02/06 and GEN-05 gated on the Claude Design export. CORE-04 added. OVR-04 rewritten in plain language. **Independence:** every cited spec copied into this workspace; the rebuild never reads the archived repo. |
| 0.3.1 | IA decisions folded in — Workout becomes a focus mode, Quick Start hides until history exists, favorite completions get a comparison surface, onboarding is strictly first-run. |
| 0.4 | **Two verified defects (D5, D6) and three outside review rounds.** Structured prescriptions, first-class blocks, three-state model with temporal lineage, duration plausibility guardrail, user-authored constraints, staged taxonomy migration. Detail lives in `specs/DATA_MODEL.md` and `specs/generation/GENERATION_CONTRACT.md`. `DATA-04`, `GEN-07`, and `META-01` were proposed during review and withdrawn before issue — hence the gap between `DATA-03` and `DATA-05`. |
| **0.5** | **`clear-design-system@0.5.0` landed and §9 was rewritten against it.** The export ships a component library, not tokens — DS-03 deleted, DS-01/02/05/06 rescoped from *build* to *integrate*, DS-07 shrunk, **DS-08** (adherence gate in CI) added. GEN-05 and SET-01 rescoped. **D7 registered** (set logs written live with no failure handling) and closed by **EXE-07**. **All eight backlog stubs resolved** — five cut, two promoted (EXE-06, EXE-07), one folded into DATA-02; reasoning in `requirements/DEFERRED.md`. Substrate contract: `specs/design/ATOMIC.md`. |
**0.2:** Progressive-overload spec landed (`specs/OVR-01_progressive-overload.md`) → OVR stub promoted to four full requirements (OVR-01…04); DATA-01 and EXE-04 patched so the schema and logging are progression-ready from day one.
**Scope:** Ground-up rebuild of CLEAR. Full parity with the existing app plus spec'd planned features, sequenced M0–M3.

---

## 1. Purpose

This document is the source of truth for what the rebuild must do. It is structured so that **every requirement becomes exactly one GitHub issue**, every `Depends on` line becomes a native GitHub `blocked-by` relation, and the DAG diagram is generated from GitHub — never hand-maintained. Nothing is re-typed or re-interpreted between spec, tickets, and diagram.

**Sizing rule:** every requirement must be **independently mergeable and independently verifiable** — its acceptance criteria can be checked without another requirement landing first. That is the criterion, not elapsed time; time estimates on agent work are noise.

Several requirements bundle separable work and are split into sub-issues before publishing (`--parent`), because an oversized node causes **false serialization** — a dependent waiting on parts of a parent it does not actually need. The graph must not lie about the plan.

**A structural decision that shapes everything below:** parity features **absorb** their spec'd improvements instead of being built old-then-patched. The EMOM clarity, ladder/for-time restructure, and AMRAP logging specs are baked into the M1 execution renderers. Generation ports prompt **v3**, not v2. Favorites builds toward the v2 spec. We never build the confusing version first.

### Non-goals (whole project)

No social features, no gamification, no subscriptions. No Tailwind, styled-components, MUI, or Chakra — styling is raw CSS custom properties generated from design tokens. No SSR or server components. No monorepo (single package until a real need appears). No offline support before M3. No native shell before the PWA has proven itself.

---

## 2. How to read a requirement

```
### ID — Title
**Layer:** infra | data | api | state | ui | design
**Milestone:** M0 | M1 | M2 | M3
**Carry-over:** keep | port | rebuild | new
**Depends on:** comma-separated IDs ("—" if none)
**Spec:** existing doc that carries the detail (optional)

One- or two-sentence summary.

**Acceptance:** the issue's checklist. Verifiable, not vibes.
```

**Carry-over** describes how much prior art exists **in this workspace** for the requirement: **keep** = use the artifact as-is · **port** = adapt an existing spec or asset · **rebuild** = re-implement fresh, prior art is orientation only · **new** = no precedent exists.

> **Independence rule.** The rebuild is self-contained. Every spec, asset, prompt, and token file it needs lives in this workspace under `specs/` or `design/`. **No requirement sends anyone to the archived `clear-app` repository.** If something is missing here, that is a bug in this document — say so rather than reaching backward. Duplication is the intended cost.

**Dependency semantics:** "Depends on" means *must be merged before this issue starts* — not "related to." Dependencies only point backward (earlier or same milestone). Milestones group work for humans; **the graph is what schedules it.**

---

## 3. Glossary

Terms this document uses precisely. Where a definition has a mechanism, it lives in `specs/DATA_MODEL.md`.

| Term | Meaning |
|---|---|
| **Prescribed** | What generation originally produced. Immutable once written. |
| **Revised** | What the user intended after review — a swap, a section regeneration, a pre-start edit. Carries lineage to what it replaced. |
| **Performed** | What was actually done: execution status, optional set logs, block results. Not the same as "revised." |
| **Block** | A group of exercises sharing a structure — a superset, circuit, EMOM, AMRAP, For Time, or a run of independent standard exercises. Rounds, timers, and shared rest belong to the block, not its members. |
| **Slot** | A stable position in a workout across revisions. Swapping an exercise creates a new row in the same slot. |
| **Session focus** | What a workout is *about* — upper body, lower body, full body, power. What the user picks on the generation screen. |
| **Movement pattern** | What an exercise *is* — squat, hinge, press, pull, unilateral, power, conditioning. Derived from `component_movements`. |
| **Modality** | How an exercise's work is measured: reps, time, or distance. **Not** rounds — rounds belong to the block. |
| **Target** | The prescribed work per set, discriminated as fixed (`8`), range (`8–10`), or sequence (`15-12-9-6-3`). |
| **Candidate set** | The exercises a section is *allowed* to use, resolved by query before Claude composes. Claude cannot select outside it. |
| **Hard check** | Deterministic validation that rejects. Mirrors a database constraint. |
| **Soft check** | A quality signal that is recorded and never gates. A soft rule that rejects is a hard rule with a soft name. |
| **Typed absence** | A null actual value means *not recorded* — never zero, never skipped. Skipped is an explicit status. |

---

## 4. Specification index

Requirements state *what* and *how it's verified*. Specs carry the detail. Every spec lives in this workspace — nothing points at the archived repo.

| Spec | Covers | Requirements |
|---|---|---|
| `specs/DATA_MODEL.md` | Schema: blocks, three-state lineage, structured prescriptions, constraints, taxonomy migration | DATA-01…05, SES-01, REV-02/03, EXE-02…05, FAV-01, HOME-02/03 |
| `specs/generation/GENERATION_CONTRACT.md` | Pipeline, candidate retrieval, output shape v4.1, validation split, duration algorithm | GEN-01…06, CORE-03, REV-02 |
| `specs/IA.md` | 14 screen contracts, component vocabulary, navigation | every UI requirement |
| `specs/OVR-01_progressive-overload.md` | Load anchors, RPE rules, deload triggers | OVR-01…04 |
| `specs/structures/*.md` | EMOM, ladder/For Time, AMRAP, superset/circuit clarity | EXE-02…04 |
| `specs/design/*.md` | Visual language, chamfer components, UI component spec | DS-01…07 |
| `specs/screens/*.md` | Onboarding wireframe, loading screens | ONB-01, GEN-05 |
| `specs/favorites-v2.md` | Personal bests, completion history, comparison | FAV-01/02 |
| `specs/generation/exercise-swap.md` | Swap scope, history, undo | REV-02/03 |
| `requirements/CHANGE_SET_v0.4.md` | The reasoning behind v0.4 — invariants, what was withdrawn and why | — |

---

## 5. Defect register — why this rebuild exists

Seven specific failures killed the old app's momentum. Each is designed out by named requirements, and those requirements' acceptance criteria are written to prove the defect is dead.

| # | Defect (old app) | Killed by |
|---|---|---|
| D1 | `AuthContext` loaded session + profile + locations atomically: four hand-rolled concurrency guards, a documented circular-await deadlock, and a failure path that silently reset onboarded users to onboarding | AUTH-01, AUTH-03 |
| D2 | Generation failures fell back to a **mock workout** with a toast — the app appeared to work while broken. No schema validation anywhere; errors were strings; no request IDs to trace client → server | CORE-01, CORE-03, GEN-01, GEN-03 |
| D3 | `generate-workout` logged every request header — bearer tokens written into Supabase logs | CORE-02, GEN-01 |
| D4 | Sitting down to work meant debugging infrastructure: Docker not running, Supabase project paused, connection stack traces instead of explanations | ENV-04, ENV-05, DATA-02 |
| D5 | **Duration validation is tautological.** `validateWorkout()` compares `estimated_duration_mins` — a value Claude asserts — against the requested duration. The prompt tells Claude "45 minutes"; Claude writes 45; the check confirms 45 ≈ 45. It cannot fail | GEN-06, CORE-03 |
| D6 | **Swapped exercises are never persisted.** Generation saves the original; the swap mutates React state only; `handleStartWorkout` writes nothing. Set logs attach to rows describing exercises never performed — swap Deadlift for RDL, log 3×8 at 185, and the database records it *on Deadlift* | DATA-01, SES-01, REV-02, REV-03 |
| D7 | **Set logs are written live with no failure handling.** Every set is a fire-and-forget write during the one activity that happens in basements and steel-framed gyms. A dropped request loses work the user physically did and cannot redo — and the UI shows the set as logged either way | EXE-07 |

---

## 6. Milestones & gates

| Milestone | Theme | Gate — done when |
|---|---|---|
| **M0** | Foundation | CI blocks bad merges; push to main deploys; fresh clone → running app in ≤3 commands with no Docker; new Supabase project seeded **with taxonomy equivalence verified**; auth works end-to-end on a deployed URL; DS-01…04 landed |
| **M1** | Core loop | Eric does a real workout on his phone: generate → review → execute → log sets → see it in history. Every structure type renders clearly, **and the D6 regression test passes** |
| **M2** | Parity + planned near-term | Old app fully retired — nothing it does that the new app doesn't. Favorites v2, streaks, settings, onboarding, installable PWA |
| **M3** | Planned medium-term | Feature-by-feature; each stub gets a spec before issues are cut |

DS-05…07 may land during M1 — the M0 gate requires only DS-01…04. The graph handles the truth.

---

## 7. External inputs

| Input | Feeds | If absent |
|---|---|---|
| Claude Design (Pencil) export zip | DS-01 token source; DS-03…06 visual reference. **Gates DS-01, DS-02, DS-06** | Fall back to `design/tokens/_fallback-from-old-repo/` + `specs/design/visual-language-rules.md` — but see the gate note below |
| `specs/` in this workspace | Every `port`/`rebuild` carry-over — all cited specs live here | Missing spec = defect in this doc |
| Old Supabase project access | DATA-02 exercise library export — **the one remaining external read**, and it is data, not code | Blocker for DATA-02 only |
| Coworker's DAG repo link | Format reference for generated DAG.md | Non-blocking |

---

## 8. M0 — Foundation

### ENV-01 — Repository scaffold
**Layer:** infra · **Milestone:** M0 · **Carry-over:** new
**Depends on:** —
**Spec:** — self-contained; acceptance criteria are the full specification

New repo `clear`. Vite + React 19 + TypeScript strict, ESLint, Vitest, router shell with 404, folder skeleton, README quickstart.

**Acceptance:**
- [ ] `npm run dev` serves the app shell; `npm test`, `npm run lint`, `tsc --noEmit` all pass on a fresh clone
- [ ] Router renders a shell route and a 404 fallback
- [ ] No CSS frameworks or component libraries in `package.json`
- [ ] README documents the 3-command start

### ENV-02 — CI pipeline
**Layer:** infra · **Milestone:** M0 · **Carry-over:** new
**Depends on:** ENV-01
**Spec:** — self-contained; acceptance criteria are the full specification

GitHub Actions on every PR: typecheck, lint, test, build. Branch protection makes green checks a merge requirement on `main`.

**Acceptance:**
- [ ] A PR containing a type error cannot be merged
- [ ] A clean PR shows all four checks green in <5 min
- [ ] CI also greps and fails on raw `console.*` usage in `src/` (see CORE-02)

### ENV-03 — Deploy pipeline
**Layer:** infra · **Milestone:** M0 · **Carry-over:** port
**Depends on:** ENV-01
**Spec:** — self-contained; acceptance criteria are the full specification

Vercel: preview deploy per PR, production on push to `main`. SPA rewrites so every route falls through to `index.html` and deep links survive a refresh — that rewrite is the whole convention; nothing needs to be consulted from the archived repo.

**Acceptance:**
- [ ] Every PR gets a working preview URL
- [ ] Merge to main is live at the production URL without manual steps
- [ ] Refreshing a deep link (e.g. `/history`) does not 404
- [ ] Required env vars documented in `.env.example`

### ENV-04 — Dev environment: one command, legible failures
**Layer:** infra · **Milestone:** M0 · **Carry-over:** new
**Depends on:** ENV-01, DATA-01
**Spec:** — self-contained; acceptance criteria are the full specification

Kills D4. Development runs against the hosted Supabase project — Docker appears nowhere in the loop. `npm run dev` preflights the database and explains problems in English.

**Acceptance:**
- [ ] Preflight pings Supabase before starting; on failure prints "project paused or unreachable — resume at <dashboard URL>" and exits — no stack trace
- [ ] Fresh clone → running app: clone, `cp .env.example .env` (+ fill), `npm run dev`
- [ ] The string "docker" appears nowhere in scripts or setup docs
- [ ] DEVELOPMENT.md covers the full flow including the paused-project recovery

### ENV-05 — Supabase keep-alive
**Layer:** infra · **Milestone:** M0 · **Carry-over:** new
**Depends on:** ENV-02, DATA-01
**Spec:** — self-contained; acceptance criteria are the full specification

Scheduled GitHub Action pings the database twice weekly so the free-tier project never pauses. Delete if the project moves to a paid plan.

**Acceptance:**
- [ ] Action runs green on schedule and via manual dispatch
- [ ] Ping is a harmless read (no writes, no auth secrets in logs)
- [ ] README notes the action and when to remove it

### DATA-01 — Baseline schema
**Layer:** data · **Milestone:** M0 · **Carry-over:** rebuild
**Depends on:** ENV-01
**Spec:** `specs/DATA_MODEL.md`

The full baseline, authored against the data model spec rather than ported from the old migrations. Four domains in one Postgres database: catalog, user baseline, workout, execution. Applied to a **new** Supabase project.

The structural changes that make D6 impossible and the three-state model real: **blocks** as a first-class level between sections and exercises · **discriminated prescriptions** (modality, target kind, per-side, distance unit) replacing a TEXT `reps` column that held four data types · **temporal lineage** (`slot_id`, `created_at`, `superseded_at`) with revision and execution status kept separate · **typed absence** — a null actual never means zero or skipped.

**Acceptance:**
- [ ] Single migration creates the full schema on an empty project
- [ ] RLS verified: authenticated user A cannot read or write user B's rows on any user table
- [ ] Catalog tables are read-only to clients
- [ ] Structure attributes live on `workout_blocks` — **no exercise carries a timer, round count, or shared rest**, so members of a block cannot disagree
- [ ] `block_results` is keyed to a block, not a section — a conditioning section holding an EMOM *and* an AMRAP records both
- [ ] Target CHECK constraints reject a malformed prescription: `{8,10}` as a range and as a two-rung sequence are distinguishable
- [ ] `UNIQUE (replaces_id)` prevents branching lineage; `revision_status` and `execution_status` are independent columns
- [ ] Set logs support reps, duration, and distance with units — not reps alone
- [ ] `weight_unit` on every set-log row plus a profile default; a changed default never reinterprets history
- [ ] Four unambiguous duration fields on the session: requested, effective target, computed, actual
- [ ] Migration commented by domain

### DATA-02 — Exercise library seed + taxonomy verification
**Layer:** data · **Milestone:** M0 · **Carry-over:** keep
**Depends on:** DATA-01
**Spec:** `specs/DATA_MODEL.md` §3

Export the catalog from the old project and seed the new one. **Plus the taxonomy equivalence check** — the anchor split is a separate staged migration, and this is where it is proven safe before the old structures are dropped.

A dev-only flag seeds Eric's profile + default location so the M1 loop is usable before onboarding exists (ONB-01 is M2).

**Acceptance:**
- [ ] Row counts match the old project — **173 exercises** with `component_movements` and `exercise_role` intact
- [ ] Seed is idempotent — running twice changes nothing
- [ ] Pattern-bearing rows migrate from `exercise_anchors` into `exercise_pattern_weights`; region rows (`upper_body`, `lower_body`, `full_body`) are dropped deliberately, not silently
- [ ] **Equivalence verified before the old table is dropped:** candidate sets and focus suggestions compared derived-vs-original across all four focuses, false positives inspected, lost primary/secondary distinctions listed
- [ ] `exercise_anchors` and `anchor_type` dropped only after that comparison passes
- [ ] `--dev` flag seeds a complete profile + one location; without it, no user data
- [ ] Export artifacts committed so the seed is reproducible without old-project access
- [ ] **Coaching cues and regressions are nullable, and every surface renders correctly when they are absent** — the expandable panel, the review row, and the notes field each have a defined empty presentation. Absent is a real state, not a rendering accident (folds LIB-01: enriching cue *content* is ongoing writing, not a build ticket, and we have no professional to author it)

### DATA-03 — Generated types + typed client
**Layer:** data · **Milestone:** M0 · **Carry-over:** rebuild
**Depends on:** ENV-01, DATA-01
**Spec:** `specs/DATA_MODEL.md` §10 enums

`supabase gen types` output committed with a regen script; thin typed client in `lib/supabase.ts`. No `any` escapes the data layer.

**Acceptance:**
- [ ] `npm run gen:types` regenerates types against the new enums (`session_focus`, `movement_pattern`, `target_kind`, `revision_status`, `execution_status`, `distance_unit`); drift fails CI note in DEVELOPMENT.md
- [ ] Client exports typed table/RPC helpers only — no raw untyped calls elsewhere in `src/`
- [ ] A sample typed query and RPC call compile and run in a test

### DATA-05 — User-authored constraints
**Layer:** data · **Milestone:** M0 · **Carry-over:** new
**Depends on:** DATA-01
**Spec:** `specs/DATA_MODEL.md` §5

Explicit exclusions the user sets for themselves. **CLEAR does not model injuries** — three scopes, all enforceable against catalog data that already exists.

**Acceptance:**
- [ ] Three scopes supported: exercise, movement pattern, equipment. **No impact scope** until the catalog can enforce it
- [ ] `exclude` filters deterministically in the eligibility query, before Claude composes
- [ ] `applies_to_session_id` enforced — a session-scoped exclusion **does not** apply to later sessions
- [ ] Equipment exclusion removes only the excluded option; an exercise usable with dumbbells survives a barbell exclusion, and the candidate passed to Claude offers dumbbells only
- [ ] Free text is stored and never parsed — no constraint is ever inferred from a note
- [ ] `avoid` and `prefer_not` persist and reach Claude as context; **the UI exposes `exclude` only** until a ranking layer consumes them

### CORE-01 — Error taxonomy + request IDs
**Layer:** state · **Milestone:** M0 · **Carry-over:** new
**Depends on:** ENV-01
**Spec:** — self-contained; acceptance criteria are the full specification

Kills the stringly-typed half of D2. A typed `AppError` union (auth / network / validation / generation / persistence), Result helpers, a request-ID generator attached to every edge-function call, and an error→user-message map.

**Acceptance:**
- [ ] Every `AppError` carries `code`, `requestId` (where applicable), and a user-safe message
- [ ] Unit tests cover the error→message mapping
- [ ] No `throw "string"` / `catch (e) { e.message }` patterns — enforced by convention doc + review checklist
- [ ] `requestId` format documented; the same ID is sent to and returned by edge functions

### CORE-02 — Structured logger with redaction
**Layer:** state · **Milestone:** M0 · **Carry-over:** rebuild
**Depends on:** ENV-01, CORE-01
**Spec:** — self-contained; acceptance criteria are the full specification

Kills D3 at the tooling level. Leveled logger with scoped children for client and edge runtimes. Redaction is structural: headers, tokens, and emails cannot be logged.

**Acceptance:**
- [ ] Logger API accepts objects, never raw header maps; a denylist test proves `authorization`/`apikey` values never appear in output
- [ ] Edge variant emits one structured line per request: requestId, route, status, duration — and nothing from headers
- [ ] Raw `console.*` in `src/` fails CI (grep gate from ENV-02)

### CORE-03 — Boundary schemas (zod)
**Layer:** state · **Milestone:** M0 · **Carry-over:** new
**Depends on:** ENV-01, DATA-03
**Spec:** `specs/generation/GENERATION_CONTRACT.md` §5

Kills the unvalidated half of D2. Zod schemas for every payload that crosses a boundary, mirroring the database's CHECK constraints so **anything that validates can be persisted** — failing at the boundary beats failing at the INSERT.

Covers the generation output contract v4.1 (blocks, discriminated targets, timer contracts), request/response envelopes, `Profile`, `Location`, and `user_constraints`. One source file consumed by client and edge functions alike.

**Acceptance:**
- [ ] A real contract-v4.1 sample round-trips, including a ladder (`target_kind: sequence`), a rep range, a per-side prescription, and a distance prescription
- [ ] Discriminated union on `target_kind` rejects a payload with the wrong fields populated
- [ ] `modality` accepts reps, time, distance — and **rejects `rounds`**, which belongs to the block
- [ ] Timed block types without `timer_seconds` are rejected; `circuit` without `rounds` is rejected
- [ ] An invalid sample fails with path-level issues (which field, why)
- [ ] Client and edge import the same schema source — no duplicated definitions
- [ ] Types are inferred (`z.infer`), never written twice

### CORE-04 — App-wide state contract
**Layer:** state · **Milestone:** M0 · **Carry-over:** new
**Depends on:** CORE-01
**Spec:** `specs/IA.md` §5 cross-cutting — the four-state contract is realized per screen

Answers a question the rest of this document was leaving implicit: *what does the user see when something fails, is slow, or has no data?* Every data-driven view must define four states — **loading, empty, error, populated** — and a top-level error boundary must exist so a render crash never produces a blank screen.

**Acceptance:**
- [ ] A documented four-state contract every view implements: loading / empty / error / populated. No view is allowed to render nothing
- [ ] Top-level error boundary catches render crashes and shows a recoverable screen with a reload action — never a white page, never a raw stack trace
- [ ] Error views render an `AppError` (CORE-01): plain-language message, `requestId` when present, and a retry that actually re-runs the failed operation
- [ ] Empty is distinguishable from loading and from error — three different screens, never a spinner that silently means "nothing here"
- [ ] Slow operations show progress after a threshold rather than appearing frozen
- [ ] A test simulates each state for at least one representative view

### AUTH-01 — Session context
**Layer:** state · **Milestone:** M0 · **Carry-over:** rebuild
**Depends on:** ENV-01, DATA-03
**Spec:** `specs/DATA_MODEL.md` §5 profiles

Kills half of D1. A minimal provider over `supabase.auth.onAuthStateChange` exposing `{ status, user, signOut }`. It fetches **nothing** — no profile, no locations, no timeouts, no locks.

**Acceptance:**
- [ ] ≤80 lines; zero `useRef` concurrency guards; zero manual timeouts
- [ ] No data fetching inside any auth event handler
- [ ] Token refresh does not trigger any application fetch
- [ ] `signOut` clears the React Query cache
- [ ] Unit tested against a mocked auth client (signed out → in → refresh → out)

### AUTH-02 — Welcome + OTP login screens
**Layer:** ui · **Milestone:** M0 · **Carry-over:** rebuild
**Depends on:** AUTH-01, DS-04
**Spec:** `specs/IA.md` — OTP Login screen contract

Email OTP request and verify flow per the design system. Typed error states; resend with cooldown.

**Acceptance:**
- [ ] Full round-trip works on a deployed preview URL (D-gate for M0)
- [ ] Wrong/expired code shows a typed, human error — not a raw Supabase message
- [ ] Resend disabled during cooldown with visible countdown
- [ ] Public-only: authenticated users are redirected away

### AUTH-03 — Route guards + profile/locations queries
**Layer:** state · **Milestone:** M0 · **Carry-over:** rebuild
**Depends on:** AUTH-01, DATA-03, CORE-01, CORE-03
**Spec:** `specs/IA.md` §1 guard semantics · §5 cross-cutting

Kills the other half of D1. Profile and locations are independent React Query queries keyed by `user.id`. Guards (public-only / protected / onboarding-gate) read query state. A failed profile fetch renders an error with retry — it **never** impersonates a new user.

**Acceptance:**
- [ ] Simulated profile 500 → error screen with retry; user is never routed to onboarding
- [ ] Guard matrix tested: {unauthenticated, authenticated±onboarded, loading} × {public, protected, onboarding} routes
- [ ] Profile and locations load independently; one failing does not block the other
- [ ] Sign-out invalidates both queries; no refetch storms on token refresh
- [ ] **Until ONB-01 exists (M2), an authenticated user without a completed profile sees a clear placeholder screen** — "account setup isn't built yet" with a sign-out action — never a redirect to a route that does not exist. Removed when ONB-01 lands

---

## 9. Design system (DS trunk — M0 gate covers DS-01, DS-02, DS-04, DS-08)

> **The gate is lifted.** `CLEAR Design System 0.5.0` landed 2026-08-25 and was reviewed
> against this section. It is not a token export — it is a **complete, versioned component
> library**: 18 React exports with typed props, 75 icons, four skins, a three-level
> atmosphere axis, a full motion vocabulary, measured contrast, and a lint config that
> mechanises design-system compliance.
>
> Everything the DS trunk previously proposed to *build*, it **ships**. This section is
> rewritten from "build the design system" to "integrate it, and build only what it
> doesn't cover." `specs/design/ATOMIC.md` is the substrate contract; read it before any
> DS or UI ticket.
>
> **DS-03 (chamfer primitives + buttons) is deleted** — `ChamferedFrame`, `Button`,
> `IconButton`, `.clr-chamfer`, `.clr-card` and `.clr-btn` all ship, with the chamfer
> implemented two ways and the border geometry solved more exactly than the requirement
> asked for. Its dependents move to DS-01 and DS-04.

### DS-01 — Vendor and mount the design system
**Layer:** design · **Milestone:** M0 · **Carry-over:** new
**Depends on:** ENV-01
**Spec:** `specs/design/ATOMIC.md` · `clear-design-system@0.5.0` (external input)

Vendor the export at a pinned version, mount its stylesheet and skin bootstrap, and make
the pin verifiable. There is no token generator: the export **is** the CSS, and hand-authoring
a second source of truth for colour would be the exact failure the system exists to prevent.

**Acceptance:**
- [ ] `clear-design-system@0.5.0` vendored at `src/design-system/`, contents byte-identical to the export
- [ ] `css/foundation.css`, `css/motion.css` and `css/skins.css` imported once at the app root, from the vendored folder, unmodified
- [ ] **The skin is app-owned.** `src/styles/skin-clear.css` holds the seven role hexes and the three font families, per the export's own instruction that a product replaces this file only. The vendored `styles.css` and `css/skin-clear.css` are not loaded — that is what removes the Google Fonts `@import` without patching a vendored file (see DS-02)
- [ ] No component imports CSS
- [ ] `initSkin()` from `skin.js` runs in a blocking `<head>` script; no skin flash on first paint
- [ ] A test asserts the exported `VERSION` equals the version recorded in `specs/design/ATOMIC.md` §1
- [ ] Imports resolve from the public entry; a component-internal import fails lint (see DS-08)
- [ ] `docs/UPGRADING-DESIGN-SYSTEM.md` documents the drop-in: replace the folder, **diff the export's `styles.css` against the app's import list so a newly-added layer is not silently dropped**, diff the export's `skin-clear.css` against the app-owned skin, re-run the adherence lint, re-run the version test, re-check the Contrast Audit card
- [ ] **No file outside `src/design-system/` defines a colour, spacing, radius or font token**

### DS-02 — Self-host the three font families
**Layer:** design · **Milestone:** M0 · **Carry-over:** port
**Depends on:** DS-01
**Spec:** `specs/design/ATOMIC.md` §3.5

**Decided 2026-08-25 — self-host.** The reason is the render path, not offline support.

The export loads fonts through nested CSS `@import`s, which the browser can only discover
one hop at a time:

```
styles.css  →  @import css/skin-clear.css
            →  @import fonts.googleapis.com/css2?…
            →  @font-face src: fonts.gstatic.com/…woff2
```

Four sequential, render-blocking round trips before a single glyph draws. Until they finish,
every uppercase Rajdhani and Oxanium surface in the app — labels, CTAs, timers, tabs, chips —
renders in `system-ui` at a different width, and the whole interface reflows once when the real
faces land. That is the cost, and it is paid on every cold load on a phone.

Self-hosting collapses four hops to one, served from the app's own origin.

Delivery is three Fontsource packages — `@fontsource/rajdhani`, `@fontsource/oxanium`,
`@fontsource/space-grotesk` — which ship the woff2 files and the `@font-face` rules already
written. Nothing is hand-downloaded and nothing is requested from the design system.

**Acceptance:**
- [ ] Three families served from the app origin; **no request to `fonts.googleapis.com` or `fonts.gstatic.com` in a production network trace**
- [ ] Only the weights the app uses are shipped — Rajdhani 500/600/700 · Oxanium 400/500/600/700 · Space Grotesk 400/500/700 — Latin subset
- [ ] `<link rel="preload">` for the above-the-fold weights; `font-display: swap`
- [ ] A real fallback stack per font role, metric-adjusted where it reduces shift; **cumulative layout shift from font swap measured, not assumed**
- [ ] The `@font-face` rules live in the **app-owned** `src/styles/skin-clear.css` from DS-01; `src/design-system/` is not edited
- [ ] Lighthouse reports no render-blocking font request

### DS-03 — *(deleted — shipped in the export)*
`ChamferedFrame` (SVG double-width stroke + clip, `trace`, `scan`, `glow`, four chamfer
sizes), `Button` (four variants × three sizes, loading, icon, icon-only), `IconButton`
(mandatory accessible name), `.clr-chamfer`, `.clr-card`, `.clr-btn`. Dependents rewired
to DS-01 and DS-04.

### DS-04 — App-composed controls
**Layer:** design · **Milestone:** M0 · **Carry-over:** new
**Depends on:** DS-01
**Spec:** `specs/design/ATOMIC.md` §11
**Sizing:** oversized — **split into sub-issues before publishing.** Card, Select and
CollapsibleSection have disjoint dependents; bundling them makes HOME-01 wait on a filter
control it never renders.

The three parts CLEAR needs that 0.5.0 does not ship. Each is a **composition** of shipped
tokens and classes, not a new visual idea.

- **DS-04a · Card** — `.clr-card` ships as CSS only. Wrap it as a React component: accent
  bar + chamfered body, `barWidth` for the 8/12px variants.
- **DS-04b · Select** — absent from the export entirely. Needed for history and library
  filtering.
- **DS-04c · CollapsibleSection** — workout section disclosure.

**Acceptance:**
- [ ] `Card` composes `.clr-card__bar` + `.clr-card__body`; introduces **no new token**
- [ ] `Select` is a real `<select>` styled to CLEAR, with `FormField`'s label/helper/error aria wiring
- [ ] `CollapsibleSection` uses the disclosure pattern with `aria-expanded` and a keyboard-operable trigger; content is not removed from the accessibility tree while collapsed
- [ ] All three pass the adherence lint at `error` (DS-08)
- [ ] All three render in the gallery in every state across all four skins
- [ ] Touch targets ≥44px on coarse pointers

### DS-05 — Toast host and error surfaces
**Layer:** design · **Milestone:** M1 · **Carry-over:** new
**Depends on:** DS-01
**Spec:** `specs/design/ATOMIC.md` §5, §10 · export `docs/patterns.md` pattern 3

The export ships a `Toast` *component*; queueing is application state, and it is the half
the old app got wrong. `EmptyState`, `Dialog` and `ScanLoader` ship — this requirement is
the host, the `AppError` rendering contract, and the dialog's entrance motion.

> **No bottom sheets — decided 2026-08-25.** Every overlay in CLEAR is a `Dialog`. The one
> place a sheet was specified (OVR-01's *why this number*) is a modal explanation, and
> `Dialog` already gives it the platform's focus trap, Esc handling and background
> inertness. What a sheet would have contributed — the sense of a panel arriving — comes
> from the motion vocabulary instead. CLEAR bans rounded corners, so a sheet lost its
> signature anyway.

**Acceptance:**
- [ ] One toast host mounted at the app root; **at most one toast visible**, a second queues
- [ ] `AppError` renders as `Toast variant="negative"` when it interrupts, `EmptyState` when the whole screen failed — user message + requestId + exactly one retry action
- [ ] `.clr-phosphor-out` runs before removal; no toast is unmounted mid-animation
- [ ] Dismiss is keyboard-reachable and never yanks focus from what the user was doing
- [ ] A success is never announced assertively — only `negative` is `role="alert"`
- [ ] **Dialogs arrive with the system's motion, not a slide.** `Dialog` ships with no entrance animation — `showModal()` simply reveals it. The app wrapper composes the shipped vocabulary so a modal reads as a panel powering up: the chamfered frame **traces its border on** (`.clr-trace`), the contents **materialize** (`.clr-materialize`), and the backdrop **hard-cuts** (`.clr-cut-in`) rather than fading
- [ ] Dismissal runs `.clr-phosphor-out` before unmount — the signal cuts, the coating keeps glowing
- [ ] Dialog entrance is visibly distinct from a toast's arrival; a toast phosphors in, a dialog constructs itself
- [ ] Timings are tokens, tuned in the gallery against the export's Motion Lab card — no hardcoded ms
- [ ] Every dialog animation is inert under `prefers-reduced-motion`; the end state renders immediately and nothing waits on it

### DS-06 — Atmosphere assignment
**Layer:** design · **Milestone:** M1 · **Carry-over:** port
**Depends on:** DS-01
**Spec:** `specs/design/ATOMIC.md` §7.2 · `specs/IA.md` §4

The five-layer ground, the grain and scanline overlays, every keyframe, the reduced-motion
fallback and the three intensity levels all ship as `.clr-atmosphere` + `data-atmosphere`.
What remains is **assignment**: every screen declares how loud its room is, and the app
proves it on a real phone.

**Acceptance:**
- [ ] Every screen in `specs/IA.md` §4 sets `data-atmosphere` to its documented level; a test asserts each route renders with that value
- [ ] The atmosphere layer mounts **once** at the app root, not per screen
- [ ] All three levels hold 60fps on a mid-range Android phone, measured not assumed
- [ ] `prefers-reduced-motion` renders the static fallback with no drift and no scan
- [ ] A grep for easing curves outside `src/design-system/` finds only `linear` and `steps()`

### DS-07 — Gallery
**Layer:** design · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** DS-04
**Spec:** `specs/design/ATOMIC.md`

The visual review surface — screens get approved rendered, not drawn. The export already
ships 38 specimen cards, including Contrast Audit, Motion Lab, Skins, Atmosphere Modes and
States Gallery. Serve them; do not recreate them.

**Acceptance:**
- [ ] `/dev/gallery` is dev-only and excluded from production bundles
- [ ] The export's 38 specimen cards served **unmodified** at `/dev/gallery/ds`
- [ ] App-composed parts (DS-04, DS-05, and each atmosphere level) at `/dev/gallery/app`, in every state
- [ ] Skin switcher cycles all four skins live via `setSkin()`; atmosphere switcher cycles all three levels
- [ ] Adding a component to DS-04 or DS-05 without adding it to the gallery fails review

### DS-08 — Adherence gate in CI
**Layer:** design · **Milestone:** M0 · **Carry-over:** new
**Depends on:** DS-01
**Spec:** `specs/design/ATOMIC.md` §13 · export `_adherence.oxlintrc.json`

The standing constraint — *a hardcoded hex, px spacing, or font name is a review-blocking
defect* — becomes a failing build instead of a sentence in a document. The export ships the
rule set; the rebuild raises it from `warn` to `error` and runs it.

**Acceptance:**
- [ ] oxlint runs in CI over `src/`, consuming `_adherence.oxlintrc.json` with every rule raised to `error`
- [ ] `src/design-system/` is excluded — it is the source of the tokens, not a consumer
- [ ] Fixture tests prove the gate bites: a raw hex, a raw px value, a non-system font, an unknown component prop, an out-of-range `variant`, and a component-internal import each fail the build
- [ ] Runnable locally as `npm run lint:ds`, documented in the README
- [ ] The gate is wired **before** the first screen ticket lands, so no screen is ever written against unenforced rules

---

## 10. M1 — Core loop

The gate: a real workout, on a phone, end to end. Generation quality and execution clarity are both first-class here — the clarity specs are *in* these requirements, not queued behind them.

### GEN-01 — Edge function envelope
**Layer:** api · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** DATA-01, CORE-01, CORE-03
**Spec:** `specs/generation/GENERATION_CONTRACT.md` §9 errors

The shared shell for all AI functions: auth verification, zod request parsing, CORS, typed error responses `{ code, message, requestId }`, structured logging. Kills D3 at the function level.

**Acceptance:**
- [ ] Unauthenticated → 401 typed; malformed body → 400 with zod issue paths
- [ ] Every response (success or error) echoes the client's requestId
- [ ] A test asserts the words `authorization`/`apikey` never appear in log output
- [ ] Envelope is a reusable module — `generate-section` (REV-02) adopts it unchanged

### GEN-02 — Workout generation: contract v4.1
**Layer:** api · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** GEN-01, DATA-02, CORE-03
**Spec:** `specs/generation/GENERATION_CONTRACT.md`

The pipeline becomes resolve → retrieve → **compose** → validate → hydrate → persist. Claude occupies exactly one step, the one requiring judgment; everything on either side is deterministic.

Eligibility resolves in SQL **before** the prompt is built, so rules currently described in prose become constraints applied to Claude's input. It cannot select an ineligible exercise because it never sees one.

**Acceptance:**
- [ ] Candidate retrieval runs per section: focus→pattern join, equipment intersection, user exclusions, section eligibility. `usable_equipment` computed per candidate so Claude only sees equipment it may choose
- [ ] One live run per goal preset returns a contract-valid workout honoring section scaling
- [ ] Claude **cannot** return an exercise or equipment outside the candidate set — validated, and structurally unlikely since candidates are all it receives
- [ ] Facts hydrated by ID after validation: name, equipment display names, cues, regression. Claude returns none of them
- [ ] Claude returns no authoritative duration; its estimate is stored as diagnostic only
- [ ] Hard checks mirror the schema's CHECK constraints; soft checks (ratios, warmup coverage, variety, repetition) are recorded and **never gate**
- [ ] Recorded invalid-response fixture triggers one retry, then a typed `generation` error — never a partial result
- [ ] Active-recovery preset produces warmup/mobility/cooldown only, intensity clamped 1–3
- [ ] `prompt_version` and `contract_version` stamped on every session
- [ ] Prompt is measurably shorter — the library dump and the enforceable rules are gone

### GEN-03 — Generation client state
**Layer:** state · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** GEN-02, CORE-03, AUTH-03
**Spec:** `specs/generation/GENERATION_CONTRACT.md` §9 · `specs/IA.md` — Generate and Loading screen contracts

React Query mutation with pending / success / typed-error states. Kills D2's silent fallback: there is no mock workout in this codebase.

**Acceptance:**
- [ ] Network killed mid-generate → ErrorState with message, requestId, retry — app never shows fabricated content
- [ ] Grep gate: no mock/demo workout fixtures outside test files
- [ ] Double-submit prevented; success hands the validated workout to review
- [ ] Response re-parsed with CORE-03 schema on the client (defense in depth)

### GEN-04 — Generation screen
**Layer:** ui · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** GEN-03, DS-04, AUTH-03
**Spec:** `specs/generation/generation-prompt-v3-notes.md` Part 2 (goal selector delta)

Inputs: goal selector (first, no default, per v3 delta), intensity slider with goal-driven clamp cascade, anchor, location/equipment override, time target (default 45), optional notes.

**Acceptance:**
- [ ] Generate CTA disabled until goal + anchor selected
- [ ] Selecting a goal clamps the intensity slider to its valid range
- [ ] Payload validates against the CORE-03 request schema before send
- [ ] Defaults prefill from profile (goal, default location); mobile-first layout

### GEN-05 — Loading screen
**Layer:** ui · **Milestone:** M1 · **Carry-over:** port
**Depends on:** GEN-03, DS-06
**Spec:** `specs/design/ATOMIC.md` §5, §10 · export `docs/patterns.md` pattern 2 · `specs/screens/loading-screens.md`

> **Rescoped by the design system.** `ScanLoader` ships — scan sweep, boot-staggered rows,
> `status: ok | slow | failed`, a polite live region with `aria-busy`, `aria-hidden` log
> lines, and a reduced-motion static state. The prototype at
> `specs/screens/loading-screen-prototype.html` is now **reference for the copy sequence
> only**; its markup and motion are superseded. Do not port bespoke loading markup.

Compose the generation loading screen from `ScanLoader` with the staged status copy and a
cancel action, at `data-atmosphere="full"`.

**Acceptance:**
- [ ] Built from `ScanLoader`; no bespoke spinner, skeleton or loading markup anywhere in the app
- [ ] Visible for the full mutation; stale results ignored after cancel/unmount
- [ ] `status` reflects reality — `slow` at the documented threshold, `failed` on error; never decorative
- [ ] No `value`/`max` passed unless progress is genuinely known
- [ ] Status copy is terse-imperative per voice rules; the slow message states the fact and does not apologise or joke
- [ ] Failure hands off to pattern 3 (recoverable failure) — a negative toast with exactly one retry action, never a dead end

### GEN-06 — Duration plausibility check
**Layer:** api · **Milestone:** M1 · **Carry-over:** new
**Depends on:** GEN-02, CORE-03
**Spec:** `specs/generation/GENERATION_CONTRACT.md` §7

Closes D5. The backend computes a rough duration estimate from the structured prescription, independently of Claude. **Purpose: reject workouts that clearly cannot fit — not predict completion time.**

Crude on purpose. Today's check compares a number Claude was told the answer to against the request, so it cannot fail; any independent computation is strictly better.

**Acceptance:**
- [ ] Estimate computed from blocks and prescriptions — Claude's `estimated_duration_mins` is **never** consulted for validation
- [ ] Allowances are **code constants**: fixed work-per-set, fixed transition. No metadata table, no per-exercise override, no tempo parsing
- [ ] Per-block rules: standard sums members; superset and circuit count shared rest **once per round**; EMOM and AMRAP use declared duration; For Time budgets the **full cap**
- [ ] Tolerance ~15–20%, generous by design
- [ ] A workout whose prescribed work and required rest clearly cannot fit is **rejected**, triggering one targeted retry that names the overrunning block. **Not trimmed** — deciding what to cut is composition judgment, which belongs to the model, not the validator
- [ ] Failure names the **block** that overran and by how much, so the retry is specific rather than a blind re-roll
- [ ] `computed_duration_mins` persisted alongside Claude's estimate, so the two can be compared later

### SES-01 — Session lifecycle + three-state persistence
**Layer:** state · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** DATA-01, DATA-03, CORE-03, AUTH-03
**Spec:** `specs/DATA_MODEL.md` §7

The workout state machine, and the requirement that closes D6. Accept → persist atomically → active → complete, with prescribed, revised, and performed all independently reconstructable.

**Acceptance:**
- [ ] **D6 regression test:** generate a workout, swap an exercise in review, start, log sets, complete. Assert the set logs attach to the *substitute* and the original is still reconstructable with lineage. This test must exist and must fail against the old behavior
- [ ] Accepting persists the full structure — sessions, sections, blocks, exercises
- [ ] A swap inserts a new row in the same `slot_id` with `replaces_id` set; the superseded row keeps its own `execution_status`
- [ ] "As intended at start" resolves temporally — rows active at `started_at`, not merely active now
- [ ] "As performed" includes skipped exercises with no logs, block results, and partially-logged exercises — not a bare join to set logs
- [ ] Hard refresh mid-workout → resumable at the correct section with logged sets intact
- [ ] Completion writes `completed_at` and `actual_duration_mins`
- [ ] **Minimal streak derivation lands here:** consecutive days with a completed, streak-counting session, computed from `workout_sessions` — never stored. Pause states, rest-day allowances, and the week strip are HOME-02's extension of this same function, not a replacement for it
- [ ] Machine transitions unit-tested, including the abandon path

### REV-01 — Review screen
**Layer:** ui · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** GEN-03, DS-03, DS-05
**Spec:** `specs/IA.md` — Review screen contract; three entry paths

Pre-workout briefing: sections and exercises, estimated duration, intensity/anchor/goal header, Start Workout, Regenerate (with discard confirm).

**Acceptance:**
- [ ] Renders every structure type and rep scheme correctly from a schema-valid sample
- [ ] Regenerate confirms before discarding; Start hands off to SES-01
- [ ] Duration shown to the user is the **effective target** — the number generation was asked to hit. The computed plausibility estimate and Claude's diagnostic estimate are internal and never surfaced

### REV-02 — Section/exercise swap function
**Layer:** api · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** GEN-02
**Spec:** `specs/generation/exercise-swap.md`, `specs/generation/GENERATION_CONTRACT.md`

Single-slot regeneration on the same contract as GEN-02 — the same candidate retrieval, the same validation, narrower scope.

**Acceptance:**
- [ ] A swap draws from the same candidate query as generation, scoped to the slot's section and constraints
- [ ] Unit swap regenerates a whole block as a unit, preserving the block's structure and timer
- [ ] The result is persisted as a revision with lineage — **never a mutation in place** (D6)
- [ ] Envelope guarantees inherited: typed errors, requestId echo, no header logging

### REV-03 — Swap UI: history, undo, nudge
**Layer:** ui · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** REV-01, REV-02
**Spec:** `specs/generation/exercise-swap.md`, `specs/generation/exercise-swap-plan.md`

Per-slot swap with up-to-3 history and undo; unit swap for blocks; nudge to regenerate the whole workout after a slot's third swap.

**Acceptance:**
- [ ] Swap history bounded at 3 per slot; undo restores the exact prior exercise
- [ ] Unit swap replaces the block atomically in review state
- [ ] Third swap on a slot surfaces the regenerate nudge
- [ ] Swap errors use ErrorState — review content never silently changes
- [ ] Every accepted swap is persisted as a revision with lineage before the workout starts (D6)

### EXE-01 — Workout shell
**Layer:** ui · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** SES-01, DS-03, DS-05
**Spec:** `specs/structures/master-structure-clarity.md`

Section-by-section progression, prev/next navigation, progress tracker, global session timer, exit/abandon with confirm.

**Acceptance:**
- [ ] Global timer is wall-clock based — correct after backgrounding the tab/phone
- [ ] Navigation works across all sections; progress bar reflects section statuses
- [ ] Abandon confirms, persists partial state, and feeds HOME-01 resumption
- [ ] **Workout is a focus mode.** While a session is active there is no in-app navigation out of it except completing or abandoning — no nav to History, Settings, or Home. Browser back triggers the abandon confirm rather than leaving
- [ ] Navigating directly to another route with an active session (deep link, restored tab) prompts to resume or abandon rather than silently stranding the session
- [ ] Leaving the *app* is still allowed — closing the tab or backgrounding the phone persists state and surfaces resumption on Home. The trap is on in-app navigation, not on the user
- [ ] Section header shows structure-type identity per the master clarity spec

### EXE-02 — Standard + superset renderers, set logging
**Layer:** ui · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** EXE-01, DS-04
**Spec:** `specs/structures/superset-circuit-clarity.md`

Standard and superset blocks. Per-set logging (weight, reps, RPE, warmup flag) writing `exercise_set_logs` live, and last-time prefill from prior sessions.

**Acceptance:**
- [ ] Renders from the **structured prescription** — no string parsing anywhere
- [ ] Each target kind displays correctly: fixed (`8`), range (`8–10`), sequence (`15-12-9-6-3` as ordered rungs), per-side, and distance with its unit
- [ ] Each logged set is a row written at log time — not batched at workout end
- [ ] Logs the modality actually prescribed: reps, duration, or distance
- [ ] Prefill shows previous weight/reps when history exists
- [ ] Superset alternation labeled clearly; rest comes from the **block**, prescribed after both movements

### EXE-03 — Circuit + EMOM renderers
**Layer:** ui · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** EXE-01
**Spec:** `specs/structures/emom-clarity.md`, `specs/structures/superset-circuit-clarity.md`, `specs/structures/quickfix-amrap-round-label.md`

Circuits (3+ exercises × rounds) and EMOM with the clarity spec built in: minute indicators, active/inactive highlighting, ODD/EVEN MIN labels for alternating EMOMs.

**Acceptance:**
- [ ] Renders from the block: rounds, timer type, timer seconds, and shared rest all read from `workout_blocks`
- [ ] EMOM minute boundary visibly flips active work; remainder reads as rest
- [ ] Alternating EMOMs label ODD/EVEN MIN per spec
- [ ] Circuit tracks current round and position within it; round advance is one tap
- [ ] Shared rest is honored **once per round**, not once per exercise
- [ ] Outcome writes `block_results` — `minutes_completed` for EMOM, `rounds_completed` for circuits
- [ ] Timed structure state survives refresh (via SES-01)

### EXE-04 — AMRAP + For Time + ladder renderers
**Layer:** ui · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** EXE-01
**Spec:** `specs/structures/amrap-logging.md`, `specs/structures/ladder-for-time.md`, `specs/structures/quickfix-ladder-rung-label.md`

The restructure specs built in: rep scheme shown once; ladder rung selector on cap-hit; distinct completion paths (finished under cap vs cap reached); AMRAP partial-round capture. Outcomes write `block_results`.

**Acceptance:**
- [ ] Ladder rungs render from `target_sequence` as ordered targets — the renderer indexes them, nothing parses a string
- [ ] For Time: finish-under-cap and cap-reached paths both reachable, visually distinct
- [ ] Cap-hit on a ladder prompts rung selection; `highest_rung` persisted
- [ ] AMRAP logs completed rounds + partial round reps
- [ ] `block_results` row correct for each outcome: `elapsed_seconds` and `completed_under_cap` for For Time, `rounds_completed` and `partial_round_reps` for AMRAP
- [ ] Section perceived effort (1–10) captured at block completion
- [ ] Red/urgency styling only near time cap — per color doctrine
- [ ] Section completion also captures perceived effort (1–10), AMRAP partial reps, and EMOM minutes completed — DATA-01 provides the columns; this builds OVR-03's history from day one

### EXE-05 — Rest timer + coaching panel
**Layer:** ui · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** EXE-01, DS-05
**Spec:** `specs/IA.md` — Workout screen contract · `specs/DATA_MODEL.md` §6 rest fields

Rest countdown bar (auto-start where prescribed, skip, +time) and the expandable per-exercise panel: coaching cues, regression suggestion, notes.

**Acceptance:**
- [ ] Rest auto-starts after set completion when the prescription specifies it — read from `rest_seconds` on the exercise, or `round_rest_seconds` on the block; skip and extend work
- [ ] Cues and regression pulled from the library definition
- [ ] Exercise notes persist to the exercise row
- [ ] Timer accurate after backgrounding (wall-clock)

### EXE-07 — Durable set logging
**Layer:** state · **Milestone:** M1 · **Carry-over:** new
**Depends on:** EXE-02, SES-01
**Spec:** `specs/DATA_MODEL.md` §5 set logs

Closes D7. A set the user physically performed must never be lost to a dead signal, and the
UI must never claim a set is logged when it is not. **This is not offline support** — the
app does not need to work offline. It needs one write path that does not lie.

**Acceptance:**
- [ ] Set writes go through a durable local queue first; the row is written locally, then flushed
- [ ] The queue survives a reload, a backgrounded tab, and a killed app — a set logged at 6:02 is still there at 6:40
- [ ] The UI distinguishes **logged** from **syncing** from **failed to sync**; a pending set is never drawn as confirmed
- [ ] Flush is idempotent — a retried write does not create a duplicate set (client-generated id, not a server sequence)
- [ ] On resuming a session, unflushed sets reconcile against the server without the user being asked to re-enter anything
- [ ] Sustained failure surfaces once, factually, with the count of unsynced sets — not a toast per set

### SUM-01 — Post-workout summary
**Layer:** ui · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** SES-01, DS-04, DS-05
**Spec:** `specs/IA.md` — Summary screen contract

Debrief: mood (1–5), session notes, duration, and streak. **No save-as-favorite CTA in M1** — FAV-01 adds the button and the behavior together in M2.

**Acceptance:**
- [ ] Mood and notes persist to the session row
- [ ] Copy follows earned-celebration voice — brief acknowledgment, straight to debrief
- [ ] Streak display reflects the minimal derivation from SES-01
- [ ] **Nothing on this screen is non-functional.** No disabled affordance, no "coming soon" — the same principle that killed the mock-workout fallback
- [ ] Only completed sessions reach this screen

### HIST-01 — History list + detail
**Layer:** ui · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** DATA-03, AUTH-03, DS-03
**Spec:** `specs/IA.md` — History and Session Detail screen contracts

Chronological history with rest days marked; detail view shows sections, exercises, logged sets, structure results, mood, and notes. Query layer built for reuse (HOME-01 consumes it).

**Acceptance:**
- [ ] Detail renders all six structure types with their logged outcomes
- [ ] Set logs display weight/reps/RPE per set
- [ ] List bounded/paginated; rest days visually distinct
- [ ] Queries exported from a shared module, not screen-local

### HOME-01 — Home screen v1
**Layer:** ui · **Milestone:** M1 · **Carry-over:** rebuild
**Depends on:** HIST-01, SES-01, GEN-03, DS-03
**Spec:** `specs/IA.md` — Home screen contract; all four states load-bearing

The daily entry point: Generate + Quick Start actions, recent 3 workouts, incomplete-session resumption prompt, 7-day week strip (rendering session data; full streak logic is HOME-02).

**Acceptance:**
- [ ] Incomplete session → resumption prompt → resumes execution at the right position
- [ ] Quick Start generates immediately using the last session's goal/anchor/intensity/location
- [ ] Quick Start is **hidden entirely until at least one completed workout exists** — never shown disabled, never shown falling back to defaults
- [ ] Recent 3 link to history detail
- [ ] Week strip renders workout/rest/upcoming states from data

---

## 11. M2 — Parity + planned near-term

The gate: the old app is fully retired. Everything it did, this does — plus the near-term specs (favorites v2) that were designed but never shipped.

### ONB-01 — Onboarding flow
**Layer:** ui · **Milestone:** M2 · **Carry-over:** rebuild
**Depends on:** AUTH-03, DS-04
**Spec:** `specs/screens/onboarding-wireframe.md`

Multi-step first-run: experience level, goal preset, location + equipment, section preferences, limitations — committed atomically via `complete_onboarding`. (M2 deliberately: DATA-02's dev-seeded profile makes the M1 loop usable first; onboarding is required before anyone else touches the app.)

**Acceptance:**
- [ ] New authenticated users are routed to onboarding until complete; onboarded users never see it (AUTH-03 guard)
- [ ] Commit is atomic — a failure leaves no partial profile or orphan location
- [ ] Every preference lands correctly in `profiles` + `locations` and feeds generation defaults
- [ ] Back-navigation preserves entered values

### FAV-01 — Favorites core
**Layer:** ui · **Milestone:** M2 · **Carry-over:** rebuild
**Depends on:** SUM-01, SES-01, HOME-01
**Spec:** `specs/favorites-v2.md` · `specs/DATA_MODEL.md` §11 snapshot versioning · `specs/IA.md`

Save a completed workout as a named template (snapshot), favorites tab on Home, one-tap restart that skips generation and lands in review with the snapshot. **Introduces the save-as-favorite CTA on the Summary screen** — the button and the behavior ship together.

**Acceptance:**
- [ ] Restart reproduces the workout exactly from `workout_snapshot` — no regeneration
- [ ] Completing a restarted favorite writes `saved_workout_completions` and bumps `times_completed`
- [ ] Favorites tab lists with anchor/intensity/duration metadata; unfavorite works
- [ ] Snapshot carries `snapshot_contract_version`, validated against the schema for **that** version before restore
- [ ] A favorite predating a breaking contract change surfaces a clear message rather than failing obscurely

### FAV-02 — Favorites v2: progression + personal bests
**Layer:** ui · **Milestone:** M2 · **Carry-over:** new
**Depends on:** FAV-01, EXE-04
**Spec:** `specs/favorites-v2.md`

Per the v2 spec: personal bests (min completion time for For Time, max rounds for AMRAP), "last time" weight display on repeats, completion history per favorite.

**Acceptance:**
- [ ] PB updates only when the new result beats the stored best; PB badge on the favorite
- [ ] Repeating a favorite pre-fills each exercise with last-completion weights
- [ ] Completion history lists date + headline result per run
- [ ] **Comparison surface across completions of the same favorite** — this run against previous runs, with the delta made obvious (time faster/slower, rounds up/down, weight moved). Each completion remains its own session; the card is the thread between them
- [ ] Comparison suppresses competitive framing during a deload (per OVR-04) — show the history, drop the "beat your time" language
- [ ] Spec'd v2 behaviors all present or explicitly deferred with a note

### HOME-02 — Streak engine + rest days
**Layer:** state · **Milestone:** M2 · **Carry-over:** rebuild
**Depends on:** HOME-01
**Spec:** `specs/DATA_MODEL.md` §5 — streak derived, never stored

Full streak rules as pure, tested functions: `counts_for_streak`, rest-day marking with reasons (rest/injury/sick), pause states (injury/sick/vacation), consecutive-rest limits, and the week strip's three states driven by real logic.

**Acceptance:**
- [ ] Streak rules implemented as pure functions with unit tests covering: continue, break, pause, resume, rest-day allowance
- [ ] Mark Rest Day works from Home with reason capture
- [ ] Week strip states (workout/rest/upcoming) match the engine's output
- [ ] **Extends** SES-01's minimal derivation rather than replacing it — one function, one source of truth, still never stored
- [ ] Adds pause states (injury/sick/vacation), rest-day allowances, and consecutive-rest limits on top of the M1 consecutive-day count
- [ ] Backdating or deleting a session changes the streak correctly with no repair step

### HOME-03 — Suggested anchor + intensity
**Layer:** state · **Milestone:** M2 · **Carry-over:** port
**Depends on:** HOME-01, GEN-04
**Spec:** `specs/DATA_MODEL.md` §3 — pattern-level staleness

Surface `suggest_session_focus` (least-recently-trained) plus an intensity suggestion from recent history; prefill the generation screen, dismissible.

**Acceptance:**
- [ ] Suggestion matches least-recent-focus logic against fixture history
- [ ] Pattern-level staleness available — *"no hinge in 11 days"*, not only *"no lower body"*
- [ ] Tapping the suggestion opens generation prefilled; dismissing it leaves defaults
- [ ] No suggestion shown with insufficient history (empty state, not a guess)

### SET-01 — Settings hub + preferences
**Layer:** ui · **Milestone:** M2 · **Carry-over:** rebuild
**Depends on:** AUTH-03, DS-04
**Spec:** `specs/IA.md` — Settings screen contract

Hub with: goal preset, enabled sections (structure customization), limitations text, **skin selection**, sign out.

> **The skin picker is a wrapper, not an implementation.** `skin.js` ships the whole persistence contract: `localStorage['clear.skin']` → `prefers-contrast: more` → the app default, with an explicit user choice always winning — including choosing a colour skin while the OS asks for more contrast. Read the skin list from `SKINS`; do not hardcode one.

**Acceptance:**
- [ ] Each change persists and is reflected in the next generation payload
- [ ] The picker lists every skin in `SKINS` — adding a skin to the export adds an option with no code change
- [ ] Selection calls `setSkin()`, flips live across every screen, and survives reload
- [ ] A "system" option calls `setSkin(null)`, restoring `prefers-contrast` following
- [ ] Mono is labelled **enhanced contrast**, never "accessible" — the other three are not less accessible
- [ ] The favicon matching the active skin is set (favicons cannot read tokens)
- [ ] Sign out clears caches and lands on Welcome
- [ ] Section toggles respect goal constraints (e.g. active recovery's fixed sections)
- [ ] **Every choice made during onboarding is editable here** — experience, goal, sections, limitations, locations, equipment. Onboarding is strictly first-run and is never re-entered

### SET-02 — Locations + equipment management
**Layer:** ui · **Milestone:** M2 · **Carry-over:** rebuild
**Depends on:** SET-01
**Spec:** `specs/IA.md` — Settings sub-views

Locations CRUD: add/edit/delete, tier selection (minimal/home/building/full), equipment list editing, set-default.

**Acceptance:**
- [ ] CRUD with optimistic updates and rollback on failure
- [ ] Default location feeds generation; deleting the default forces reassignment first
- [ ] Equipment edits appear in the next generation's constraints

### PWA-01 — Installable PWA
**Layer:** infra · **Milestone:** M2 · **Carry-over:** new
**Depends on:** ENV-03, DS-02
**Spec:** `specs/IA.md` §5 cross-cutting

Manifest, chamfered icon set, theme color, iOS meta, and a minimal service worker (app-shell caching only — no data offline; that's OFF-01/M3).

**Acceptance:**
- [ ] Lighthouse installability passes; add-to-home-screen works on iOS standalone (no Safari chrome)
- [ ] New deploys activate on next load — no stale-shell trap
- [ ] Service worker caches shell only; API responses are never cached

---

## 12. M3 — Planned medium-term

**Promoted — issue-ready.** The progressive-overload stub got its spec session (`specs/OVR-01_progressive-overload.md`, 2026-08-24) and is now four session-sized requirements, per that spec's own slice order. Unit ambiguity — the spec's "blocks everything" flag — is resolved by DATA-01: `weight_unit` per set log plus a profile default, in the baseline schema.

### OVR-01 — Load anchors + progression rules (standard sets)
**Layer:** state · **Milestone:** M3 · **Carry-over:** new
**Depends on:** EXE-02, REV-01
**Spec:** `specs/OVR-01_progressive-overload.md` (§1–2, §5, slice a)

e1RM load anchors computed from set logs; RPE-driven next-prescription rules; sparse/stale handling; weight suggestion with "why this number" on Review. The spec's ~80%-of-value slice.

**Acceptance:**
- [ ] `load_anchors` table recomputed on session completion — working sets only; active-recovery and deload sessions excluded
- [ ] Suggested weight = inverted anchor → rounded to equipment increment → clamped to 110% of the 8-week logged max
- [ ] The RPE rule table implemented as pure functions with unit tests covering every row (incl. overshoot and first-set ≥9)
- [ ] Sparse/stale ladder enforced: 0/1/2/3+ session confidence tiers; 3/6/12-week decay; >12 weeks discards the anchor
- [ ] Rep completion is **computed**, not parsed — a set log joins to its immutable prescription row for the prescribed target
- [ ] Review shows suggestion + session-count confidence + tappable "why this number" `Dialog`; per-session override never rewrites the anchor
- [ ] Bodyweight movements excluded from load anchors — rep progression only

### OVR-02 — Generation integration (prompt bump)
**Layer:** api · **Milestone:** M3 · **Carry-over:** new
**Depends on:** OVR-01, GEN-02
**Spec:** `specs/OVR-01_progressive-overload.md` (Generation Impact, slice b)

The AI never does arithmetic: code injects a TRAINING HISTORY block pre-generation, code fills suggested weights post-generation.

**Acceptance:**
- [ ] TRAINING HISTORY block injected (≤40 most-recent anchored exercises) with SESSION DIRECTIVE and CONDITIONING TREND
- [ ] Prompt forbids the model from computing weights; post-generation fill writes `weight_suggested`; model-narrated weights in cues are caught by validation
- [ ] `deload` / `re_entry` directives change set counts and cue language per spec
- [ ] Spec open-question 6 decided and recorded (anchor numbers in prompt vs labels-only) — implementation matches the decision
- [ ] `prompt_version` bumped; `contract_version` unchanged unless the output shape moves

### OVR-03 — Timed-format progression
**Layer:** ui · **Milestone:** M3 · **Carry-over:** new
**Depends on:** OVR-01, EXE-04
**Spec:** `specs/OVR-01_progressive-overload.md` (§3, slice c)

Normalized conditioning scores, like-for-like comparison only on identical repeats, and the density nudge for freshly generated conditioning.

**Acceptance:**
- [ ] Normalized score stored per timed section (reps/min for AMRAP + For Time, completion ratio for EMOM, rung for ladders)
- [ ] Comparison UI appears only on identical repeats (favorites); never across differently-generated pieces
- [ ] Density nudge (ready / hold / backing_off over last 3 conditioning sections at intensity ≥5) feeds generation
- [ ] Consumes the section-effort capture EXE-04 has been writing since M1

### OVR-04 — Deload detection + override
**Layer:** state · **Milestone:** M3 · **Carry-over:** new
**Depends on:** OVR-01, OVR-02, GEN-04
**Spec:** `specs/OVR-01_progressive-overload.md` (§4, slice d)

**In plain language:** the app notices when you have been grinding — same weights, everything feeling like a 9 or 10, reps starting to slip — and suggests taking a lighter week before you stall out or get hurt. A *deload* is that lighter week: same movements, ~15% less weight, ~40% fewer sets, capped effort. Not a rest day.

It is only ever a **suggestion**. A banner on the Generate screen says why ("your last 3 squat sessions stalled at RPE 9+"), and you either take it or dismiss it. It never quietly changes your workout — an app that reduces your weights without asking is one you stop trusting.

Six conditions can raise the suggestion: a lift stalling while feeling maximal, a lift going backward, everything feeling hard for a week straight, too many hard sessions with no easy ones, missed reps piling up, and a six-week calendar backstop.

**Acceptance:**
- [ ] Triggers D1–D6 implemented as pure tested functions; a single-lift stall suggests a deload for that movement only, whole-session signals suggest a full one
- [ ] Banner states the specific reason in one line; **Apply** clamps intensity and passes the directive to generation; **Not today** dismisses for 3 sessions and records the override
- [ ] Never auto-applies. Choosing a hard intensity on a flagged day confirms once, then does what you asked
- [ ] Deload sessions are tagged and excluded from load-anchor updates — a deliberately light day is not evidence you got weaker

### EXE-06 — Mid-workout exercise swap
**Layer:** ui · **Milestone:** M3 · **Carry-over:** new
**Depends on:** EXE-01, REV-02
**Spec:** `specs/DATA_MODEL.md` §4 lineage · `specs/generation/exercise-swap.md`

The rack is taken, the shoulder is complaining, the plan changes at minute 12. Same
append-and-supersede lineage REV-02 uses in review, applied during execution.

**No new schema.** The three-state model already separates prescribed from revised from
performed, and `slot_id` already threads a slot's history across substitutions.

**Acceptance:**
- [ ] Swapping mid-workout supersedes the active row and inserts the replacement in the same `slot_id`, with `replaces_id` set
- [ ] **Sets already logged stay attached to the superseded row** — the session reconstructs as "3×8 Deadlift, then switched to RDL", never as if the whole slot had always been RDL
- [ ] The swap candidate list respects the same equipment and limitation filters generation used, evaluated against the *current* location
- [ ] Undo restores the prior exercise and re-activates it; already-logged sets are untouched by the undo
- [ ] A swapped slot is excluded from load-anchor updates for the superseded exercise — you did not get weaker at deadlift, you stopped doing it

### Backlog stubs — resolved 2026-08-25

All eight stubs were worked through rather than carried. **Five cut, two promoted, one
folded.** The reasoning for each cut is recorded in `requirements/DEFERRED.md` so the same
idea does not return every three months without new evidence.

| ID | Scope | Outcome |
|---|---|---|
| EXE-06 | Mid-workout exercise swap | **Promoted → M3.** Not a research question: `slot_id` + `replaces_id` + `revision_status` is already the mechanism REV-02 uses. This is the same lineage at a different moment. |
| OFF-01 | Offline support — cache + sync | **Narrowed and promoted → EXE-07, M1.** Full offline sync is a project. The part that matters is that a logged set survives a dead signal — which is defect D7, not a feature. |
| ORM-01 | 1RM testing mode | **Cut.** OVR-01 already derives working weights from logged performance. A tested 1RM adds a second, competing source of truth for the same number, plus injury risk we have no professional to sign off. |
| REV-04 | Inline sets/reps editing before starting | **Cut, with a signal to watch.** The intensity slider is the sanctioned way to say "harder / easier". If users habitually want to edit reps, the generation is wrong and the fix is generation. |
| CHART-01 | Per-exercise progression charts | **Cut.** A chart visualizes a number OVR-01 already states outright, and a smooth curve would be the first non-CLEAR shape in the app. The honest answer to "am I progressing" is a delta in text. |
| HIST-02 | History retention/pruning policy | **Cut.** A scale problem for an app with no users. Nothing in the schema forecloses it — `created_at` and `superseded_at` are already there. |
| NAT-01 | Capacitor packaging / App Store | **Cut from the graph.** PWA-01 keeps the door open. Native distribution is a separate project with its own account, review process and build pipeline; carrying it as an issue implies a plan that does not exist. |
| LIB-01 | Coaching cues enrichment | **Folded into DATA-02.** Content work with no acceptance criteria and no fitness professional to author it. What the build actually needs is a floor: cues are nullable and every surface renders correctly when they are absent. |

**M3 rule, unchanged:** a stub becomes an issue only after its spec exists. The difference
is that the backlog no longer holds eight identical placeholders standing in for thinking
that had not been done.

---

## 13. Standing constraints (non-functional requirements)

These are not issues — they are review criteria on **every** issue, enforced by CI where mechanical and by review checklist where not.

**Performance.** Generation p50 ≤ 30s end-to-end with visible progress; hard ceiling 60s before a typed timeout error. Route transitions within motion rules (150–200ms). Initial JS bundle ≤ 300KB gzipped.

**Security.** RLS on every user table — verified in DATA-01 and re-verified when tables change. Only the anon key ships client-side; `ANTHROPIC_API_KEY` lives exclusively in Supabase secrets. No headers, tokens, or emails in any log line (CORE-02 is the mechanism; the constraint is universal). Every edge call authenticated.

**Data invariants.** Prescriptions are immutable; revisions carry lineage. Prescribed, revised, and performed stay independently reconstructable. A null actual means *not recorded* — never zero, never skipped. Execution attaches to the exercise actually performed. Later preference changes affect future generation only; history is immutable. Every generated workout records its prompt and contract version. Detail in `specs/DATA_MODEL.md` §1.

**Hard checks reject; soft checks record.** A validation rule that gates must be deterministic and must mirror a database constraint. A quality signal that cannot be enforced is recorded and surfaced, never used to reject — a soft rule that rejects is a hard rule with a soft name.

**Every view implements CORE-04.** Loading, empty, error, populated — all four, on every data-driven view. A view that can render nothing is an incomplete requirement, regardless of what its own acceptance criteria say.

**Quality.** TypeScript strict; no `any` at module boundaries. Zod validation at every I/O boundary — network, storage, AI output. Requirement acceptance criteria are the issue's definition of done; an issue closes only with its checklist checked and CI green.

**Design.** Token references only — a hardcoded hex, px spacing, or font name is a review-blocking defect. Chamfered corners, never rounded. Motion doctrine per DS-06. Every theme works on every screen.

**Voice.** Terse, imperative, gym-literate. Stenciled labels ("INT. 7"), earned celebration only, zero guilt/pressure/gamification language.

**Mobile-first.** ~80% of use is a phone at a gym. Every screen designed at mobile width first; desktop is the adaptation.

---

## 14. Traceability: requirement → issue → DAG

The contract that keeps the three artifacts identical:

**One requirement = one issue.** Title `[ID] Requirement title`; body = summary + Spec references + the acceptance checklist verbatim; labels = layer (`infra`/`data`/`api`/`state`/`ui`/`design`) ; GitHub Milestone = M0–M3.

**Dependencies are native.** Each `Depends on` ID becomes a GitHub `blocked-by` relation. Creation is two passes with `gh` (v2.94+): create all issues capturing ID→number, then wire relations with `gh issue edit --add-blocked-by`.

**The DAG is generated, never drawn.** `DAG.md` (Mermaid) is produced from `gh issue list --json` + dependency data. Regenerate any time; hand edits are meaningless because the next generation overwrites them.

**The ready queue is a search.** Anything open and not `is:blocked` is available to pick up. That is how work gets chosen — by graph state, not by scrolling.

**Source-of-truth handoff.** This document governs until issues are created. From that moment, GitHub is live truth and this file is the frozen baseline; scope changes happen on issues (and sub-issues for splits), not by editing history here.

**M3 rule.** Stubs are created as issues only after their spec exists; the spec doc gets linked in the issue body on creation.

---

*Draft 0.1 — written 2026-08-22. Review notes welcome; nothing here is source of truth until approved.*
