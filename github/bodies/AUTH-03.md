> **AUTH-03** · Layer `state` · Milestone `M0` · Carry-over `rebuild`

**Spec:** `specs/IA.md` §1 guard semantics · §5 cross-cutting

Kills the other half of D1. Profile and locations are independent React Query queries keyed by `user.id`. Guards (public-only / protected / onboarding-gate) read query state. A failed profile fetch renders an error with retry — it **never** impersonates a new user.

## Acceptance
- [ ] Simulated profile 500 → error screen with retry; user is never routed to onboarding
- [ ] Guard matrix tested: {unauthenticated, authenticated±onboarded, loading} × {public, protected, onboarding} routes
- [ ] Profile and locations load independently; one failing does not block the other
- [ ] Sign-out invalidates both queries; no refetch storms on token refresh
- [ ] **Until ONB-01 exists (M2), an authenticated user without a completed profile sees a clear placeholder screen** — "account setup isn't built yet" with a sign-out action — never a redirect to a route that does not exist. Removed when ONB-01 lands

---

## 9. Design system (DS trunk — M0 gate covers DS-01, DS-02, DS-04, DS-08)

> **The gate is lifted.** `CLEAR Design System 0.5.0` landed 2026-08-25 and was reviewed
> against this section. It is not a token export — it is a **complete, versioned component
> library**: 18 React exports with typed props, 75 icons, four skins, a three-level
> atmosphere axis, a full motion vocabulary, measured contrast, and a lint config that
> mechanises design-system compliance.
>
> Everything the DS trunk previously proposed to *build*, it **ships**. This section is
> rewritten from "build the design system" to "integrate it, and build only what it
> doesn't cover." `specs/design/ATOMIC.md` is the substrate contract; read it before any
> DS or UI ticket.
>
> **DS-03 (chamfer primitives + buttons) is deleted** — `ChamferedFrame`, `Button`,
> `IconButton`, `.clr-chamfer`, `.clr-card` and `.clr-btn` all ship, with the chamfer
> implemented two ways and the border geometry solved more exactly than the requirement
> asked for. Its dependents move to DS-01 and DS-04.

---

**Depends on:** AUTH-01, DATA-03, CORE-01, CORE-03
**Blocks:** GEN-03, GEN-04, SES-01a, HIST-01, ONB-01, SET-01

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
