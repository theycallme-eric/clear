> **SET-01** · Layer `ui` · Milestone `M2` · Carry-over `rebuild`

**Spec:** `specs/IA.md` — Settings screen contract

Hub with: goal preset, enabled sections (structure customization), limitations text, **skin selection**, sign out.

> **The skin picker is a wrapper, not an implementation.** `skin.js` ships the whole persistence contract: `localStorage['clear.skin']` → `prefers-contrast: more` → the app default, with an explicit user choice always winning — including choosing a colour skin while the OS asks for more contrast. Read the skin list from `SKINS`; do not hardcode one.

## Acceptance
- [ ] Each change persists and is reflected in the next generation payload
- [ ] The picker lists every skin in `SKINS` — adding a skin to the export adds an option with no code change
- [ ] Selection calls `setSkin()`, flips live across every screen, and survives reload
- [ ] A "system" option calls `setSkin(null)`, restoring `prefers-contrast` following
- [ ] Mono is labelled **enhanced contrast**, never "accessible" — the other three are not less accessible
- [ ] The favicon matching the active skin is set (favicons cannot read tokens)
- [ ] Sign out clears caches and lands on Welcome
- [ ] Section toggles respect goal constraints (e.g. active recovery's fixed sections)
- [ ] **Every choice made during onboarding is editable here** — experience, goal, sections, limitations, locations, equipment. Onboarding is strictly first-run and is never re-entered

---

**Depends on:** AUTH-03, DS-01
**Blocks:** SET-02

<sub>Generated from `requirements/REQUIREMENTS.md` v0.5 — edit the requirement, not the issue.</sub>
