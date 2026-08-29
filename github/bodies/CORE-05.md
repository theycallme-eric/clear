> **CORE-05** · Layer `state` · Milestone `M0` · Carry-over `new`

**Spec:** `specs/design/ATOMIC.md` §9 · export `docs/patterns.md`

The design system already guarantees the component layer — visible focus on everything, selection carrying a tick rather than colour alone, native inputs so form participation and arrow keys are the platform's, announcements scaled to severity, ≥40px touch targets, contrast measured against rasterized pixels rather than asserted. **None of that is re-implemented here.**

What the export cannot know is anything that spans screens. That is this requirement: the small set of shared mechanisms every screen then uses, built once, before the first screen ships.

## Acceptance
- [ ] **Route-change focus.** On navigation, focus moves to the new screen's `<h1>` (or its main landmark) and the route is announced once via a polite live region. A keyboard user who navigates does not land back at the browser chrome, and a screen-reader user is told where they are
- [ ] **Skip link** to main content, visible on focus, first in the tab order
- [ ] **One `<h1>` per screen and no skipped levels.** A heading component takes its level from context so a section cannot silently render an `<h4>` under an `<h2>`; the E2E suite asserts the outline on every screen it visits
- [ ] **Landmarks:** one `<main>`, `AppHeader` renders the `<header>`, and any nav is a `<nav>` with an accessible name
- [ ] **Form-error focus.** On submit failure, focus moves to the first invalid control (export pattern 1). This is one shared submit helper, not a per-form habit
- [ ] **`prefers-reduced-motion` end state.** Every app-composed animation renders its final state immediately rather than being skipped mid-way — nothing waits on an animation to become interactive, and nothing disappears because its animation was disabled
- [ ] **`axe-core` wired into the E2E suite** (ENV-07) and failing the build on violations. Automated checks catch roughly a third of real problems; they are the floor, not the ceiling
- [ ] `lang` on `<html>`, a per-screen `<title>`, and a viewport meta that does not block zoom
- [ ] DEVELOPMENT.md documents the keyboard-only pass and the screen-reader pass as part of reviewing a UI issue

---

**Depends on:** ENV-01, DS-01
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
