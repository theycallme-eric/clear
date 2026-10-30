# Reviewing the visual library and the released workout experience

This guide connects the owner's next two activities: UAT of the recent release,
and a workout-prompt/experience design branch that tests the library workflow.
It is a review process, not evidence that either activity has been approved.

## Identify what is being reviewed

| Review | Starting point | What an approval means |
| --- | --- | --- |
| Recent batch UAT | Last verified released main `14acb2cc549b482e2fb5466a2402bbe5a34029c3`; confirm the deployment still has that source | Acceptance of the tested released behavior and visuals |
| Gallery delivery | Isolated `codex/lib-001-public-gallery` proposal based on that release | Acceptance of the library entry and its documented coverage; separate from approving every example |
| Workout-prompt/experience proposal | A separately pinned design branch and preview, using the same library contracts | Approval of the named proposal, states and shared component changes before requirements |

The last verified released deployment is
https://clear-iwsnlehye-erics-projects-0ade0dda.vercel.app. Its successful deployment
does not mean owner UAT has passed. The local gallery preview is
http://127.0.0.1:4179/gallery while its preview process is running; this is a local
proposal, not a production deployment. A durable shared preview remains a
publication step.

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

Review `/gallery`, `/gallery/app` and `/gallery/ds` in a fresh logged-out browser.
Check direct reloads, four skins, a narrow phone, keyboard section navigation,
one dialog, and a few familiar parent components. The App-composed view uses the
actual component implementations; the Upstream references view preserves the
original 0.14.3 documents and is labeled separately.

The first delivery has 49 entries and 131 initial examples. That count does not
cover every interaction or screen. The released report still identifies 25
missing owner-fixture candidates, 14 context exemptions and one dormant export.
Do not use a missing live workout example as a reason to recreate that UI.

Before publication, resolve the source-bound evidence refresh and the two known
upstream accessibility defects documented in README. Automated results and
local captures support review; they do not replace your visual decision.

## Test the design-first workflow with the workout proposal

Use [the agent handoff](WORKOUT-EXPERIENCE-PILOT.md). Ask for one small comparison
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
