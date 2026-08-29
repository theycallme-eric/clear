> **ENV-06** · Layer `infra` · Milestone `M0` · Carry-over `new`

**Spec:** — self-contained; acceptance criteria are the full specification

ENV-01 installs Vitest. This makes it a harness someone can actually write a component test in, and makes an untested component a visible fact rather than an assumption.

## Acceptance
- [ ] React Testing Library configured with jsdom; a real component test renders, queries by accessible role, and asserts on user-visible output — not implementation details
- [ ] `npm test` runs unit + component tests in CI and locally with identical results
- [ ] Test utilities live in one place: a render helper that mounts the app's providers, and factory functions for domain fixtures. **A test that hand-builds a session object is a bug in the harness**
- [ ] Coverage reported, not gated — a number nobody can game, on a wall where it is visible
- [ ] `@testing-library/user-event` is the interaction API; no synthetic `fireEvent` on new tests
- [ ] `vitest --watch` is documented in DEVELOPMENT.md as the working loop

---

**Depends on:** ENV-01
**Blocks:** ENV-07

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
