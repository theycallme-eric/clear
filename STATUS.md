# Open Threads

Living doc. Updated when a thread opens, moves, or closes.
**Owner** is who the thread is actually waiting on — not who cares about it.

---

## Blocking the critical path

### 0. ⚠️ FOUR GAPS — close these BEFORE cutting issues
Found by a readiness audit on 2026-08-25, after everything below was already done.

**Order matters and it is the opposite of the obvious one.** Once `02-create-issues.sh` runs,
GitHub is live truth and REQUIREMENTS.md freezes (§14). Closing these afterwards means
hand-editing issues on GitHub; closing them first means regenerating from one source. Nothing
here needs the build to have started.

**1 · The screen designs exist and the build has been told to ignore them.** *(cheapest, biggest risk)*
`ui_kits/app/` in the design system is a working, pixel-faithful recreation of **six screens** —
Boot, Home, Generate, Workout Ready, Active Workout, Debrief — 868 lines of real JSX. ATOMIC.md
calls it *"a worked example, not a library surface,"* which an agent reads as *do not look here*.
An agent building HOME-01 would compose from primitives without knowing a designed Home exists.
**Fix:** a `Visual reference:` line on every IA screen contract naming its kit screen or template,
and ATOMIC.md corrected. The six screens with no direct kit equivalent are all recombinations —
OTP Login and Settings from `templates/form-screen`, History from Home's card list + TabBar,
Session Detail from Review's section cards, Not Found from `EmptyState`.

**2 · The v4.1 generation prompt does not exist.** *(highest quality risk)*
`specs/generation/generation-prompt-v3-notes.md` holds ~350 lines of real system prompt — section
templates by goal, rest ranges, set counts, superset pairing, warm-up progression, pattern
balancing. That is the accumulated thinking about what makes a good workout, and it is still
correct. But its **architecture** is superseded: v4.1 pre-resolves candidates, drops the library
dump, and has Claude return no names. Nobody has written that down, so GEN-02b's agent either
reinvents the composition rules or ports v3 wholesale and drags the library dump back in.
**Fix:** author `specs/generation/PROMPT_v4.md` — v3's composition rules on the v4.1 architecture.

**3 · Motion choreography is unmapped.**
`motion.css` has the vocabulary, ATOMIC.md §8 documents it, DS-06 assigns atmosphere per screen.
But nothing says which effect fires where — whether the Home card list boot-staggers, whether
route changes use `.route-enter-*`, whether the timer tumbles every second or only on change.
**Fix:** a `Motion:` line beside `Atmosphere:` in each IA screen contract.

**4 · No worked example.** The schema and contract are abstract end to end.
**Fix:** trace one workout: request → candidates → what Claude returns → the rows written →
what each of the three reconstructions gives back.

**Also open:** whether the two promoted stubs (EXE-06, EXE-07) want real specs rather than
requirement-level acceptance criteria. Eric to say.

**What the audit found clean:** all 62 file references across REQUIREMENTS / IA / ATOMIC /
playbook / CLAUDE.md resolve (only `PROJECT_MAP.md` is absent, and ENV-01 creates it) · the schema
is 575 lines of real DDL, not a sketch · the eight backlog stubs were genuinely worked through —
see `requirements/DEFERRED.md`.

### 1. Requirements — **v0.6** (2026-08-25)
**71 requirements, 136 edges, no cycles.** v0.5 folded in the design system; v0.6 closed the three
gaps the outside review found:

- **Sizing.** Six oversized requirements split — DATA-01 by schema domain, GEN-02 by pipeline stage,
  SES-01 by lifecycle / reconstruction / streak, EXE-04 by structure type, OVR-01 by anchors / rules
  / surface, DS-04 by control. Each split names the dependent it unblocks; none was made for tidiness.
- **Test architecture.** ENV-06 (component harness) and ENV-07 (E2E on mobile viewports, test-user
  provisioning without an inbox, seed/reset, RLS as a standing test rather than a one-time check).
- **Accessibility.** CORE-05 carries the cross-screen mechanisms the design system cannot know about —
  route-change focus, skip link, heading outline, form-error focus, reduced-motion end states — plus a
  standing review constraint on every UI issue.

`requirements/DEFERRED.md` records what was cut and the signal that would reopen each one.

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

### 7. DAG playbook — **DONE** (2026-08-25)
`process/AGENT_PLAYBOOK.md` + `DAG.md` + `scripts/gen-dag.py`.

**Corrected a misfiling.** This was parked as retrospective method documentation — "written now
it documents predictions." That was wrong about what it is. The DAG is what *directs* the agents,
so the playbook is an operational artifact and has to exist before the build, not after it.

The playbook covers: how the ready queue picks work and how to tie-break (milestone → fan-out →
critical path), what an agent reads and in what order, one-issue-one-branch scope discipline, what
CI enforces vs what Eric reviews, **what to do when a requirement turns out to be wrong** (comment
and move on — never widen scope, never edit the frozen baseline), and how parallel agents avoid
collisions the graph has no opinion about.

`DAG.md` is generated and works **before** GitHub exists: critical path (15 steps), the wave shape
(1 → 6 → 13 → …), highest-leverage ranking, and a per-milestone Mermaid graph coloured by layer.
`--live` overlays open/closed from `gh` once issues are cut.

ENV-01 now also seeds `PROJECT_MAP.md` — the playbook has agents read it from issue two onward, so
it cannot not exist.

### 8. GitHub — **Eric** · scripts ready, but WAIT for thread 0
**Do not run these yet.** The scripts work and the graph validates; the reason to wait is the
source-of-truth handoff, not a defect. Closing the four gaps first is a regeneration; closing them
after is 71 hand-edits.
Requirements are approved at v0.4 and the issue scripts are generated and dry-run tested.

**The design-export gate is lifted** — no requirement carries `blocked:design-export` any more.
Every DS body has been regenerated against v0.5.0, the eight backlog stubs are resolved (five cut,
two promoted, one folded), and no requirement is waiting on a decision.
Issues regenerate from requirements, so a future export means regenerating bodies, not rewriting
tickets by hand.

```sh
gh repo create theycallme-eric/clear --private --description "CLEAR — AI workout generator"
python3 scripts/gen-issues.py            # regenerate + validate
cd github
./01-setup-repo.sh       theycallme-eric/clear
./02-create-issues.sh    theycallme-eric/clear
./03-wire-dependencies.sh theycallme-eric/clear
```

Needs `gh` 2.94.0+ for the dependency flags. Produces **71 issues**, 11 labels, 4 milestones,
**136** native blocked-by relationships. All three scripts are re-runnable.

**The scripts are now generated.** `scripts/gen-issues.py` parses REQUIREMENTS.md and emits both
scripts plus all 71 bodies, and validates the graph on the way through — unknown dependencies,
cycles, ready queue, widest fan-in and fan-out. `--check` is the CI form. Editing a script or a body
by hand no longer means anything; edit the requirement.

Ready queue afterward: `gh issue list --search "is:open -is:blocked"` — one issue at the
start, **ENV-01**, the single root of the graph.

Decided: this workspace becomes the repo's `docs/`.

---

## Small, has ongoing cost

### 9. Project knowledge cleanup — **Eric** · not started
`process/PROJECT_CLEANUP.md` has the checklist. **This one degrades every future session** while
it sits: the project instructions still say Antigravity builds the app, the stack is Tailwind, and
Figma is the design source of truth. All three are wrong, and every new conversation inherits them.

### 10. `git` lock stuck in this repo — **Eric** · one command
`.git/index.lock` regenerates on every commit and the Cowork sandbox cannot delete files, so
Claude can no longer commit here. `CLAUDE.md` and this update are on disk but **uncommitted**.

```sh
cd ~/Documents/Projects/clear-rebuild
rm -f .git/index.lock
rm -rf .git/_stale
git add -A && git commit -m "CLAUDE.md, readiness audit, journal"
```

### 11. `_to_delete/` on disk — **Eric** · one folder to delete
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
6. ~~Remaining requirements work~~ — **done** (2026-08-25): ENV-06/07, CORE-05, six splits
7. **Close the four gaps** (Claude) — see thread 0. `gh` is NOT next.
8. **GitHub** (Eric) — the three scripts, once the gaps are closed.
