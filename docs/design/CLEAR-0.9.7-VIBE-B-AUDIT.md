# CLEAR 0.9.7 VIBE-B reconciliation

Status: implementation audit for issue #272  
Authority: `src/design-system/` and `docs/design/exports/clear-design-system-0.9.7/`  
Package SHA-256: `12620dc5d9b6d7de965f25b80f86a90b8ee3e6a5eeea813eb1b85b0563d74790`

This pass reconciles Home, History, Favorites, and Session Detail with the final 0.9.7 ruling. Product behavior is frozen except for the already approved History-to-Review correction: a completed session that can be reconstructed under a supported contract opens directly in Review, while incomplete, unsupported, or otherwise non-reviewable records remain available through Session Detail.

## Final rulings

- The five-layer atmosphere and contained application shell remain shared route infrastructure.
- Home's Train Today and active-session surfaces remain semantic Cards. The screen's primary Generate or Resume action moves to the shared measured footer.
- Home's Recent/Favorites tabs sit in the full-width `TabBand`, not in a generic Card.
- History, Recent workouts, and Favorites each render as one `ListFrame` with inset `ListRow` separators. A row is not an independent Card.
- Empty collections are factual messages inside the same list frame that populated rows use. Empty-state and recovery actions, when present, use the measured footer.
- History filtering remains client-side over the loaded chronological window. Load-more still widens that window rather than changing filter semantics.
- Completed session rows attempt the stored intended-at-start reconstruction. A valid supported reconstruction opens Review with no generation request and no write. Other rows open Session Detail.
- Session Detail remains the durable information view for incomplete, unsupported, legacy, or explicitly addressed sessions. Its Restart action uses the same reconstruction path and the shared footer.
- Favorites preserve restore, progression, removal confirmation, and unsupported-snapshot behavior. This pass does not invent new favorite categories or ranking behavior.
- Future favorite exploration remains documented work, not an implicit behavior change in this visual reconciliation.

## Route audit

| Route/state | Before | 0.9.7 ruling | Behavior held constant |
| --- | --- | --- | --- |
| Home | Train Today contains the primary Generate action; tabs are inside a Card; recent and favorite entries are separate Cards | Semantic Train Today Card; Generate/Resume in measured footer; full-width tab band; one framed list per collection | active-session precedence, Quick Start, suggestions, week/rest logic, generation handoff |
| History | Each entry is a Card; filter-empty action and load-more action sit in scrolling content | One list frame with inset rows; filter-empty message occupies the list; recovery/load-more actions use the measured footer | filters, pagination, rest derivation, chronology |
| History row | Every session title links to Session Detail | Completed compatible records open Review directly; non-reviewable records use Session Detail | no generation call, no persistence write, supported-contract validation |
| Favorites | Each favorite is a Card in the tab panel | One list frame with inset rows and responsive shared action grouping | exact snapshot restore, saved-workout attribution, remove confirmation, unsupported copy |
| Session Detail | Restart and Favorite controls are nested in an action Card | Record content remains framed by meaning; Restart and Favorite controls use the measured footer | as-performed disclosure, restart validation/refusal, favorite write, legacy readability |

## Shared corrections

1. Make history and favorite domain rows render through `ListRow`, with their collection components owning the one `ListFrame`.
2. Keep row activation accessible while allowing the History journey to resolve Review versus Detail at activation time.
3. Let Home own the active-session query so its primary footer can switch between Generate and Resume without duplicating the read.
4. Keep recovery copy in the scrolling state while placing its available action in the footer.

## Evidence required

- Focused component tests for list composition, Home footer switching, History filtering/pagination, direct Review, Detail fallback, restart, and Favorites.
- Browser journeys for Home to Generate, Home/History to Review or Detail, Favorites to Review, and Session Detail recovery at narrow and wide widths.
- Keyboard traversal across the tab band, list rows, and measured footer with no occluded control.
- `lint:ds`, lint, typecheck, full unit suite, production build, and protected CI.

