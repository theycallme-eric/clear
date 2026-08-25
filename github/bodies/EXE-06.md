> **EXE-06** · Layer `ui` · Milestone `M3` · Carry-over `new`

**Spec:** `specs/DATA_MODEL.md` §4 lineage · `specs/generation/exercise-swap.md`

The rack is taken, the shoulder is complaining, the plan changes at minute 12. Same
append-and-supersede lineage REV-02 uses in review, applied during execution.

**No new schema.** The three-state model already separates prescribed from revised from
performed, and `slot_id` already threads a slot's history across substitutions.

## Acceptance
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

**Accessibility.** The component layer is guaranteed by the design system (`specs/design/ATOMIC.md` §9) and the cross-screen mechanisms by CORE-05. What remains is a review criterion on every UI issue, and it is not negotiable by deadline:

- The screen is operable **keyboard-only**, in a sensible order, with focus visible at every stop.
- Nothing conveys meaning by colour alone — selection carries a tick, severity carries a glyph, state carries text.
- Every control has an accessible name that says what it does, not what it looks like.
- `axe-core` passes. It catches about a third of real problems; passing it is the floor.
- Anything announced is announced at the right volume — only failure is assertive.

**Mobile-first.** ~80% of use is a phone at a gym. Every screen designed at mobile width first; desktop is the adaptation. Test suites default to a mobile viewport (ENV-07); a desktop-only suite is testing the minority case.

---

## 14. Traceability: requirement → issue → DAG

The contract that keeps the three artifacts identical:

**One requirement = one issue.** Title `[ID] Requirement title`; body = summary + Spec references + the acceptance checklist verbatim; labels = layer (`infra`/`data`/`api`/`state`/`ui`/`design`); GitHub Milestone = M0–M3.

**The issue scripts are generated, not written.** `scripts/gen-issues.py` parses this file and emits `github/02-create-issues.sh`, `github/03-wire-dependencies.sh`, and every `github/bodies/*.md`. It also validates the graph — unknown dependencies, cycles, the ready queue, widest fan-in and fan-out — and names body files whose requirement no longer exists. Run it after any edit here; `--check` validates without writing and exits non-zero on failure, which is what CI runs.

**Dependencies are native.** Each `Depends on` ID becomes a GitHub `blocked-by` relation. Creation is two passes with `gh` (v2.94+): create all issues capturing ID→number, then wire relations with `gh issue edit --add-blocked-by`.

**The DAG is generated, never drawn.** `DAG.md` (Mermaid) is produced from `gh issue list --json` + dependency data. Regenerate any time; hand edits are meaningless because the next generation overwrites them.

**The ready queue is a search.** Anything open and not `is:blocked` is available to pick up. That is how work gets chosen — by graph state, not by scrolling.

**Source-of-truth handoff.** This document governs until issues are created. From that moment, GitHub is live truth and this file is the frozen baseline; scope changes happen on issues, not by editing history here.

**M3 rule.** Stubs are created as issues only after their spec exists; the spec doc gets linked in the issue body on creation.

---

*Draft 0.1 — written 2026-08-22. Review notes welcome; nothing here is source of truth until approved.*

---

**Depends on:** EXE-01, REV-02
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
