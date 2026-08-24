> **ENV-03** · Layer `infra` · Milestone `M0` · Carry-over `port`

Vercel: preview deploy per PR, production on push to `main`. SPA rewrites so deep links survive refresh. Port `vercel.json` conventions from the old repo.

## Acceptance

- [ ] Every PR gets a working preview URL
- [ ] Merge to main is live at the production URL without manual steps
- [ ] Refreshing a deep link (e.g. `/history`) does not 404
- [ ] Required env vars documented in `.env.example`

---

**Depends on:** ENV-01
**Blocks:** PWA-01

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
