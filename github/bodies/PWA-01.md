> **PWA-01** · Layer `infra` · Milestone `M2` · Carry-over `new`

**Spec:** `specs/IA.md` §5 cross-cutting

Manifest, chamfered icon set, theme color, iOS meta, and a minimal service worker (app-shell caching only — no data offline; that's OFF-01/M3).

## Acceptance
- [ ] Lighthouse installability passes; add-to-home-screen works on iOS standalone (no Safari chrome)
- [ ] New deploys activate on next load — no stale-shell trap
- [ ] Service worker caches shell only; API responses are never cached

---

## 12. M3 — Planned medium-term

**Promoted — issue-ready.** The progressive-overload stub got its spec session (`specs/OVR-01_progressive-overload.md`, 2026-08-24) and is now four session-sized requirements, per that spec's own slice order. Unit ambiguity — the spec's "blocks everything" flag — is resolved by DATA-01: `weight_unit` per set log plus a profile default, in the baseline schema.

---

**Depends on:** ENV-03, DS-02
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
