# CLEAR 0.14.3 — Owner QA path

The owner's walk of the deployed application after the 0.14.3 pass merges. It is the one piece of
proof the automated lanes cannot give: a person, on the real deployment, with the real account.
`docs/design/CLEAR-0.14.3-FINAL-AUDIT.md` lists what is already proved locally and which pictures
to compare against; nothing here is a pass until the owner records it below.

## Before starting

The final handoff supplies one application URL, the verified deployment commit matching `main`,
and the actual deployed-check and bounded real-generation proof links/results. The operator checks and records these;
the owner should not need to locate or compare build identifiers to start the walk.

1. Open the verified application URL in the final handoff.
2. Read its short list of remaining unproved checks or known exceptions.
3. Follow the route checklist below. If the final build link or required release proof is still
   missing, the final handoff is not ready; the earlier build is only an early look.

Record the supplied build and proof links in the sign-off table. A step skipped because a signal was unavailable is written
as **not run**, never as pass.

## The walk

Use a phone (portrait) and a desktop browser. Do the core loop in Clear on the phone first, then
repeat the route checks in Vapour, Signal and Mono (Settings → Appearance). Compare against the AFTER
pictures under `docs/design/evidence-0143/` named in the audit.

| Step | Route | Check |
| --- | --- | --- |
| 1 | `/welcome` | One atmosphere, slowly drifting and breathing, with visible depth on the phone. Title sits on the atmosphere; everything else is in a card. |
| 2 | `/login` | Sign in with the real account. The form is one card with its heading inside. Busy and wrong-code states say what happened. |
| 3 | `/onboarding` | Only for a new account: step bar, ticks on selected choices, Back keeps the draft. Otherwise confirm `/onboarding` sends you Home. |
| 4 | `/` | Train today, This week and Recent/Favorites are separate cards, none inside another. Cards arrive once, staggered; changing tabs does not replay it. The Settings link is easy to hit. |
| 5 | `/generate` | Goal shown as context, Focus asked once. Selected chips carry a tick. Generate shows the scan loader with one cursor line, never a spinner or skeleton bars. |
| 6 | `/review` | The generated workout, section cards with headings inside. The load suggestion is a quiet link with a chevron. Start and Regenerate stay pinned at the bottom. |
| 7 | `/workout` | Log a set, take a rest, let a timer run. Only one thing pulses at a time. Timers are not inside an extra card. Back navigation and Abandon's confirmation behave. |
| 8 | `/summary` | Duration and Streak cards; the four moods are round line faces, Peak has no plus. Save and close returns Home with the session in Recent. |
| 9 | `/history` | The list is one card with rows, not a card per row. Empty, filtered and Load older behave. |
| 10 | `/history/:id` | Open a past session: one Overview card with Mood and Notes set off by rules. |
| 11 | `/settings` | Six section cards. Switch through all four skins; the selection carries a tick. |
| 12 | `/settings/locations` | One card per place; the default carries a tick and a sentence; delete asks first. |
| 13 | `/settings/formats` | From Settings → Workout formats → Preview formats. Fixed examples of every format and ladder timing mode, with status glyphs; nothing to start, log or save. Back returns to Settings, and History and Settings are unchanged. Check in all four skins. |

Across the walk:

- **Keyboard (desktop):** Tab reaches every action, focus is always visible (brackets on choices),
  and Esc closes a dialog and returns focus.
- **Reduced motion:** with the OS setting on, screens appear at once and the atmosphere is still.
- **Width:** narrow the desktop window to phone width and back; nothing scrolls sideways and the
  pinned actions stay reachable.
- **Failure honesty:** if anything fails (network, save), the message says what failed and offers a
  way back; nothing claims success it did not have.

Anything that looks wrong is recorded as a finding with the route, skin, device and a screenshot,
not fixed during the walk.

## Sign-off

| Item | Value |
| --- | --- |
| Verified application URL (operator supplies) | |
| `main` head commit | |
| Deployment commit (must equal the above) | |
| Deployed route checks and nine-entry matrix: links and actual results | |
| Bounded real-generation release proof: link and actual result | |
| Devices and browsers | |
| Skins walked (clear, vapour, signal, mono) | |
| Steps passed / findings | |
| Owner and date | |
