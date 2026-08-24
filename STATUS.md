# Open Threads

Living doc. Updated when a thread opens, moves, or closes.
**Owner** is who the thread is actually waiting on — not who cares about it.

---

## Blocking the critical path

### 1. Requirements — **APPROVED** (v0.3, 2026-08-24)
All 51 reviewed. The six sent with notes were the only ones with issues; the rest were approved.
All six are addressed in v0.3.

**Expected to change**, and that's fine — approval is a checkpoint, not a freeze:
- IA work (below) may add `Screen:` references and adjust UI requirements
- The schema pass will rewrite DATA-01…03
- The incoming generation review is expected to have **large impact** on the schema and GEN-*

### 2. Database model + generation contract — **DONE** (2026-08-24)
`specs/DATA_MODEL.md` and `specs/generation/GENERATION_CONTRACT.md`.
Change set v0.4 rev 3 agreed after two outside review rounds.

**Not yet applied to REQUIREMENTS.md.** The change set and both specs describe changes; the
requirements file is still v0.3.1. Folding v0.4 in is the next step and must happen before tickets
are cut, or the issues will encode the pre-change design.

### 2b. Historical note — schema pass origin
Eric expects the ChatGPT generation review to land with **large schema impact**, and is building
systems around preserving generation quality. Sequencing note: start the pass, treat those findings
as a first-class input rather than a later revision.

**Standing instruction from Eric:** while in the schema, revisit the **stubbed M3 requirements** too
— if any need changing, now is the cheap moment, before anything is built on them.

DATA-01 is the root of the dependency graph and currently reads "port the old schema's end state,"
which is the most old-work-dependent requirement in the doc. Real findings already: `reps` is TEXT
holding four data types, `anchor_type` mixes three taxonomies, streak is six columns of stored
derived state, TEXT where the schema's own conventions use enums.
**Nothing blocks this.** Deliverable: `specs/DATA_MODEL.md`, same treatment OVR-01 got.

---

## Waiting on the outside world

### 3. Claude Design export — **Eric** · not yet sent
Gates DS-01, DS-02, DS-06, GEN-05 — and the atomic component inventory (below).
`./scripts/import-design.sh <zip>` is ready: unpacks, diffs against the last export, shows
token-level changes.

### 4. Generation system review — **third-party LLM** · packet delivered
`specs/generation/GENERATION_REVIEW_PACKET.md` — self-contained, no attachments needed.
Optional sharpener: `scripts/export-sample-workouts.sql` pulls 3 real workouts from Supabase.
Findings may touch the schema — treat as additive revision, don't wait on it.

---

## Queued, correctly not started

### 5. IA / interaction diagram — **DONE** (2026-08-24)
`specs/IA.md` + [navigable reference](https://claude.ai/code/artifact/77f48f0e-dd76-401b-8a6c-a2fa8485a774).
14 screens with route, guard, entry/exit, CORE-04 states, component tree, owning requirements.
Establishes the **component vocabulary** and the rule: anything not in it is a new DS requirement,
never an inline one-off. Five open questions at the end need Eric's answers.

### 6. Atomic component inventory — **Claude** · gated on the design export
The component vocabulary with variants, states, and token bindings. Prevents agents inventing
one-off UI per interaction.
**Deliberately gated** — same reason DS-01/02/06 are. Building it against soon-to-change tokens
means building it twice. `specs/design/ui-component-spec.md` (331 lines, from project knowledge)
is the starting material.

### 7. DAG playbook + review-process doc — **Claude** · deferred by design
The method isn't finished being invented — no tickets cut, no build session run. Written now it
documents predictions; written after the first pass it documents what happened.
`journal/` is collecting the raw material.

### 8. GitHub — **Eric** · ready to run
Requirements are approved at v0.4 and the issue scripts are generated and dry-run tested.

```sh
gh repo create theycallme-eric/clear --private --description "CLEAR — AI workout generator"
cd github
./01-setup-repo.sh       theycallme-eric/clear
./02-create-issues.sh    theycallme-eric/clear
./03-wire-dependencies.sh theycallme-eric/clear
```

Needs `gh` 2.94.0+ for the dependency flags. Produces 53 issues, 11 labels, 4 milestones,
102 native blocked-by relationships. All three scripts are re-runnable.

Ready queue afterward: `gh issue list --search "is:open -is:blocked"` — one issue at the
start, **ENV-01**, the single root of the graph.

Decided: this workspace becomes the repo's `docs/`.

---

## Small, has ongoing cost

### 9. Project knowledge cleanup — **Eric** · not started
`process/PROJECT_CLEANUP.md` has the checklist. **This one degrades every future session** while
it sits: the project instructions still say Antigravity builds the app, the stack is Tailwind, and
Figma is the design source of truth. All three are wrong, and every new conversation inherits them.

### 10. `_to_delete/` on disk — **Eric** · one folder to delete
`~/Documents/Projects/Clear/_to_delete/` — emptied, renamed, safe to remove.

---

## Closed

- **Coworker's DAG viewer (Issue Atlas)** — read-only GraphQL viewer over native GitHub
  dependencies. Confirms the architecture; our graph fits inside its limits.
- **Old-repo independence** — 21 specs copied into `specs/`, mojibake repaired, zero references
  to `clear-app` remain. Only external read left is the exercise library data export.
- **Review-tool copy failure** — clipboard is blocked in the artifact sandbox; now falls back to a
  selectable text box that can't fail.
- **GitHub access confusion** — `api.github.com` is intercepted wholesale in this container
  (public repos fail identically). Not a permissions issue, not fixable with a token.

---

## Recommended order

1. ~~IA diagram~~ — **done**
2. **Generation review lands** (Eric → Claude) — expected to reshape the schema and GEN-*
3. **Schema pass** (Claude) — folding in those findings; also revisits the M3 stubs
4. **Design export arrives** → DS gates lift → atomic component inventory
5. **Requirements v1.0** → GitHub → issues → DAG
