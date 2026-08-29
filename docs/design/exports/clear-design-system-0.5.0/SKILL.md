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
- `ui_kits/app/` — Clickable HTML recreation + reusable JSX components (ChamferedFrame, CTAButton, Chip, Card, etc.).
- `_source/` — Original component source code (read-only reference).
