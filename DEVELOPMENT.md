# Development

> Environment setup (env vars, fresh-clone flow, paused-project recovery) lands with ENV-04.
> This file currently covers the test harness (ENV-06) and the accessibility
> review passes (CORE-05).

## Reviewing a UI issue

Automated checks (unit tests today, `axe-core` in the E2E suite once ENV-07
lands) catch roughly a third of real accessibility problems. They are the
floor. Reviewing any UI issue includes two manual passes:

### The keyboard-only pass

Put the mouse away and drive the whole change with the keyboard.

- **Tab** reaches every interactive element, in an order that matches the
  visual order. The first Tab on any screen lands on the skip link, and
  activating it jumps to the main content.
- Focus is **visible on every stop** — a chamfered control shows its doubled
  border, everything else its outline.
- After navigating, focus lands on the new screen's `<h1>`, never back at the
  browser chrome.
- Submitting an invalid form moves focus to the first invalid control.
- **Esc** closes any dialog and never confirms. Nothing traps focus except an
  open dialog.

### The screen-reader pass

VoiceOver (macOS: ⌘F5) is the reference. Walk the change end to end.

- Navigating announces the screen's name once — no silence, no double
  announcement.
- The rotor's heading list reads as an outline: one h1, no skipped levels.
- Landmarks are one `main`, a `header`, and named `nav` regions — nothing
  important lives outside them.
- Every control announces a real name, a role, and its state (selected,
  invalid, expanded). Errors are read when they appear; only a destructive
  failure interrupts.
- Nothing meaningful is conveyed by colour or position alone.

## Testing

The harness is Vitest + React Testing Library on jsdom, configured in
`vite.config.ts` with shared setup in `src/test/setup.ts`.

### The working loop

```sh
npm run test:watch
```

This is `vitest --watch`: keep it running while you work and it reruns the
affected tests on every save. `npm test` (`vitest run`) is the one-shot form —
the same command CI runs, so local and CI results are identical.

### Writing tests

- **Component tests** render through the helpers in `src/test/render.tsx`:
  `renderWithProviders(ui)` for a component in isolation,
  `renderApp(entries)` for the real route tree. Both mount the app's
  providers, so never wire providers inside a test.
- **Query by accessible role** and assert on user-visible output, not
  implementation details.
- **Domain fixtures come from `src/test/factories.ts`.** A test that
  hand-builds a domain object is a bug in the harness — extend the factory
  instead.
- **Interactions use `@testing-library/user-event`**; no synthetic
  `fireEvent` in new tests. Start each interaction test with
  `const user = userEvent.setup()` and use the returned user instance.

### Coverage

```sh
npm run test:coverage
```

Coverage is reported, never gated: no thresholds, just a visible number.
The text summary prints in the terminal and an HTML report lands in
`coverage/`.
