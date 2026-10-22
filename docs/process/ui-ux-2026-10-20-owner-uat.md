# UI/UX 2026-10-20: owner phone UAT guide

TASK-040 (#475), REQ-020. This is a documentation handoff only. It covers the owner-directed
completed UI and format work on `main`, including TASK-034/036, the null-safe TASK-029/037 paths,
and the ladder timing boundary TASK-038. TASK-031 remains explicitly unproven, as agreed.

This guide does **not**:

- record owner acceptance (only the owner can give it; see [Acceptance](#acceptance));
- count as final release proof (TASK-035 still owns that, with every original check);
- authorize live generation, a capability probe, a deployment, or any change to Vercel or Supabase.

Using this guide does not call the model. Every format check uses the read-only format preview or
sessions you have already saved.

## What to open

Open this exact protected preview on your phone:

**[Open CLEAR for phone UAT](https://clear-2r5sb44oh-erics-projects-0ade0dda.vercel.app)**

The link was confirmed through the existing browser access on 2026-10-22: it opened the actual
CLEAR Welcome screen, not a Vercel protection error. This is an access check only, not owner UAT.
Normal Vercel sign-in may still be required on your phone; no protection setting was changed.

| Field | Value |
|---|---|
| Preview source commit | `984de82a1dccd69ab706189953930e4570706e35` (TASK-036, PR #512) |
| Equivalent merged app | `863169cb814ab9b8e028b2f8664c3ffe7d53bd7f`; the complete Git trees are identical: `a6912489c361d4c4732429684c53f6280d5ce9f2` |
| Protected preview URL | `https://clear-2r5sb44oh-erics-projects-0ade0dda.vercel.app` |
| Actual deployment / status receipt | Deployment `7264832878`, successful status `20319054372` at 2026-10-22T22:04:31Z; source `984de82a1dccd69ab706189953930e4570706e35` |
| Protected preview check | [Successful exact-source mobile check, run 39862216581](https://github.com/theycallme-eric/clear/actions/runs/39862216581) |

Retained identity receipts are also in this revision's `runner/delivery/PREMERGE_TASK036_984de82.json`
and `AFTER_READY_TASK036_984de82.json`. This later guide changes documentation only; it does not
relabel the preview's app source or claim its own document commit was deployed.
The following read-only GitHub pages identify the source and
deployment; you need to be signed in to GitHub:

- Preview source commit and its deployment status:
  https://github.com/theycallme-eric/clear/commit/984de82a1dccd69ab706189953930e4570706e35
- Exact deployment receipt:
  https://api.github.com/repos/theycallme-eric/clear/deployments/7264832878
- Exact deployment status receipts:
  https://api.github.com/repos/theycallme-eric/clear/deployments/7264832878/statuses
- The merged PR that produced it (Vercel's deployment link is in its checks and timeline):
  https://github.com/theycallme-eric/clear/pull/512
- Deployment history for the repository:
  https://github.com/theycallme-eric/clear/deployments

These are **not** the UAT target. They are listed so nobody mistakes them for it:

- `https://clear-37caizbsu-erics-projects-0ade0dda.vercel.app` is the immutable production build
  from 2026-10-03 (`df91e41`, deployment `6822912431`). It predates all of this work.
- `https://clear-peach.vercel.app` and `https://clear-app-1111.vercel.app` are aliases. Each one
  serves whichever build is promoted to it, so neither identifies a commit.

This is a fixed preview, not an alias for later changes. If a newer app build is handed over,
record its exact deployment separately and do not mix results. The checkbox repair is included;
final live release proof is still pending. Automated checks are not owner acceptance.

Before you start:

1. Open the confirmed preview URL on your phone. If Vercel asks, sign in through its normal
   protection. Use an account you already use. Do not create one just for UAT.
2. Install to the home screen if that is how you normally use CLEAR. Run the Back checks in that
   mode too.
3. Do not tap Generate during UAT. Live generation is not authorized by this guide (see
   [Open items](#open-items)).

## Phone checks

Number each result in [Acceptance](#acceptance). "Saved session" means a workout already in your
History. Do not create new variants.

| # | Area | Action |
|---|---|---|
| P1 | Settings entry | From Home, open Settings using the header control. |
| P2 | Back from Settings | Use the header Back control, then the phone's back gesture or button. Repeat in home-screen (PWA) mode. |
| P3 | Skins | Settings, then Appearance, then Skin. Choose each skin in turn: Clear, Vapour, Signal, Mono. Reload after the last one. |
| P4 | Rest vs training day | On Home in each skin, compare a rest day with a training day. |
| P5 | Format preview entry | Settings, then the Workout formats card, then Preview formats. |
| P6 | Strength formats | In the preview, open Strength formats: a standard block (back squat) and a superset (row and side plank). |
| P7 | Conditioning formats | Open Conditioning formats: circuit, EMOM, AMRAP and for-time blocks. |
| P8 | Ladder timing | Scroll to Ladder timing. Read Scheduled starts, For time and Capped window. |
| P9 | Preview is read-only | Toggle every disclosure in the preview twice. Then use Back (`Settings`). |
| P10 | Preview direct open | Open `/settings/formats` by typing it into the address bar, then tap Back. |
| P11 | Optional entries | In a saved session that is still in progress, leave weight, reps and effort empty on one movement, and fill only one of them on another. |
| P12 | Completion | Finish that existing in-progress session. On Summary, try both leaving the feeling row unanswered and choosing a value. |
| P13 | Saved history | Open History, then the session you just finished and one older saved session. |
| P14 | Reload and reopen | On the session detail, reload. Close the app or tab completely, reopen it, and return to the same session. |
| P15 | Checkbox choices | In Settings limitations and a place's equipment editor, note the original choices. Tap a box, tap its label, and use Space if a keyboard is connected. Add and remove a choice, Save or wait for autosave, then reload. Restore your original choices afterward. |

If you have no in-progress saved session, mark P11 and P12 "not run: no existing session". Do not
generate one. The format preview and P13 still cover display.

## Expected results

| # | Expected state |
|---|---|
| P1 | The Settings control is labelled and easy to hit. Settings opens with the cards Training, Limitations, Appearance, Places and equipment, Workout formats and Session. |
| P2 | Back returns to the screen you came from, and the PWA does not exit or land on a blank page. Opened directly, Back goes to a sensible parent, not out of the app. |
| P3 | Exactly four explicit skins and no "System" option. The selected skin carries a tick as well as colour, and your choice survives a reload. |
| P4 | Rest and training days differ by text or glyph, not only by colour, in every skin. |
| P5 | The "Workout formats" screen opens. A "Read-only preview" card says nothing here generates or starts a workout, logs a set or changes your training. |
| P6 | The standard block shows 3 × 5 with logged sets. The superset shows the row as a range of 8 to 10 per side, and the side plank is clearly marked Skipped. There are no RPE or warm-up checkbox entry controls, only recorded values. |
| P7 | Circuit shows "Rounds 3 of 4" and "Elapsed 12:40". EMOM shows "Minutes 8 of 10" with a fixed per-minute target. AMRAP shows Rounds 5 and Partial round 7 reps as results after the window, not as scoring inside it. For time is unscored and says so in words. |
| P8 | Each mode shows the 10-8-6-4-2 rungs with targets already worked out, a timing summary and a pacing note. Scheduled starts says "Finished the ladder", For time says "Reached rung 3 of 5", and Capped window says "Not scored". The rungs are not tappable choices. |
| P9 | Disclosures open and close. Nothing starts a workout, shows a timer running, or asks to save. Back returns to Settings. |
| P10 | The preview opens, and Back goes to Settings (it replaces the entry, so a second Back does not return to the preview). |
| P11 | Empty optional fields are accepted, with no forced default and no error. Partial entries keep exactly what you typed, including units. |
| P12 | Completion saves with or without effort. The feeling row is one row of five numbers that can be cleared, and the Summary title, metrics and streak read clearly. There is no overview or section-introduction text. |
| P13 | History lists the session with a readable entry. The detail shows each block's result or "Not scored", each movement's status glyph and text, and only the values you entered. |
| P14 | After a reload and a full reopen, the same values, statuses and feeling (or its absence) are shown. Nothing is duplicated or lost. |
| P15 | Each box tap, label tap or Space press toggles exactly once. Targets are easy to hit without toggling a neighbour. Added and removed choices survive Save/autosave and reload; there is no need for the former label-only workaround. |

Any difference is a finding. Note the step number, skin, screen and what you saw. A screenshot
helps but is optional.

## Saved history

Saved-history checks use your existing sessions only:

- **Old sessions (from before this work):** open at least one. It must still render after the
  null-safe reader change (TASK-037). An absent introduction or effort shows as absent, not as
  "null", "0" or an error.
- **The session finished in P12, if one was run:** values, skipped/completed status, optional
  feeling and per-block results match what you entered, after reload and reopen (P14).
- **Ladder sessions, if you have a saved one:** the reached rung and timing match what was
  shown during the workout. Older ladders without stored timing still display.
- **Favorites:** undoing a favorite removes the favorite only. The session stays in History.
- **Nothing extra appears:** using the format preview (P5–P10) must not add a session, set, result
  or favorite. If History gains an entry you did not finish, record it as a failure.

## Open items

These are stated as known when this guide was written. None of them blocks using the guide, and
none of them is claimed as done here.

| Item | Owner | Status |
|---|---|---|
| Protected preview identity | TASK-040 handoff | **Confirmed** for the fixed source and tree above through the actual deployment/status receipts and existing browser access. This is not final release proof or owner acceptance. |
| Original incident | TASK-031 | **Accepted unproven: original evidence unavailable.** The owner accepts this outcome; no reproduced cause or cause-specific fix is asserted. It receives no delivery credit, does not block this guide, and no further request for the unavailable evidence is needed. |
| Checkbox activation (U09) | TASK-036 | **Delivered on `main` and included in this preview.** PR #512 repairs the reproduced hit-area cause with contained 44-pixel targets. All seven automated phone cases and a separate fresh seven-case check passed, including box/label/Space and saved-choice reload. The old expected-failure marker is removed. Owner UAT remains pending; report any failed toggle in P15. |
| Live and release proof for the changed generation prompt (null introductions, intensity, ladder timing) | TASK-035 | **Pending, unproved.** No owner-authorized minimal real product-path case has been run or bound to the frontend commit, backend deployment and prompt/contract versions. Offline contract tests are not live proof. Final TASK-035 still requires all original CI/RLS/deployed checks. |
| Live generation during UAT | Owner | **Not authorized** by this guide. It needs separate action-time approval within the existing attempt limits. |

## Acceptance

**Owner acceptance: PENDING.** It stays pending until the owner reports a result. Nothing in this
document, CI, or an agent's run changes that.

Fill in when testing:

| Field | Value |
|---|---|
| Preview URL tested | |
| Commit / deployment id | |
| Phone, OS and browser (or PWA) | |
| Date | |
| P1–P15 results (pass / fail / not run, with reason) | |
| Findings | |
| Owner decision (accept / accept with findings / reject) | |

Completing this table records owner UAT only. It is separate from implementation and test
completion, and it does not satisfy TASK-035's final release proof.
