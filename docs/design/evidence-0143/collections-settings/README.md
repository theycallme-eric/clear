# CLEAR 0.14.3 — collections and settings evidence (TASK-035, #381)

The AFTER record for Home and its resume slot, History and Favorites, Session Detail, Settings
with appearance, and Places and equipment, on the installed 0.14.3 package. It is deterministic
local evidence: each case signs in its own disposable namespaced user against the E2E project and
writes that user's records through the app's real RPCs. Only named failures are answered in the
browser, and only for that user's request. Model requests are refused. It is not live generation
proof and not deployed proof, and every record says so.

| Path | Holds |
| ---- | ----- |
| `manifest.json` | Derived index: identity, cases, viewport/skin matrix, every state's before and after pictures, dispositions, observations |
| `records/<project>--<case>.json` | One passing case in one project: its captures, keyboard/motion/contract observations and generation counts |
| `screenshots/` | The pictures the records name, at CSS scale |

`e2e/design-0143/collections-settings.spec.ts` produces all of it. A case writes its record and
pictures the first time it passes and leaves them alone afterwards, so a later verification run
asserts the same behaviour without rebinding committed pictures to a different tree. To
re-record, delete `records/` and `screenshots/` and run the spec.

## Identity

- Package `clear-design-system` 0.14.3, hash `e09aa5df…864a1a8`.
- Runtime source hash `8157cfd3…f9749e70`: `main` at `4a5e512` with no route changes. This task
  changes no runtime source.
- Tested deployment: the wrapper's owned local Vite server. No deployed origin was exercised.

## Coverage

240 pictures from 15 passing cases (`home`, `history`, `detail`, `settings`, `places` in each of
`mobile`, `tablet`, `desktop`): phone 127, tablet 48, desktop 48, short phone (390x320) 17; skin
`clear` 157, `mono` 31, `signal` 26, `vapour` 26. The four-skin and short-phone passes run in the
phone project on the states where a list, selection, severity or a pinned action is at stake.
They are not a Cartesian product of every state, skin and viewport. Every picture names
TASK-040's BEFORE picture of the same state.

All 49 baseline states TASK-001 recorded for these screens are accounted for: 41 are pictured
and 8 are source dispositions with no rendered claim:

- Settings `profile-loading`, `profile-error-retry` and Places `locations-loading`,
  `locations-error-retry`: profile and locations are Boot-watched reads, so Boot is the native
  surface on a cold load.
- Settings `missing-profile`: the guard sends a user without an onboarded profile to onboarding.
- Home `incompatible-detail-fallback`: Home and History share `useOpenHistorySession`. The
  fallback is pictured from History, which lists the never-started record.
- Home `suggestion-selected-dismissed`: needs a multi-week pattern history. Its card is the same
  composition as Train today.
- Session Detail `restart-active-confirmation`: the shared workout-chrome confirmation is owned
  by the workout lifecycle group.

The History list's first read is Boot-watched, so its `loading` and `error-retry` pictures hold
and then fail the second page that Load older workouts asks for, as TASK-040 did.

## What each case proves

- **Home**: Train today, This week and the Recent workouts/Favorites panel are each a current
  card with the 12px bar and an internal heading, none nested. The group set takes one
  `.clr-boot` arrival 40ms apart; a tab change replays nothing; under reduced motion there is
  none. Tabs move with the arrow keys. A completed recent opens Review. A favorite saved from
  Session Detail is stored once and listed after reload. A failed favorites read keeps its card
  and offers Retry. An active session replaces Train today and the footer becomes Resume
  workout, which leads to `/workout`.
- **History**: one Workout history card in empty, populated, filtered, selected, loading and
  error states; rows are list items, never cards. Load older workouts, Show all entries and Retry
  sit in the measured footer. Completed records open Review; a never-started record opens
  `/history/:id`.
- **Session Detail**: one Overview card holds the facts (`dl`), provenance and the ruled Mood and
  Notes sub-groups. Each section is one card, and blocks after the first are set off by an
  internal rule. The heading outline never skips a level. Another user's completed record and a
  random id both answer Workout not found with no sections. Back on a direct entry goes to
  History, and from an in-app entry goes back where it came from.
- **Settings**: five landmark sections, each a current card. A held save shows Saving…; the typed
  `settings_not_viable` refusal rolls back and the stored profile is unchanged. A real save
  survives reload. All four skins are chosen through the picker with a tick, plus System under
  `prefers-contrast: more`. Selectable controls get brackets and the note field owns its focus.
- **Places**: one card per place, never nested. Default carries a tick and a sentence. Equipment
  loading/error/retry, a nameless-save refusal, create and rename persisting across reload, a
  typed viability refusal, a failed default change rolling back, refusal to delete the default,
  the native delete confirmation (Escape keeps the place), and a confirmed delete removing the
  stored row.

## Discrepancies recorded, not changed

- On every viewport the atmosphere's endless drift loops are still running at capture (237 of
  240 pictures). They are listed per picture under `matrix.stillMovingAtCapture`. Entrances and
  state changes are waited out before every picture.
- Right after a reload under `prefers-reduced-motion`, Home and Settings briefly report about ten
  running animations or transitions. They end within the poll window and nothing is left
  running, so the lane waits for that rather than asserting zero on the first frame.
- In one development run, a footer Cancel click stalled while the viability-refusal toast was
  open, in all three projects. The inferred cause is the toast covering the footer; this was not
  confirmed from the trace. The lane now dismisses the toast before using the footer. The toast
  host is shared and outside this task.
