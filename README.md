# Clear — Rebuild Workspace

Everything that isn't code. Requirements, specs, design exports, process, and notes.
Version-tracked with local git from day one — no remote required.

## Where things live

| Folder | Holds | Status |
|---|---|---|
| `requirements/` | `REQUIREMENTS.md` — the spec. 50 requirements, 197 acceptance criteria. | **v0.2, in review** |
| `specs/` | Deep specs for individual features. One per feature, written before its tickets are cut. | 1 written, 8 pending |
| `design/exports/` | Every Claude Design export, unpacked and dated. Never store the zip — store its contents. | awaiting first |
| `design/tokens/` | Current token JSON. The input to DS-01's build step. | awaiting first |
| `process/` | How we work. Repeatable methods, not project content. | in progress |
| `journal/` | Dated notes. Decisions, dead ends, why things changed. | started |
| `reference/` | Old-app material worth keeping. Read-only, never edited. | 7 files |
| `scripts/` | Small tools. Currently: design export import + diff. | 1 |

## Current state

**Requirements v0.2 is awaiting review.** That's the only thing blocking everything else —
tickets, the DAG, and the first build session all wait on approval.

Review surface: the requirements are published as an interactive artifact with per-requirement
approve / flag / note, and a copy-out for review notes.

## The rules that keep this from rotting

1. **One source of truth per thing.** `requirements/REQUIREMENTS.md` is the spec. Not a copy in
   a chat, not a version in project knowledge. If it's here, it's current.
2. **Specs precede tickets.** A stub becomes issue-ready only after a spec exists in `specs/`.
   Progressive overload proved why: writing its details early would have produced the wrong
   database schema.
3. **Design exports are unpacked, never stored as zips.** Zips can't be diffed. See below.
4. **Decisions get journaled the day they're made.** The reasoning is worth more than the outcome
   and evaporates fastest.

## Design system versioning

The design system lives in Claude Design. Each export lands here as an unpacked, dated folder:

```
./scripts/import-design.sh ~/Downloads/clear-design.zip
```

The script unpacks it, mirrors the token JSON, and prints exactly what changed since the last
export — file-level adds/removes/modifications, plus line-level diffs of every token value.
Then commit it. Git holds the history; the script tells you what to look at.

This works because a Claude Design export is entirely text under the hood — HTML artboards,
JSON tokens, SVG. All of it diffs cleanly once it's out of the archive.

**Why this matters beyond convenience:** DS-01 in the requirements builds generated CSS from
token JSON. Deterministic input, deterministic output — so a token change produces a reviewable
CSS diff. "What changed in the design" becomes a question with an exact answer.

## Git

Local only. No remote yet, by design — GitHub is paused until requirements are approved.
Everything is already being versioned; adding a remote later is one command.
