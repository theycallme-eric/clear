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
npx tsc --noEmit
npm test
npm run build
```

No CSS framework or component library is used. `DS-01` will vendor the approved public design
system into `src/design-system/`; until then the shell intentionally uses browser-default styling.

Read [PROJECT_MAP.md](PROJECT_MAP.md) before adding a file and
[docs/process/AGENT_PLAYBOOK.md](docs/process/AGENT_PLAYBOOK.md) before selecting work.

For the reconciled build sequence, current state, backend/key gates, and the distinction between an
installable shell and a useful PWA, read
[docs/process/IMPLEMENTATION_PLAN.md](docs/process/IMPLEMENTATION_PLAN.md).
