# Issue creation — CLEAR rebuild

Turns `requirements/REQUIREMENTS.md` v0.4 into 61 GitHub issues with 102 native
dependency relationships — 53 buildable requirements plus 8 backlog stubs.

Nothing here touches your machine's state beyond `gh`. Every script is safe to re-run.

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
./01-setup-repo.sh  theycallme-eric/clear    # labels + milestones
./02-create-issues.sh theycallme-eric/clear  # 53 issues → issue-map.txt
./03-wire-dependencies.sh theycallme-eric/clear  # 102 blocked-by links
```

Roughly two minutes total, mostly API round-trips.

---

## What you get

**53 buildable issues**, titled `[ENV-01] Repository scaffold`, each carrying its summary,
spec reference, and full acceptance checklist.

**8 backlog stubs** labeled `needs-spec` — 1RM mode, mid-workout swap, inline editing,
progression charts, offline, cues enrichment, retention, Capacitor. They carry no acceptance
criteria because none exist yet; each needs a spec session first. They live in GitHub so future
work isn't stranded in a markdown file nobody opens.

**12 labels** — `layer:infra|data|api|state|ui|design`, `carry:new|rebuild|port|keep`,
`blocked:design-export` on the four requirements waiting on the Claude Design export, and
`needs-spec` on the backlog stubs.

**4 milestones** — M0 Foundation, M1 Core loop, M2 Parity, M3 Progressive overload.

**102 dependencies** as native `blocked-by` relationships — which is what makes the ready
queue work:

```sh
gh issue list --search "is:open -is:blocked"
```

Anything that returns is available to pick up right now. At the start that's exactly one
issue: **ENV-01**, the single root of the graph.

---

## If something goes wrong

**Script 2 stops partway.** `issue-map.txt` records what was created. Re-run it — anything
already mapped is skipped.

**Every dependency fails in script 3.** Your `gh` predates `--add-blocked-by`. Upgrade and
re-run; the script is idempotent and GitHub ignores duplicate relationships.

**A few dependencies fail.** The script reports which and keeps going. Re-run after fixing.

**Starting over.** Delete `issue-map.txt` and close the issues — but note that re-running
script 2 with a deleted map creates duplicates, since it has no other way to know.

---

## After

Point [Issue Atlas](https://ccheney.github.io/github-issue-dag-viewer/) at the repo with a
fine-grained token scoped to Issues: read-only. It renders the dependency graph, the ready
queue, and the critical path.

The issues are generated *from* the requirements. If something needs to change, change
`requirements/REQUIREMENTS.md` and regenerate — don't let the issue and the requirement
drift apart.
