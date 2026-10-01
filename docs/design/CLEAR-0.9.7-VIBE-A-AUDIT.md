# CLEAR 0.9.7 VIBE-A reconciliation

Status: implementation audit for issue #271  
Authority: `src/design-system/` and `docs/design/exports/clear-design-system-0.9.7/`  
Package SHA-256: `12620dc5d9b6d7de965f25b80f86a90b8ee3e6a5eeea813eb1b85b0563d74790`

This pass reconciles the entry, authentication, onboarding, generation, generation-loading, and Settings experiences with the final 0.9.7 ruling. Product behavior is frozen: the pass may change composition, shared layout, spacing, state presentation, and control placement, but it may not change route transitions, persistence, generation inputs, recommendation rules, or recovery behavior.

## Final rulings

- The five-layer atmosphere remains visible on every route.
- A normal data-entry form is not a card. Fields and supporting copy sit directly on the atmosphere.
- A card or framed list is reserved for a semantic grouped surface, not used as generic page padding.
- The screen's primary action uses the public pinned-footer pattern and the measured `ScrollRegion` foot slot. Content must stop above it rather than pass underneath it.
- Phone action groups stack with the primary action first. At 560px and wider, actions become equal-width and the primary moves to the right.
- Loading uses `ScanLoader` and real stages only. It does not use a spinner, fake percentage, or time-based fake progress.
- The existing entry surface on Welcome remains one semantic framed choice between Sign in and Create account. This is an approved product composition, not a generic form wrapper.
- The onboarding confirmation is a related collection and therefore uses the shared list frame and inset rules. Onboarding questions themselves remain unframed.
- Settings editors are direct sections on the atmosphere. Navigation and session destinations use one shared framed list rather than a separate card per row.
- The 0.9.7 hard-edge contained-scroll rule supersedes the earlier dissolve/fade proposal.

## Route audit

| Route/state | Before | 0.9.7 ruling | Behavior held constant |
| --- | --- | --- | --- |
| Welcome | One framed entry surface; actions stacked manually | Keep the semantic frame; use the shared responsive action row | Both auth paths and their destinations |
| Sign in / Create account | Form inside a generic card; primary action scrolls with fields | Direct form; primary submit in measured pinned footer; secondary verify actions share the footer | Email/code validation, resend countdown, session handoff, create intent |
| Onboarding | Every step inside a card; navigation at the bottom of the card | Direct question content; navigation in measured pinned footer; confirmation as one framed list | Five-step order, draft retention, atomic commit, cache seeding |
| Generate | Entire composition inside a card; Generate button at the end of content | Direct form; Generate in measured pinned footer | standing Goal, Focus recommendation/override, Recovery, deload, validation, request payload, loading handoff |
| Generation loading | Cancel action mixed into scrolling loader content | Loader remains direct; Cancel in measured pinned footer | real stages, slow state, retry toast, cancellation semantics |
| Settings | Every editor and destination is its own card | Direct editor sections; one shared framed list for destinations/session | optimistic saves, rollback, constraints, appearance, navigation, sign-out |

## Shared corrections

1. Adapt `.clr-footer` when it is mounted inside `ScrollRegion`'s measured foot so the two public patterns do not draw duplicate rules or negative margins.
2. Make public `Button` bleed wrappers participate correctly in `.clr-actions`, including full-width phone controls and primary-right ordering at wider sizes.
3. Use `PhoneFooter`, `ActionRow`, `ListFrame`, and `ListRow` rather than route-local layout approximations.

## Evidence required

- Focused component tests for changed composition and unchanged behavior.
- Browser journeys for Welcome/auth, every onboarding step, generation, loading, and Settings at narrow and wide viewports.
- Keyboard reachability with no field, validation message, or action hidden by the pinned footer.
- `lint:ds`, lint, typecheck, full unit suite, production build, and protected CI.

