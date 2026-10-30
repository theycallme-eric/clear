# Reviewing the visual library and the released workout experience

This guide connects the owner's next two activities: UAT of the recent release,
and a workout-prompt/experience design branch that tests the library workflow.
It is a review process, not evidence that either activity has been approved.

## Identify what is being reviewed

| Review | Starting point | What an approval means |
| --- | --- | --- |
| Recent batch UAT | Audit baseline `14acb2c`; main has since advanced to `ba19701` with the PWA hotfix. Confirm the actual deployed source before testing | Acceptance of the tested released behavior and visuals |
| Gallery delivery | PR593, `codex/lib-001-public-gallery`, based on main ba19701 | Acceptance of the library entry and its documented coverage; separate from approving every example |
| Metadata and comparison delivery | Issue594, `codex/lib-002-text-roles`, stacked on PR593 | Acceptance of the shared role and useful real-owner comparisons; existing visual differences remain visible |
| Workout-prompt/experience proposal | A separately pinned design branch and preview, using the same library contracts | Approval of the named proposal, states and shared component changes before requirements |

The public gallery proposal is available from [PR593](https://github.com/theycallme-eric/clear/pull/593)
and its [Vercel preview](https://clear-git-codex-lib-001-public-gallery-erics-projects-0ade0dda.vercel.app/gallery).
The app gallery requires no CLEAR account; the preview host retains its normal
Vercel deployment protection. The older deployment
https://clear-iwsnlehye-erics-projects-0ade0dda.vercel.app is historical evidence,
not an automatically current UAT target. Deployment success is separate from UAT.

For each session record source commit, deployment URL, phone/browser, skin,
scenario/fixture and date. Do not put an old or partly implemented mockup on the
left and label it current. If UAT discovers a difference, keep the observation
and update the baseline mapping before using it for a new design comparison.

## Recent-batch UAT

Use a normal workout you intend to perform, with the released app and your
normal account. Start with a short phone pass through these transitions:

1. Home → Generate → Review: fields, choices, layout and the displayed workout
   agree. In Review check exercise order, superset grouping and rest placement.
2. Review → Workout: check the same exercise/superset shape, narrow-screen fit,
   countdown and progression. Record intentional Review/live differences.
3. Open Rest and the logging sheet. Rest starts prescribed rest when applicable;
   saving with internal Log does not start or restart it. The floating lower
   overlay blocks covered navigation. Minimize preserves the draft.
4. Try Swap, Undo and a short/narrow-phone case. Swap's intermittent short-phone
   accessibility result remains an explicit follow-up, not an assumed pass.
5. Finish → Summary → History/detail: logged values and grouped presentation are
   correct. Refresh/resume the relevant state once; avoid testing only a first
   render. Existing legacy history patterns are current behavior, not approved
   new design vocabulary.
6. Settings: change appearance, navigate back, and check keyboard/return focus.
   The previously observed deployed Settings return-focus failure is unresolved
   until this behavior is reproduced or its cause is established.

Capture a finding with: source/URL; route and state; exact action; expected and
observed result; screenshot or short recording; severity; whether it blocks
continued use. Record visual and behavior approval for the particular scenario.
The agent should reproduce and map findings to their shared owner, then propose
the smallest change there and list affected consumers.

## Gallery review

Review `/gallery` and `/gallery/app` in a fresh logged-out browser.
Check direct reloads, four skins, a narrow phone, keyboard section navigation,
one dialog, and a few familiar parent components. The App-composed view uses the
actual component implementations. Historical archive pages remain development
references and are outside this public delivery.

The first delivery has 49 entries/131 examples. Delivery 2 adds the real Review
row and two comparison groups, bringing the register to 52 entries/138 examples.
Use `?component=WorkoutEntryComparison` and `?component=MovementIdentityComparison`
on its branch preview to see related owners together. Check Swap/Escape and the
saved-section disclosure. Compare their roles and intentional differences;
the metadata refactor is expected to preserve the existing appearance.

These counts do not cover every interaction or screen. The released report identifies 25
missing owner-fixture candidates, 14 context exemptions and one dormant export.
Do not use a missing live workout example as a reason to recreate that UI.

Keep applicable source-bound evidence current. The archive accessibility
defects remain documented reference findings. Automated results and
local captures support review; they do not replace your visual decision.

## Test the design-first workflow with the workout proposal

Use [delivery 3 in the active plan](PLAN.md) and the README gap-request rule. Ask for one small comparison
first: a real, source-labeled current screen on the left and one proposed screen
on the right, with the same fixture and viewport. Include the components being
reused, changes to shared owners, and any requested new token or component.

Your review should address the desired experience and meaningful exceptions.
The agent owns inventory lookup, API details, reuse checks, state coverage and
consumer evidence. You should not have to inspect every component manually.

After approval, the requirements builder receives the approved source and visual
packet. The DAG/implementation agent consumes those same shared components.
Verification compares the integrated component and affected screens against
that packet. Merge updates the canonical library and its consumers together;
production deployment is a separate release step.

The pilot passes when the integrated result matches the approved proposal,
reuses the identified shared owners, and introduces no unrecorded old patterns.
Record where the handoff loses information and correct that process before
scaling it to the rest of the library.

Delivery 3 needs the current workout-prompt proposal or branch selected by the
owner. The old Refine previews are paused, mixed-source references; do not use
them as a current baseline or silently restart their design. Once selected,
use the ordinary issue/PR to name the canonical component and registry entry,
current/proposed source and fixture state, and meaningful design approval.
Keep that same implementation and those references through requirements and
the DAG; return material departures to review.
