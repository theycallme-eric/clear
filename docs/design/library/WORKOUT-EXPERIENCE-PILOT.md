# Workout prompt and experience — library workflow pilot

Status: prepared handoff. This document does not claim another agent has been
started, messaged, or assigned an implementation issue.

## Objective

Use the owner's workout-prompt/experience changes as a real test of the design
library workflow. Produce approved design evidence before requirements and DAG
integration. Improve the shared owners rather than creating parallel copies.
The reusable superset shape remains a useful cross-context example; do not
reinvent it just to demonstrate the process.

## Start from identified sources

- Released audit baseline: main `14acb2cc549b482e2fb5466a2402bbe5a34029c3`.
- Gallery delivery proposal: `codex/lib-001-public-gallery`, based on that release.
  The work is saved as a local proposal snapshot. Resolve that branch's exact
  local SHA before use; it is not approved or published remotely.
- Planning authority: the North Star, inventory report, ownership specification
  and fixture contract linked from [README](README.md).
- Review process: [REVIEW-GUIDE.md](REVIEW-GUIDE.md).

Start with read-only inventory and design scoping now. For changes, create your
own isolated branch from a pinned available source. Once the gallery change has
a published review commit, record its exact SHA and choose explicit integration
or dependency. Do not copy from a moving dirty checkout, cherry-pick imagined
commits, or label the proposal as released. Refresh baseline identity if main
or the intended gallery dependency changes.

## Read and reuse

Read AGENTS.md, the playbook, project map, `docs/specs/design/ATOMIC.md`, IA.md,
and the library docs. Inspect the user's desired workout/prompt changes and
resolve only the questions that change the design scope. A library handoff
does not define those product changes for the owner.

Trace the relevant real owners:

- `src/app/Generate.tsx`, `src/app/Review.tsx`, `src/app/Workout.tsx` and
  `src/app/FormatPreview.tsx` for screens and behavior.
- `src/ui/`, including `superset-block.tsx`, `set-logging-sheet.tsx` and
  `session-detail.tsx`, for shared compositions and current variants.
- `src/dev/gallery-registry.tsx` and `src/dev/gallery-app.tsx` for registered
  examples. `/gallery/app?component=Card`, `Input`, `SessionSectionCard` or
  `AppDialog` filters to those existing entries.
- `src/design-system/` for the pinned public foundation API and tokens.
  `_source` and original archive specimens are historical references; do not
  edit mirrored vendor copies or treat them as canonical app screens.

Map each proposed UI change to existing component/token, current consumer,
example/fixture, and shared owner. If the current library lacks a realistic
screen, add an owner fixture that renders the real component with deterministic
display data. Do not fabricate a look-alike that can drift from production.

## Request a gap before requirements

When reuse is insufficient, record: existing options checked; the unmet user
need; a variant/slot/token extension or new component; source owner; public API;
affected consumers; states; preview; and proposed acceptance criteria. Obtain
the applicable design decision before requirements consume the new contract.
Do not infer that a new component is necessary merely because no specimen is
listed yet. Preserve valid Review/live/history differences explicitly.

## Deliver one focused design packet

Use an isolated preview with real styles and components. Record base and proposal
source, fixture version, viewport, skin, fonts and state names. The left side is
the actual identified current implementation. The right is the proposal. If the
current implementation is missing from a preview, disclose the gap and correct
the harness before asking for a visual decision.

Show the primary transition and relevant empty, loading, error, expanded,
collapsed, focus and narrow-phone states. Include only applicable states;
justify intentional variants. For a shared change show both the component and
affected screen contexts. Keep user UAT observations linked to the source they
describe. Record decisions and exclusions, not just screenshots.

The gallery is visual/component authority. Prompt semantics, model outputs,
validation and business behavior retain their own requirements and tests.
Visual approval alone does not approve those behaviors. Use the project's
existing verification rules for any backend or generation work.

## Carry approval forward

The requirements packet must contain approved component/token IDs and APIs,
source SHA, fixture/state links, current/proposed evidence, decisions, intentional
exceptions, affected consumers and acceptance criteria. Use the established
handoff template; do not mark its approval fields without the owner's decision.

The implementation agent checks that packet before coding and uses the same
shared implementation. If the approved source/API is unavailable or a change
would break it, request a reconciliation rather than reinterpret the picture.
The integrated preview must demonstrate component and consumer agreement.

## Completion evidence

- A new agent found and reused the existing building blocks.
- Missing coverage produced a documented fixture or component request.
- The owner approved a concrete proposal before requirements consumed it.
- Requirements and DAG tasks retained the visual detail and source identity.
- Integrated screens match the approved proposal; shared updates reach each
  listed consumer without unrecorded variants or old patterns returning.
- The gallery/register/docs are updated with the implemented source and state
  coverage. Approval, merge and release status are recorded separately.
- Friction and information loss in this pilot are reported as changes to the
  process, with owners and acceptance criteria.
