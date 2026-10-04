repo: theycallme-eric/clear-app
branch: main

## Last sync

date: 2026-09-19T00:00:00Z
release: 0.6.0

### Updated in this project

- `0.6.0`: added `OverflowRail` so peer destinations stay reachable under width pressure; `TabBar` composes it.
- `0.6.0`: `Input` now shrinks inside constrained flex and grid parents instead of forcing its parent wide.
- `0.6.0`: README split into universal guidance and a labelled workout-application product profile.
- Earlier: foundation/skin token split, motion layer from the app's real timings, chamfered frame as a real component.

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
| `components/OverflowRail/` | none — authored in this project for DS-001 |

## Sync history

- 2026-08-21T16:33:49Z — initial import and layer restructure (covers CHANGELOG `0.1` and `0.2`).
