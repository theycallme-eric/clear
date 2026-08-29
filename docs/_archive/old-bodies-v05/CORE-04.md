> **CORE-04** · Layer `state` · Milestone `M0` · Carry-over `new`

Answers a question the rest of this document was leaving implicit: *what does the user see when something fails, is slow, or has no data?* Every data-driven view must define four states — **loading, empty, error, populated** — and a top-level error boundary must exist so a render crash never produces a blank screen.

## Acceptance

- [ ] A documented four-state contract every view implements: loading / empty / error / populated. No view is allowed to render nothing
- [ ] Top-level error boundary catches render crashes and shows a recoverable screen with a reload action — never a white page, never a raw stack trace
- [ ] Error views render an `AppError` (CORE-01): plain-language message, `requestId` when present, and a retry that actually re-runs the failed operation
- [ ] Empty is distinguishable from loading and from error — three different screens, never a spinner that silently means "nothing here"
- [ ] Slow operations show progress after a threshold rather than appearing frozen
- [ ] A test simulates each state for at least one representative view

---

**Depends on:** CORE-01
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
