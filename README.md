# CLEAR

AI-powered workout generator. The application shell is React 19, TypeScript strict, and Vite;
the approved requirements, specs, design export, and dependency graph live under `docs/`.

## Start in three commands

```sh
npm install
npm run dev
npm test
```

The development server prints its local URL. The root route renders the app shell and unknown
routes render the 404 fallback.

## Validate before pushing

```sh
npm run lint
npm run lint:ds
npx tsc --noEmit
npm test
npm run build
```

## The adherence gate (`npm run lint:ds`)

A hardcoded hex, a raw px value, or a font the design system does not ship is a
review-blocking defect — `lint:ds` makes it a failing build instead. It lints `src/`, and it
also catches an unknown prop, an out-of-range `variant`, and an import that reaches past the
public entry into a component's internals.

The rules are not written in this repo. They are read from the vendored export at
`src/design-system/_adherence.oxlintrc.json`, which ships every rule as `warn`; the gate
raises each one to `error` (see `scripts/adherence/ds-config.mjs`). Regenerate the design
system and the gate follows it. Three deliberate adjustments, each one documented at the
point it is made:

- `src/design-system/` is excluded — it declares the tokens, it does not consume them.
- Tests may write `'0px'` in an assertion: reading a rendered value back is not styling. Only
  the three raw-literal rules relax there; props, enums and imports stay enforced.
- Components whose props extend a React DOM attributes interface (`<Dialog onCancel>`) keep
  their enum rules but not the unknown-prop rule — the export's generated prop list carries
  only each component's own props, and `tsc --noEmit` is the exact check for the rest.

Inline `eslint-disable` comments do not apply to this config. `scripts/adherence/fixtures/`
holds one deliberately broken file per violation; `src/test/adherence-gate.test.ts` fails if
any of them stops being caught.

No CSS framework or component library is used. `DS-01` will vendor the approved public design
system into `src/design-system/`; until then the shell intentionally uses browser-default styling.

Read [PROJECT_MAP.md](PROJECT_MAP.md) before adding a file and
[docs/process/AGENT_PLAYBOOK.md](docs/process/AGENT_PLAYBOOK.md) before selecting work.

For the reconciled build sequence, current state, backend/key gates, and the distinction between an
installable shell and a useful PWA, read
[docs/process/IMPLEMENTATION_PLAN.md](docs/process/IMPLEMENTATION_PLAN.md).
