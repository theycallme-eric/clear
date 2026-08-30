# Agent playbook — how the graph directs the build

**This document is operational, not retrospective.** It is what an agent reads at the start
of a work session and what Eric reads to run the loop. It exists before the first line of
code because the graph is how work gets chosen — without it, an agent picks by scrolling,
which is the failure mode the whole DAG exists to prevent.

Companions: `docs/DAG.md` (the graph), `docs/requirements/REQUIREMENTS.md` (the frozen baseline),
`docs/github/README.md` (how the issues got there).

---

## 1. The loop

```
  python3 scripts/dag-ready.py                      ← verified + ranked ready queue
              │
              ▼
  pick one  ──────►  read: issue body → its Spec refs → PROJECT_MAP → ATOMIC (if UI)
              │
              ▼
  branch ──► build ──► every acceptance box checked ──► PR ──► CI green
              │
              ▼
  Eric reviews ──► merge ──► close ──► the queue refills itself
```

Nobody maintains a list of what to do next. **The queue is a search**, and it is correct by
construction — an issue appears in it exactly when everything it depends on has closed.

---

## 2. Picking work

```sh
python3 scripts/dag-ready.py
```

The frozen v0.7 graph started with exactly one issue, **ENV-01**, then released six after it closed.
Post-baseline follow-up issues may add ready process work; the live command, not a number in this
document, is authoritative. `docs/DAG.md` has the frozen product-graph shape.

The command cross-checks GitHub's native `is:open -is:blocked` result against dependency nodes with
only **open** blockers counted. This matters because GitHub's raw blocker total also includes closed
issues. It also marks a ready issue as in progress when an open PR closes it.

When several are available, it ranks them in order:

1. **Lower milestone first.** M0 before M1. The milestones are a real sequence, not a
   grouping — M1 assumes M0's foundation exists.
2. **Then highest fan-out.** `docs/DAG.md` § *Highest leverage* ranks issues by how many they
   unblock. Taking `DS-01` (10 dependents) before `ENV-05` (0) opens the graph faster.
3. **Then whatever is on the critical path.** `docs/DAG.md` names it. A delay anywhere else is
   absorbed by parallelism; a delay there costs calendar time directly.

**Never work an issue that is not in the ready queue.** If it looks ready but the queue
disagrees, the graph is right and the intuition is wrong — go read what it is blocked by.

---

## 3. What to read, in this order

An agent that reads too much wastes context; one that reads too little invents things that
already exist. The order is deliberate:

1. **The issue body and comments.** The acceptance checklist is the definition of done — not a
   suggestion or starting point. Comments can contain owner decisions made after the frozen
   baseline, so reading the body alone is insufficient.
2. **Its `Spec:` references.** Every spec lives in this workspace. Nothing points at the
   archived repo.
3. **`PROJECT_MAP.md`** — how the codebase is currently arranged. Read before writing a
   file, so the file lands where the project's conventions put it.
4. **`docs/specs/design/ATOMIC.md`** — for any UI issue, always. It lists every token,
   component, prop and icon that exists, plus the *only three* things that legitimately
   need building (`Card`, `Select`, `CollapsibleSection`). If an agent is about to write a
   component, ATOMIC.md decides whether it already ships.
5. **`docs/specs/IA.md`** — for a screen issue: route, guard, states, composition, atmosphere.

Do **not** read `docs/requirements/REQUIREMENTS.md` to work an issue. Once issues exist it is a
frozen baseline; the issue body already contains everything it said.

---

## 4. Working it

**One issue, one branch, one PR.** Branch named for the issue: `env-01-scaffold`,
`data-01a-catalog`. The PR body says `Closes #N`.

**Stay inside the issue's scope.** If a change is needed that the acceptance criteria do not
describe, that is a different issue — see §6. Fixing something adjacent "while we're here"
is how a 71-node graph becomes untrue.

**Update `PROJECT_MAP.md` when the architecture changes** — a new directory, a new
boundary, a new data-flow. Not for every file.

**Every UI issue implements all four CORE-04 states.** Loading, empty, error, populated. A
view that can render nothing is incomplete regardless of what its own criteria say — this is
a standing constraint, so it applies whether or not the issue repeats it.

---

## 5. Done

An issue closes when **every box is checked and CI is green.** Both. A checked box with red
CI is not done; green CI with unchecked boxes means the criteria were not the criteria.

CI enforces the mechanical half on its own:

| Gate | Catches |
|---|---|
| `tsc --noEmit` | type errors |
| oxlint + `_adherence.oxlintrc.json` (**DS-08**) | hardcoded hex, raw px, non-system fonts, unknown component props, out-of-range variants, importing component internals |
| `console.*` grep (**CORE-02**) | the D3 token-leak class of bug |
| `axe-core` in the E2E suite (**CORE-05**) | roughly a third of real accessibility problems |
| `gen-issues.py --check` (**ENV-02**) | a requirements graph that has drifted from the docs |
| RLS suite (**ENV-07**) | user A reading user B's rows |

That leaves review for what a machine cannot check: does it do the thing, and does it feel
like CLEAR.

---

## 6. When the requirement is wrong

It will happen. A requirement will be incomplete, contradict another, or describe something
that turns out to be a bad idea once it is real. **This is expected and it is useful
information** — it is not a reason to improvise.

**Do:** stop, comment on the issue with what is wrong and what you would do instead, and
move to the next ready issue. Nothing else is blocked while it waits.

**Do not:** widen the scope to cover the gap. Do not edit `docs/requirements/REQUIREMENTS.md`.
Do not close the issue partially done. Do not add a dependency by writing code that needs
another issue's output — if that happens, the graph is wrong, and *that* is the finding.

Eric decides: amend the issue, cut a new one, or close it as not-needed. Amending an issue
is cheap. Discovering three weeks later that four agents each guessed differently is not.

---

## 7. Parallel agents

The graph guarantees **dependency** order. It does not guarantee **file** disjointness —
two ready issues can touch the same file, and the graph has no opinion about that.

- One issue per agent. Synchronize at the start **and again immediately before final verification**.
  Rebase only unpublished work; merge current `main` into a pushed/open PR branch and never
  force-push. CI is the arbiter only after it runs on that synchronized final tree.
- Issues in the same trunk collide more often than issues across trunks. Wave 3 offers
  thirteen issues across five layers — spreading agents across `DS-*`, `DATA-*`, `CORE-*`
  and `ENV-*` collides far less than putting three agents on `DS-*`.
- A merge conflict is normal. **A conflict that cannot be resolved without changing the
  other issue's behaviour is a graph error** — report it (§6) rather than picking a winner.
- Journals, status files, and project maps are coordination hotspots. Dependency-independent PRs may
  still conflict there. When one such PR merges, resynchronize every remaining PR that touched the
  same file, preserve both histories, rerun its acceptance checks, and watch its new GitHub checks to
  a terminal result before calling it ready.

---

## 8. Eric's review

Two things a machine cannot check.

**Does it do the thing.** Walk the acceptance criteria. They were written to be checkable —
if one cannot be checked by looking, it was written badly and that is worth saying.

**Does it feel like CLEAR.** Design-system *compliance* is mechanical now (DS-08 fails the
build on a raw hex). What is left is judgement: pacing, density, whether the motion reads as
mechanical or decorative, whether the copy sounds like a training partner or a product.

**Screens get approved rendered, not drawn.** `/dev/gallery` is the review surface — the
export's 38 specimen cards plus every app-composed part, with live skin and atmosphere
switching. Review the running thing.

---

## 9. Keeping the graph true

```sh
python3 scripts/gen-issues.py     # regenerate the issue scripts and bodies + validate
python3 scripts/gen-dag.py        # regenerate docs/DAG.md from the requirements
python3 scripts/gen-dag.py --live # …with open/closed overlaid from gh
```

`gen-issues.py --check` runs in CI, so a dangling dependency or a cycle fails the build the
same way a type error does.

**Before issues exist,** `docs/requirements/REQUIREMENTS.md` is the source of truth and the
scripts are generated from it. **After issues exist,** GitHub is live truth and the
requirements file is the frozen baseline. Scope changes happen on issues.

That handoff is the one moment to be careful about: once `02-create-issues.sh` has run,
editing a requirement and regenerating does **not** update the issues that already exist.
Change the issue.

---

## 10. Keep a process journal

Material work sessions append to `docs/journal/YYYY-MM-DD.md`. The journal is the reviewable
record of how the build happened; commits and issue comments show *what* changed but usually
lose the failed attempts and course corrections that explain *why*.

Record:

- the intended outcome and the issue/branch involved;
- what changed locally and what changed on GitHub or another external service;
- failures, misleading signals, and the actual cause;
- corrections made, including any script or process change that prevents a repeat;
- verification performed and its exact result;
- unresolved questions, assumptions, and the next safe action.

Keep secrets, one-time codes, tokens, email contents, and personal data out of the journal.
Prefer facts over a minute-by-minute transcript. When a verification method is wrong, record
the bad reading and the corrected method so a later agent does not repeat it.
