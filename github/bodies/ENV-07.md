> **ENV-07** · Layer `infra` · Milestone `M0` · Carry-over `new`

**Spec:** — self-contained; acceptance criteria are the full specification

The part that is genuinely hard, and the reason it is a separate requirement: an end-to-end test of CLEAR needs an authenticated user, a seeded library, and a database it can reset — and the auth flow is a one-time code sent by email.

**Mobile viewport is the default, not a variant.** ~80% of use is a phone at a gym; a suite that only proves the desktop layout works is testing a minority case.

## Acceptance
- [ ] Playwright configured; **the default project is a mobile viewport** (390×844, touch, coarse pointer). Desktop is an additional project, not the baseline
- [ ] Test users provision without a human reading an inbox — Supabase admin API creates a confirmed user and mints a session directly, so the OTP screen is exercised in its own focused test rather than in every flow
- [ ] Seed and reset are one command each and are idempotent; a failed run never leaves the next one poisoned
- [ ] **RLS is a standing test, not a one-time check.** DATA-01 proves the policies once at authoring time; this suite re-proves them on every PR — user A authenticated, user B's rows, every user table, read and write, expecting zero rows and a denial
- [ ] `axe-core` runs against every screen the suite visits and fails on violations (see CORE-05)
- [ ] The suite runs in CI on every PR against a preview deploy, and locally against the dev server, with no test-only branches in `src/`
- [ ] A failing E2E test produces a trace and a screenshot, not just a stack

---

**Depends on:** ENV-06, ENV-02, DATA-02, AUTH-01
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
