> **AUTH-03** · Layer `state` · Milestone `M0` · Carry-over `rebuild`

**Spec:** `docs/specs/IA.md` §1 guard semantics · §5 cross-cutting

Kills the other half of D1. Profile and locations are independent React Query queries keyed by `user.id`. Guards (public-only / protected / onboarding-gate) read query state. A failed profile fetch renders an error with retry — it **never** impersonates a new user.

## Acceptance
- [ ] Simulated profile 500 → error screen with retry; user is never routed to onboarding
- [ ] Guard matrix tested: {unauthenticated, authenticated±onboarded, loading} × {public, protected, onboarding} routes
- [ ] Profile and locations load independently; one failing does not block the other
- [ ] Sign-out invalidates both queries; no refetch storms on token refresh
- [ ] **Until ONB-01 exists (M2), an authenticated user without a completed profile sees a clear placeholder screen** — "account setup isn't built yet" with a sign-out action — never a redirect to a route that does not exist. Removed when ONB-01 lands

---

**Depends on:** AUTH-01, DATA-03, CORE-01, CORE-03
**Blocks:** GEN-03, GEN-04, SES-01a, HIST-01, ONB-01, SET-01

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
