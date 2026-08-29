# Issue creation — CLEAR rebuild

Turns `docs/requirements/REQUIREMENTS.md` into **71 GitHub issues** with **136 native dependency
relationships**. Nothing in this folder is hand-maintained.

```
docs/requirements/REQUIREMENTS.md      ← the only thing you edit
        │
        │  scripts/gen-issues.py
        ▼
docs/github/02-create-issues.sh        71 create calls
docs/github/03-wire-dependencies.sh    136 blocked-by relations
docs/github/bodies/*.md                71 issue bodies
```

Edit a requirement, re-run the generator, re-run the scripts. Editing a script or a body by
hand is meaningless — the next generation overwrites it.

---

## Before you start

**1. `gh` version 2.94.0 or newer.** The dependency flags are new.

```sh
brew install gh          # or: brew upgrade gh
gh --version
gh auth login            # if you haven't
```

**2. Create the repo.**

```sh
gh repo create theycallme-eric/clear --private \
  --description "CLEAR — AI workout generator"
```

Use whatever name you prefer; pass the same `owner/repo` to all three scripts.

---

## Run

```sh
cd ../..                                         # repository root
python3 scripts/gen-issues.py                    # regenerate + validate the graph
cd docs/github
./01-setup-repo.sh        theycallme-eric/clear  # labels + milestones
./02-create-issues.sh     theycallme-eric/clear  # 71 issues → issue-map.txt
./03-wire-dependencies.sh theycallme-eric/clear  # 136 blocked-by links
```

Roughly three minutes, mostly API round-trips. All three scripts are re-runnable: `02` skips
anything already in `issue-map.txt`, `03` re-asserts relations that already exist.

`issue-map.txt` is gitignored — it maps requirement ID → issue number for this specific repo,
and it is what makes re-running safe. Delete it only if you are pointing the scripts at a
different repository.

---

## Afterwards

**The ready queue is a search, not a list someone maintains:**

```sh
gh issue list --search "is:open -is:blocked"
```

At the start that returns exactly one issue — **ENV-01**, the single root of the graph.
Everything else is waiting on something, and as issues close the queue refills itself.

**The graph, before you create anything:**

```
71 requirements → 136 edges, no cycles
  M0 28 · M1 28 · M2 8 · M3 7
  ready queue: ENV-01
  widest fan-in:  SES-01a (4 dependencies)
  widest fan-out: ENV-01 (12 dependents)
```

`gen-issues.py --check` prints that without writing anything and exits non-zero if the graph
has a cycle or a dependency on a requirement that does not exist. That is the CI check.

---

## Sub-requirements

Six requirements were split because their parts had disjoint dependents — `DATA-01a…d`,
`GEN-02a…c`, `SES-01a…c`, `EXE-04a…c`, `OVR-01a…c`, `DS-04a…c`.

They are created as **peer issues, not GitHub sub-issues.** A parent tracking issue carries no
acceptance criteria, so it never closes on its own and would show up in the ready-queue search
as work that is not work. The shared context and any criteria that apply across a family are
copied into each child's body by the generator, so nothing is lost by dropping the hierarchy.

If you later want the rollup view in Projects, the parents can be added as tracking issues
without touching the dependency edges — the edges are what the graph runs on.
