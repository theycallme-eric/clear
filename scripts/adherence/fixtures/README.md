# Adherence gate fixtures

Deliberately broken files. Each one commits exactly one of the violations DS-08 says the gate
must catch; `src/test/adherence-gate.test.ts` lints them and fails if the gate stays quiet.

They live outside `src/` on purpose — `npm run lint:ds` lints `src`, and a fixture inside it
would fail the build it is testing. `eslint.config.js` ignores this directory for the same
reason, and `tsconfig.json` does not include it.

`compliant.tsx` is the control: the same shapes written correctly, proving the gate stays
silent on code that obeys the rules.
