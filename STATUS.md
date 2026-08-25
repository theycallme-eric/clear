# Open Threads

Living doc. Updated when a thread opens, moves, or closes.
**Owner** is who the thread is actually waiting on — not who cares about it.

---

## Blocking the critical path

### 1. Requirements — **v0.5.0** (2026-08-25)
**55 requirements.** v0.5 folds in the design system: §9 rewritten, GEN-05 and SET-01 rescoped,
D7 registered, the eight backlog stubs resolved. `requirements/DEFERRED.md` records what was cut
and the specific signal that would reopen each one.

**Approved at v0.3** (2026-08-24) —
All 51 reviewed. The six sent with notes were the only ones with issues; the rest were approved.
All six are addressed in v0.3.

**Expected to change**, and that's fine — approval is a checkpoint, not a freeze:
- IA work (below) may add `Screen:` references and adjust UI requirements
- The schema pass will rewrite DATA-01…03
- The incoming generation review is expected to have **large impact** on the schema and GEN-*

### 2. Database model + generation contract — **DONE** (2026-08-24)
`specs/DATA_MODEL.md` and `specs/generation/GENERATION_CONTRACT.md`.
Change set v0.4 rev 3 agreed after two outside review rounds.

**Folded into REQUIREMENTS.md** at v0.4 and carried through v0.5.

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

### 3. Claude Design export — **LANDED** (v0.5.0, 2026-08-25) · **CLOSED**
Reviewed and folded in. It is not a token export — it is a complete component library:
18 React exports with typed props, 75 icons, four skins, a three-level atmosphere axis, a full
motion vocabulary, measured contrast across 64 pairs, and a lint config that mechanises
design-system compliance.

**It shipped more than the DS trunk proposed to build.** DS-03 is deleted outright, DS-01/02/05/06
are rescoped from *build* to *integrate*, DS-07 shrinks to serving 38 cards that already exist, and
DS-08 (the adherence gate) is new work the export made possible. Net: 7 DS tickets → 7, but the
critical path through them collapses — `DS-01→02→03→04` becomes a fan-out from DS-01.

Substrate contract: `specs/design/ATOMIC.md`. Read it before any DS or UI ticket.

**Both open decisions taken** (2026-08-25) — recorded in ATOMIC.md §12:
1. **No bottom sheets.** Every overlay is a `Dialog`, on native `<dialog>` so focus trap, Esc and
   inertness are the platform's. The arrival a sheet would have given comes from the motion
   vocabulary instead — trace on, materialize, hard-cut backdrop. `Dialog` ships with **no**
   entrance motion, so composing it is real work and now sits in DS-05.
2. **Fonts self-hosted**, on the render path, not offline. Four nested render-blocking hops
   become one, via three Fontsource packages and an app-owned skin file — which is the export's
   own documented path for a product ("a second app replaces THIS FILE ONLY").

### 4. Generation system review — **DONE** · folded in
`specs/generation/GENERATION_REVIEW_PACKET.md` went out; two review rounds came back. The useful
findings are in `GENERATION_CONTRACT.md` rev 2 and `DATA_MODEL.md` rev 2. The reductions that came
out of it — duration engine → plausibility guardrail, 11 metadata attributes → 0, six-dimensional
intensity profile → ownership model — are the reason those specs are shorter than the review asked
for, not longer.

---

## Queued, correctly not started

### 5. IA / interaction diagram — **DONE** (2026-08-24)
`specs/IA.md` + [navigable reference](https://claude.ai/code/artifact/77f48f0e-dd76-401b-8a6c-a2fa8485a774).
14 screens with route, guard, entry/exit, CORE-04 states, component tree, owning requirements.
Establishes the **component vocabulary** and the rule: anything not in it is a new DS requirement,
never an inline one-off. Five open questions at the end need Eric's answers.

### 6. Atomic component inventory (`specs/design/ATOMIC.md`) — **DONE** (2026-08-25)
433 lines. Provenance and version pin · the three-layer architecture · role slots, ramps and the
alpha ladder · 332 tokens by kind · all 18 components with real prop APIs · the 75-glyph set ·
`data-skin` and `data-atmosphere` · the motion vocabulary · inherited accessibility guarantees ·
the seven workflow patterns · **the three gaps the export does not cover** (Card, Select,
CollapsibleSection) · the adherence gate · 14 non-negotiables · 3 defects found in 0.5.0.

### 7. DAG playbook + review-process doc — **Claude** · deferred by design
The method isn't finished being invented — no tickets cut, no build session run. Written now it
documents predictions; written after the first pass it documents what happened.
`journal/` is collecting the raw material.

### 8. GitHub — **Eric** · ready to run
Requirements are approved at v0.4 and the issue scripts are generated and dry-run tested.

**The design-export gate is lifted** — no requirement carries `blocked:design-export` any more.
Every DS body has been regenerated against v0.5.0, the eight backlog stubs are resolved (five cut,
two promoted, one folded), and no requirement is waiting on a decision.
Issues regenerate from requirements, so a future export means regenerating bodies, not rewriting
tickets by hand.

```sh
gh repo create theycallme-eric/clear --private --description "CLEAR — AI workout generator"
cd github
./01-setup-repo.sh       theycallme-eric/clear
./02-create-issues.sh    theycallme-eric/clear
./03-wire-dependencies.sh theycallme-eric/clear
```

Needs `gh` 2.94.0+ for the dependency flags. Produces **55 issues**, 11 labels, 4 milestones,
**105** native blocked-by relationships. All three scripts are re-runnable.

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
2. ~~Generation review~~ — **done**, folded into the contract spec
3. ~~Schema pass~~ — **done** (`specs/DATA_MODEL.md` rev 2)
4. ~~Design export → DS gates lift → ATOMIC.md~~ — **done** (2026-08-25)
5. ~~Two DS decisions~~ — **done** (2026-08-25): no sheets, fonts self-hosted
6. **Remaining requirements work** (Claude) — the test-architecture requirement in M0,
   accessibility acceptance criteria (now unblocked), and splitting the six oversized
   requirements into sub-issues: DATA-01, GEN-02, SES-01, EXE-04, OVR-01, **DS-04**
7. **Requirements v1.0** → GitHub → issues → DAG
