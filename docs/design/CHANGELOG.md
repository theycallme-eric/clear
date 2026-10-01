# Design System Changelog

One entry per import. What changed, and why — the diff shows *what*, this says *why*.

Format:

```
## <version> — <date>
**Source:** Claude Design export
**Changed:** what moved, in design terms
**Why:** the reasoning
**Code impact:** which requirements or components this touches
```

---

## clear-design-system@0.9.7 — 2026-09-30
**Source:** Owner-supplied Claude Design export, `CLEAR Design System 0.9.7..zip`
**Archive SHA-256:** `12620dc5d9b6d7de965f25b80f86a90b8ee3e6a5eeea813eb1b85b0563d74790`
**Changed:** Imported the exact 0.9.7 project into both the immutable evidence directory and the
runtime vendor. The release adds public `FocusBrackets` and `ScrollRegion`, `Input.unit`, automatic
frame corner sizing, Full atmosphere on every screen, contained fixed-shell scrolling, closed
solid-ground frames, pinned phone actions, list/tab/action composition classes, and calibrated
focus, selection, timer, loading, and motion behavior.
**Why:** The application had drifted between a 0.6.0 vendor, local focus/atmosphere patches,
historical requirements, and newer Claude Design decisions. The owner designated 0.9.7 as the
final authority so product fidelity can be recovered from one reproducible contract.
**Code impact:** This import updates the active ATOMIC and IA contracts, design adherence rules,
version/API/gallery tests, and every UI route through the dependent shared-substrate,
contained-shell, and route-family vibe tasks (#268–#274). Storybook and a standalone system
repository remain deferred under #239.

## clear-design-system@0.5.0 — 2026-08-28
**Source:** Claude Design export, `CLEAR Design System (2).zip`
**Changed:** Imported the approved 0.5.0 baseline: public React components, typed props,
tokens, four skins, motion CSS, icons, specimen cards, templates, and the six-screen app kit.
**Why:** The specs were pinned to 0.5.0, but the reviewed artifact had never been checked into
the rebuild. This makes the design contract inspectable and reproducible from the repository.
**Code impact:** DS-01 through DS-08 and every UI requirement via `specs/design/ATOMIC.md` and
the visual-reference mappings in `specs/IA.md`.
