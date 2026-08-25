> **GEN-05** · Layer `ui` · Milestone `M1` · Carry-over `port`

**Spec:** `specs/design/ATOMIC.md` §5, §10 · export `docs/patterns.md` pattern 2 · `specs/screens/loading-screens.md`

> **Rescoped by the design system.** `ScanLoader` ships — scan sweep, boot-staggered rows,
> `status: ok | slow | failed`, a polite live region with `aria-busy`, `aria-hidden` log
> lines, and a reduced-motion static state. The prototype at
> `specs/screens/loading-screen-prototype.html` is now **reference for the copy sequence
> only**; its markup and motion are superseded. Do not port bespoke loading markup.

Compose the generation loading screen from `ScanLoader` with the staged status copy and a
cancel action, at `data-atmosphere="full"`.

## Acceptance
- [ ] Built from `ScanLoader`; no bespoke spinner, skeleton or loading markup anywhere in the app
- [ ] Visible for the full mutation; stale results ignored after cancel/unmount
- [ ] `status` reflects reality — `slow` at the documented threshold, `failed` on error; never decorative
- [ ] No `value`/`max` passed unless progress is genuinely known
- [ ] Status copy is terse-imperative per voice rules; the slow message states the fact and does not apologise or joke
- [ ] Failure hands off to pattern 3 (recoverable failure) — a negative toast with exactly one retry action, never a dead end

---

**Depends on:** GEN-03, DS-06
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
