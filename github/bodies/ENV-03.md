> **ENV-03** · Layer `infra` · Milestone `M0` · Carry-over `port`

**Spec:** — self-contained; acceptance criteria are the full specification

Vercel: preview deploy per PR, production on push to `main`. SPA rewrites so every route falls through to `index.html` and deep links survive a refresh — that rewrite is the whole convention; nothing needs to be consulted from the archived repo.

## Acceptance
- [ ] Every PR gets a working preview URL
- [ ] Merge to main is live at the production URL without manual steps
- [ ] Refreshing a deep link (e.g. `/history`) does not 404
- [ ] Required env vars documented in `.env.example`

---

**Depends on:** ENV-01
**Blocks:** PWA-01

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
