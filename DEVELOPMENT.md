# Development

> Environment setup (env vars, fresh-clone flow, paused-project recovery) lands with ENV-04.
> This file currently covers the test harness (ENV-06).

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
