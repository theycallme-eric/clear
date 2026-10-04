---
name: clear-design
description: Use this skill to generate well-branded interfaces and assets for CLEAR (a low-tech sci-fi workout app), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Key files:
- `README.md` — Philosophy, content rules, visual foundations, iconography.
- `styles.css` — All design tokens + semantic element styles.
- `assets/` — Logo, favicon, custom icon set.
- `ui_kits/app/` — A clickable worked example, built only from the system's classes and rules. Copy patterns from here.
- `docs/decisions.md` — Every visual decision with the owner's reasons. **Read it before designing anything the README doesn't cover**, and extrapolate from the reasons.
- `docs/register-status.md` — Status of every design-system request (DS-001…009).
- `_source/` — Historical source from before the system. **Don't copy patterns from it**; it predates the calibrated rules.
