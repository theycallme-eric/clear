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

## clear-design-system@0.5.0 — 2026-08-28
**Source:** Claude Design export, `CLEAR Design System (2).zip`
**Changed:** Imported the approved 0.5.0 baseline: public React components, typed props,
tokens, four skins, motion CSS, icons, specimen cards, templates, and the six-screen app kit.
**Why:** The specs were pinned to 0.5.0, but the reviewed artifact had never been checked into
the rebuild. This makes the design contract inspectable and reproducible from the repository.
**Code impact:** DS-01 through DS-08 and every UI requirement via `specs/design/ATOMIC.md` and
the visual-reference mappings in `specs/IA.md`.
