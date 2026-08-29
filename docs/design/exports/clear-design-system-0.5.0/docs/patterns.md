# Workflow patterns

Components answer "what does this look like". Patterns answer "what happens next" — the state transitions, the accessibility behaviour, and the copy that go with a task. These are generic: CLEAR's workout app is the worked example, not the contract. An app with no timer still uses **Long-running generation**, **Recoverable failure** and **Destructive confirmation** unchanged.

Each pattern lists components, states, accessibility, atmosphere level, and what not to do.

---

## 1 · Data-entry form

**Components** `AppHeader` · `FormField` / `Input` · `ChoiceGroup` · `IntensitySlider` · `Button`
**Atmosphere** `quiet` — the background must not compete with fields being read and typed into.

**States** empty → partially filled → validating → invalid → submitting → submitted.

**Accessibility** Every control has a real label wired with `htmlFor`/`id`. Validation errors go in `errorText`, which sets `aria-invalid` and links via `aria-describedby` — never colour alone, never a red border with no text. On submit failure, move focus to the first invalid field. Group related choices in a `ChoiceGroup` so the legend is announced with each option.

**Content** Labels are short and uppercase. Helper text is sentence case and factual. Errors state the constraint, not the transgression: "Must be 10–120 minutes", not "Invalid input".

**Don't** Validate on every keystroke — wait for blur or submit. Disable the submit button to express invalidity; let the user press it and hear why.

---

## 2 · Long-running generation

**Components** `ScanLoader` (or `Progress`) · `Button` with `loading` · `Toast`
**Atmosphere** `full` if it is a brand moment, `quiet` if it happens inside a working screen.

**States** idle → running → slow → complete → failed.

**Accessibility** The loading region is `role="status"` with `aria-busy` while working. Announce the *label*, not each log line — a boot log read aloud line by line is noise. The triggering button gets `aria-busy` and keeps its accessible name. Pass `value`/`max` only when progress is real; a fake percentage is a lie a screen reader repeats.

**Content** Say what is happening: "Generating session", "Reading history". At the slow threshold, say so factually — "Taking longer than usual" — and never apologise or joke.

**Don't** Manufacture delay so the animation can be admired. Show a spinner. Leave a failed state with no way out.

---

## 3 · Recoverable failure

**Components** `Toast` `variant="negative"` · `Button` with the retry action · `EmptyState` for whole-screen failure
**Atmosphere** unchanged from the screen it interrupts.

**States** failed → retrying → recovered, or failed → dismissed.

**Accessibility** This is the one case for `role="alert"` and `aria-live="assertive"` — a failure that needs action now. Everything else stays polite. The retry control must be reachable by keyboard immediately, and focus should not be yanked away from what the user was doing.

**Content** State what failed and what survived: "Sync failed. Your session is saved locally." Offer exactly one recovery action. Never blame the network in the abstract, never say "Oops".

**Don't** Use an assertive announcement for a success. Show a failure with no action. Say "something went wrong".

---

## 4 · Destructive confirmation

**Components** `Dialog` with `critical` · `Button` `variant="critical"` · `Button` secondary for the safe path
**Atmosphere** inherited; the dialog does not change it.

**States** armed → confirmed, or armed → cancelled.

**Accessibility** Native `<dialog>` + `showModal()`, so the focus trap, `Esc`, and background inertness are the platform's. The safe action comes first in DOM order and takes initial focus. `Esc` cancels — it never confirms.

**Content** The title names the consequence as a question: "Abandon workout?". The body says exactly what is lost and what is kept. The confirm button repeats the verb — "Abandon", not "OK" or "Yes".

**Don't** Use red as the only signal. Put the destructive action first. Require typing a word for an action that is one undo away.

---

## 5 · Empty and first-run

**Components** `EmptyState` · `Button`
**Atmosphere** `full` — an empty screen is the one place atmosphere is the content.

**States** never-had-data → has-data. Distinguish from *filtered-to-nothing*, which is a different message and a different action (clear the filter, not create data).

**Accessibility** The heading is a real heading in the page's outline. The action is a button, not a decorated div.

**Content** Factual, never apologetic or motivational: "No sessions logged." One imperative action. No mascots, no encouragement, no "journey".

**Don't** Illustrate emptiness with a drawing. Use the same copy for "nothing yet" and "nothing matches".

---

## 6 · Operational screen

**Components** `TimerDisplay` · `Progress` with `segments` · `Chip` / `ChoiceGroup` for logging · `Button` `size="lg"`
**Atmosphere** `operational` — glanceability first. Scanlines off, background dimmed hard.

**States** ready → active → paused → low-time → complete → abandoned.

**Accessibility** The timer is labelled once and is **not** a live region; announcing every second makes the rest of the screen unusable. Announce milestones deliberately — "10 seconds remaining" — via a polite live region. Controls used mid-task get the largest hit areas in the system.

**Content** Numbers and nouns. "Set 3 of 5", "01:30". No sentences during activity.

**Don't** Rely on the timer's colour change alone for the low state — pair it with the label, the pulse, and a milestone announcement. Put a destructive action next to a frequently-pressed one.

---

## 7 · Boot and re-entry

**Components** `ClearLogo` with `boot` · `ScanLoader` · `Button` only when consent is involved
**Atmosphere** `full`.

**States** initializing → ready → entered, plus slow and failed.

**Accessibility** Nothing waits on an animation. Under reduced motion the sequence renders its end state immediately. If initialization outruns the budget, say so; if it fails, offer retry.

**Content** Terse system lines: "Profile · loaded". No taglines, no welcome.

**Don't** Gate a ready app behind a keypress. Replay the full sequence for a returning user — brand once, then get out of the way. Add delay for effect.
