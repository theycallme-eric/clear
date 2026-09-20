# CLEAR App — UI Kit

A pixel-faithful, interactive recreation of the CLEAR app flow. Components are cosmetic (not production code) but visually indistinguishable from the real app.

## Files

- `index.html` — Clickable prototype. Boot screen → Home → Generate → Workout Ready → Active Workout → Debrief.
- `AppShell.jsx` — Animated background layers + root container.
- `Primitives.jsx` — `ChamferedFrame`, `LeftColumn`, `Card`, `CTAButton`, `Chip`, `TextInput`, `Checkbox`.
- `Logo.jsx` — `ClearLogo` (wordmark with scanline) + boot scanline sweep.
- `Icons.jsx` — Solid geometric icon set used across screens.
- `Screens.jsx` — The 5 screens + the shared `PageHeader`.
- `App.jsx` — Root state machine + navigation.

## Running

Open `index.html` directly. Uses React 18 + Babel standalone from CDN, per the design system's JSX conventions.

## What's faithful

- Color tokens pulled from `../../styles.css`.
- ChamferedFrame implemented with the same SVG + clip-path double-width-stroke technique as the source.
- CTAButton composition: LeftColumn accent bar + ChamferedFrame body, overlapping by 2px.
- Atmospheric stack: 3 drifting blobs + dark overlay + grain + scanlines + pulse-micro animation.

## What's simplified

- No real AI generation (hardcoded sample workout).
- Timer counts down but exercise progression is scripted, not real.
- No auth, no Supabase, no favorites persistence.
