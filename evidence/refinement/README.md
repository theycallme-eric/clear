# clear-refinement-20261103 evidence

This directory is owned by TASK-039, which supplies the shared providers. Each other task owns only
its own `task-NNN/` directory. Do not add another shared checker. If one of these does not fit a
task, change the provider through its owner.

## Layout

| Path | Owner | Contents |
| --- | --- | --- |
| `clear-refinement-20261103/BODY.json` | TASK-039 | Body identity. It records the integration base `03087f7` (the selected baseline), Foundation 0.14.3, historical comparisons (`94f2c2f`, R7 `2d48f13`; never the baseline) and the hash of each staged-reference record. |
| `clear-refinement-20261103/references/<id>/` | TASK-039 | Staged references. `REFERENCE.json` gives the identity. `objects/<sha256>` holds the bytes, addressed by content. |
| `task-NNN/required-cases.json` | that task | The exact required case identities for each verification check. |
| `task-NNN/results/<check>.json` | generated | Deterministic receipt written by the guard. Never edit it by hand. |

## Staged references (resolved by identity)

- `accepted-gallery`: gallery commit `eded158cfd928d382c9a9409e2c372270312741d` on base `03087f7`. `PINNED-SOURCE.json` is staged verbatim and its hash matches the approved requirements source manifest. 1,190 pinned files and 3 excluded archived templates are verified. The 94 files that differ from the base are staged objects. Every other file resolves from the integration base's git blob. The unpublished gallery commit object is never needed.
- `phosphor-echo`: the pinned effects intake and selected preset (PRE-002 / TASK-033 supporting input).
- `historical-comparisons`: `SOURCE.json` for verified main and reviewed R7, plus the reviewed-versus-main source delta.

Show the guides (state map, shared owners, semantic tokens, field ownership) and their locations:

```sh
node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode references --reference accepted-gallery
node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode references \
  --reference accepted-gallery --show docs/design/library/refinements-2026-11-04/REUSE.md
```

`--show` prints a file only after every pinned hash of that reference has been verified. Some
supplied documents mention owner-machine paths as provenance text. Nothing resolves through those
paths.

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
- With node:test and several targets, TAP cannot attribute a passing case to a file. Cases then
  match by name, so keep names unique.

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
- a required case is missing, skipped, todo, failed, flaky or an expected failure.

These rules were rehearsed against the installed Vitest 4.1 JSON, Playwright 1.63 JSON and Node 24
TAP formats.

## Modes of `verify-delivery-evidence.mjs`

- `baseline`: checks that the integration base exists and is an ancestor of HEAD, that Foundation
  0.14.3 is unchanged from the base, how the historical comparisons relate to the base, and that
  task manifests are valid. It needs no delivery receipt. `--require-current-source` also verifies
  every staged reference byte for byte.
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
