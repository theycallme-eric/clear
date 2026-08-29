repo: theycallme-eric/clear-app
branch: main

## Last sync

date: 2026-08-21T16:33:49Z

### Updated in this project

- Split tokens into a hue-agnostic foundation + swappable skin, so a second product reuses the bones.
- Built the motion layer from the app's real timings (`src/transitions.css`, `src/index.css`).
- Made the chamfered frame a real component — React + a portable CSS class.
- Added Motion Lab and Skin Swap cards for tuning interactions live.

## Screen map

| Project file | Built from |
|---|---|
| `css/foundation.css` | `src/index.css` (token layer) |
| `css/motion.css` | `src/transitions.css`, `src/index.css` (keyframes ~1135–1240) |
| `css/skin-clear.css` | `src/index.css` (palette primitives), `docs/frontend/figma-design-tokens.json` |
| `components/ChamferedFrame/` | `src/components/ChamferedFrame.tsx` |
| `assets/ClearLogo.tsx` | `src/components/ClearLogo.tsx` |
| `_source/` | `src/components/**` (read-only reference import) |
| `ui_kits/app/` | `src/pages/**`, `src/components/**` |
| `README.md` | `docs/design-philosophy.md` |
