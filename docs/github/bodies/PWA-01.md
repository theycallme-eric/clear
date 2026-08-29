> **PWA-01** · Layer `infra` · Milestone `M2` · Carry-over `new`

**Spec:** `docs/specs/IA.md` §5 cross-cutting

Manifest, chamfered icon set, theme color, iOS meta, and a minimal service worker (app-shell caching only — no data offline; that's OFF-01/M3).

## Acceptance
- [ ] Lighthouse installability passes; add-to-home-screen works on iOS standalone (no Safari chrome)
- [ ] New deploys activate on next load — no stale-shell trap
- [ ] Service worker caches shell only; API responses are never cached

---

**Depends on:** ENV-03, DS-02
**Blocks:** —

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
