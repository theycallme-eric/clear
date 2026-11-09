# clear-refinement-20261103 evidence

This directory is owned by TASK-039, which supplies the shared providers. Each other task owns only
its own `task-NNN/` directory. Do not add another shared checker. If one of these does not fit a
task, change the provider through its owner.

## Layout

| Path | Owner | Contents |
| --- | --- | --- |
| `clear-refinement-20261103/BODY.json` | TASK-039 | Body identity. It records the integration base `03087f7` (the selected baseline), Foundation 0.14.3, historical comparisons (`94f2c2f`, R7 `2d48f13`; never the baseline) and the hash of each staged-reference record. |
| `clear-refinement-20261103/references/<id>/REFERENCE.json` | TASK-039 | Staged-reference hash manifest: identity, the pinned manifest hash, and `path -> sha256` for every staged object. No object bytes are committed. |
| `task-NNN/required-cases.json` | that task | The exact required case identities for each verification check. |
| `task-NNN/results/<check>.json` | generated | Deterministic receipt written by the guard. Never edit it by hand. |

## Reference object store (outside Git)

Owner decision, 2026-11-09: staged reference objects are never committed to this repository,
because GitHub storage growth is not acceptable. Only the small hash manifests above are committed.
The object bytes live outside Git in the Runner body evidence location, addressed by content:

```text
<store>/clear-refinement-20261103/references/<id>/objects/<sha256>
```

The verifiers find `<store>` like this:

1. `CLEAR_REFINEMENT_EVIDENCE_DIR`, when set (absolute, or relative to the working directory).
2. Otherwise, the Runner V2 layout. The git worktree root is `<runner body>/worktrees/<task>`, so
   the store is `<runner body>/evidence`, two levels above the worktree root.

The check fails closed and names the expected location when any of these hold:

- the store is absent;
- this body's objects are absent;
- an object is missing;
- an object's sha256 does not match its manifest.

Nothing falls back to passing. Checks that verify references therefore run only where the body
folder exists. Pinned gallery files that equal the integration base still resolve from that
commit's git blob. Neither an unpublished commit nor an owner-machine path is ever needed.

To restage, use the one-time tool. It checks every byte against the approved requirements manifest
and writes objects to the store and manifests to this directory:

```sh
node scripts/refinement/stage-references.mjs --approved-run <requirements run dir>
```

## Staged references (resolved by identity)

- `accepted-gallery`: gallery commit `eded158cfd928d382c9a9409e2c372270312741d` on base `03087f7`. `PINNED-SOURCE.json` is a store object. Its hash `a1b1f93b…` is committed in `REFERENCE.json` and matches the approved requirements source manifest. 1,190 pinned files and 3 excluded archived templates are verified. The 94 files that differ from the base are store objects, listed in `stagedObjects`. Every other file resolves from the integration base's git blob. The unpublished gallery commit object is never needed.
- `phosphor-echo`: the pinned effects intake and selected preset (PRE-002 / TASK-033 supporting input).
- `historical-comparisons`: `SOURCE.json` for verified main and reviewed R7, plus the reviewed-versus-main source delta.

Show the guides (state map, shared owners, semantic tokens, field ownership) and their locations:

```sh
node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode references --reference accepted-gallery
node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode references \
  --reference accepted-gallery --show docs/design/library/refinements-2026-11-04/REUSE.md
```

`--show` prints a file only after every pinned hash of that reference has been verified. Guide
locations are identities: `store:<body>/references/<id>/objects/<sha256>` or `git:<base>:<path>`.
Some supplied documents (for example PINNED-SOURCE.json and GALLERY-DELIVERY.json) mention
owner-machine paths as provenance text. They are store objects, never committed, and nothing
resolves through those paths.

## Required-case manifest

```json
{
  "schema": "clear-refinement-required-cases/v1",
  "task": "TASK-001",
  "checks": {
    "check-01": {
      "runner": "vitest",
      "purpose": "delivery",
      "files": ["src/ui/movement-list.test.tsx"],
      "cases": [
        { "file": "src/ui/movement-list.test.tsx", "name": "describe title > test title" }
      ]
    }
  }
}
```

- `runner` is `vitest`, `playwright` or `node-test`. It must match the command.
- `files` must equal the file targets named in the command, and every file must exist.
- `name` joins describe/suite titles and the case title with ` > `. For Playwright, leave out the
  file-level suite. Use `"project": "mobile"` to pin a project.
- Every target needs at least one required case. Cases outside the declared set are counted but
  not required, for example cases skipped by `--testNamePattern` or `--grep`.
- `purpose: "setup"` marks bootstrap/baseline checks. Final mode never accepts them as delivery.
- A required case matches only by its exact identity: file, name and (Playwright) project, never
  by name alone. node:test TAP carries no file for a passing case. The guard therefore runs each
  node:test target as its own `node --test` invocation and attributes its cases to that file. A
  case declared for `a.test.mjs` cannot pass because a same-named case ran in `b.test.mjs`.

## Guard

```sh
node scripts/refinement/run-required-check.mjs --task TASK-NNN --check check-01 -- <command>
```

The guard rejects the run when any of these hold:

- the manifest is absent or invalid;
- a target is undeclared, missing, or a mix of existing and missing files;
- the command runs an uninstalled executable (no `npx` download);
- the command sets its own reporter, watch or update flags;
- the runner exits non-zero;
- the native report is absent, empty or stale;
- the run executes zero cases or only skipped cases (this includes node's synthetic pass for a file
  with no tests);
- a requested file was never collected;
- a native case cannot be attributed to a file;
- a required case is missing, skipped, todo, failed, flaky or an expected failure.

These rules were rehearsed against the installed Vitest 4.1 JSON, Playwright 1.63 JSON and Node 24
TAP formats.

## Modes of `verify-delivery-evidence.mjs`

- `baseline`: checks that the integration base exists and is an ancestor of HEAD, that Foundation
  0.14.3 is unchanged from the base, how the historical comparisons relate to the base, and that
  task manifests are valid. It needs no delivery receipt and no object store.
  `--require-current-source` also verifies every staged reference byte for byte, so it needs the
  object store.
- `references [--reference <id>]`: verifies the staged references and prints their guides.
- `final --tasks TASK-001,... | --all-tasks`: runs baseline and every reference, then requires each
  delivery check's receipt to pass and be current. The manifest and target hashes must be unchanged
  since the run.

## Definition records

`node scripts/refinement/verify-definition-record.mjs --task TASK-035 [--record <path>] [--require-section "Future targets"]`

The default record is `docs/definitions/clear-refinement-20261103/<TASK>.md`. It needs these header
lines:

- `Task:`
- `Requirement:`
- `Body:`
- `Status: definition-only`
- `Implementation claim: none`

It also needs a substantive section for each of: Scope, Sources, Current observations, Options,
Open owner decisions (with `Owner:` and `Decision:`), Limitations and Traceability. Each source
bullet is `` - `repo:|base:|ref:<id>/<path>` sha256 `<hex>` `` and must verify. Placeholder text
fails the check.
