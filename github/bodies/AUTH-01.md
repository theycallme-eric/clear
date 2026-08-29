> **AUTH-01** · Layer `state` · Milestone `M0` · Carry-over `rebuild`

**Spec:** `specs/DATA_MODEL.md` §5 profiles

Kills half of D1. A minimal provider over `supabase.auth.onAuthStateChange` exposing `{ status, user, signOut }`. It fetches **nothing** — no profile, no locations, no timeouts, no locks.

## Acceptance
- [ ] ≤80 lines; zero `useRef` concurrency guards; zero manual timeouts
- [ ] No data fetching inside any auth event handler
- [ ] Token refresh does not trigger any application fetch
- [ ] `signOut` clears the React Query cache
- [ ] Unit tested against a mocked auth client (signed out → in → refresh → out)

---

**Depends on:** ENV-01, DATA-03
**Blocks:** ENV-07, AUTH-02, AUTH-03

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
