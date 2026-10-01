# CLEAR Design System 0.9.7 Reconciliation Audit

**Status:** authoritative comparison complete; implementation pending  
**Received:** 2026-09-30  
**Source artifact:** `CLEAR Design System 0.9.7..zip`  
**SHA-256:** `12620dc5d9b6d7de965f25b80f86a90b8ee3e6a5eeea813eb1b85b0563d74790`

## Authority decision

Version 0.9.7 is the current source of truth for CLEAR visual, interaction, and composition
decisions. Where the application, the vendored 0.6.0 package, ATOMIC, IA, old screenshots,
recovery notes, or local fixes disagree with 0.9.7, version 0.9.7 wins.

Frozen requirements and historical exports remain unchanged as evidence of earlier decisions.
They must be labelled or interpreted as historical rather than silently rewritten to appear
current.

This audit records the contract difference. It does not claim that the current application has
already been visually reconciled.

## Executive conclusion

The application is not merely one patch version behind. The current vendor is 0.6.0, while 0.9.7
changes the system's page composition, focus treatment, scrolling model, atmospheric treatment,
card construction, form layout, and several public APIs. Applying the archive as a stylesheet
swap would preserve important design drift.

The correct recovery order is:

1. import the exact 0.9.7 package and update the active written contract;
2. migrate shared application primitives and page chrome once;
3. reconcile routes by journey against those shared primitives;
4. perform a rendered, multi-viewport vibe audit and close remaining exceptions with evidence.

This order keeps the UAT corrections cascading where appropriate instead of accumulating one-off
screen fixes.

## Package comparison

| Area | Current application | Authoritative 0.9.7 | Required reconciliation |
| --- | --- | --- | --- |
| Version | Vendored 0.6.0 | 0.9.7 | Exact vendor import in both runtime and design evidence |
| Inventory | 519 files, 17 component directories, 40 card/specimen pages | 590 files, 19 component directories, 43 card/specimen pages | Update manifests, gallery expectations, and coverage |
| New components | None | `FocusBrackets`, `ScrollRegion` | Use the public components instead of local approximations |
| Input | No `unit` API | `unit` supported | Prefer the supported API for unit-bearing fields |
| Chamfered frame | Fixed corner sizes; legacy open-left patterns common | `cornerSize="auto"`; one bottom-right cut; glow ignored/deprecated | Migrate shared frame composition; stop teaching legacy patterns |
| Atmosphere | Route-specific quiet, full, and operational modes | Full atmosphere on every screen by default | Remove route-level intensity choices and compensation CSS |
| Focus | Local nested `:has(:focus-visible)`/focus-owner repair | One mounted `FocusBrackets`; text inputs light their own border | Replace the local patch and verify nested focus ownership |
| Scrolling | App-specific page scrolling and undocumented rules | Public `ScrollRegion` with fixed shell, hard edge, pinned transparent layers, transient streaks/scrollbar | Establish one shared phone scrolling contract |
| Cards | Open-left frame plus accent bar | Closed frame; optional attached 8px accent column; title inside | Fix the shared Card substrate before route work |
| Forms | Frequently placed in an enclosing frame/card | Fields directly on atmosphere | Remove unnecessary form wrapper panels route by route |
| Primary action | Varies by screen | Pinned phone footer via `.clr-footer` | Standardize journey actions without hiding content |
| Tabs | Local/tab-specific layouts | Full-width `.clr-band` | Use one shared tab-band pattern |
| Lists | Repeated individual surfaces | One `.clr-list` frame with inset row rules | Consolidate history and similar collections |
| Button groups | Local flex/layout rules | `.clr-actions` | Migrate shared action rows |
| Progress | Existing segment assumptions | 20 segments | Update component use and visual assertions |
| Selection marks | Mixed tick/check treatments | Solid inner block for checkbox/radio; Chip retains tick | Reconcile choice controls and snapshots |
| Motion | Older token set and local aliases | Stepped/linear system; hard-cut press; low timer dims/steps; scan loading | Remove stale aliases and verify reduced motion |
| Empty state | May include its own card/action composition | Plain message inside list frame; action in footer | Rebuild empty collections using shared structures |

## Explicit 0.9.7 composition rules

- Every border bleeds 2px. Only the primary action receives the 6px glow.
- Scroll streaks and the drawn scrollbar appear only while scrolling.
- Frames use a 2px border at 90% opacity, one bottom-right cut, and automatic 8/12/24px
  corner sizes based on height.
- A solid dark ground sits under frame tint. Atmosphere appears between frames, not through them.
- Surfaces use one 10% strength per role.
- Page forms sit directly on the atmosphere rather than inside a generic enclosing panel.
- Phone primary actions live in a pinned footer, tabs in a full-width band, and lists in one
  containing frame.
- Focus is visible and static. Selectable controls receive brackets; text fields light their own
  border. Focus decoration must not migrate to an ancestor Card.
- Contained vertical scrolling uses a fixed viewport and `ScrollRegion`; it does not use edge
  fades or opaque overlays to disguise clipping.

## Confirmed application drift

### Source and documentation

- `src/design-system` declares 0.6.0 and lacks `FocusBrackets` and `ScrollRegion`.
- The runtime vendor is not byte-identical to the saved 0.6.0 export: local focus repair changed
  `css/foundation.css`. That is useful evidence but also confirms that the vendor stopped being an
  immutable source artifact.
- `docs/specs/design/ATOMIC.md` is pinned to 0.6.0 and teaches rules superseded by 0.9.7.
- `docs/specs/IA.md` assigns quiet/operational/full atmosphere by route; 0.9.7 supersedes that
  matrix with Full everywhere.
- `docs/design/CHANGELOG.md` does not record the current 0.6.0 vendor state.
- Frozen 0.5.0/0.6.0 references remain valid historical evidence, but are not current guidance.

### Shared runtime substrate

- `src/app/atmosphere.ts` still chooses quiet or operational modes for most routes.
- `src/app/RootLayout.tsx` applies route atmosphere and an entry-form context used to compensate
  for the old intensity model.
- `src/styles/atmosphere.css` contains those local entry-form compensations.
- `src/ui/card.tsx` builds cards with an open-left frame and separate bar. The 0.9.7 contract is a
  closed frame with an optional attached accent column and the title inside.
- The app and its tests still reference `.clr-chamfer--focus-owner`; 0.9.7 replaces that local
  approach with `FocusBrackets`.
- Multiple files still use removed or superseded names: `--tracking-data-wide` and
  `.pulse-micro` (the supported class is `.clr-pulse-micro`).
- The adherence gate, design-system version tests, export counts, and gallery assumptions target
  0.6.0.

### Breadth of effect

The shared Card is used across authentication, onboarding, Home, generation, Review, Workout,
Summary, History, session detail, and Settings. Correcting it once is therefore a high-value
cascading change. Atmosphere, focus, fixed-shell scrolling, footer actions, bands, lists, and
action rows should be treated the same way.

Inline style objects are present across many route and UI files. They are not automatically
violations: token-driven dynamic measurements can be appropriate. The rendered audit must
classify them rather than mechanically delete them.

### Upstream 0.9.7 contradiction found during protected verification

The package's forced-colours prose and final media query say focus geometry returns to the
operating system. In bracket mode, however, the earlier `html[data-clr-focus="brackets"]`
suppression selector has greater specificity than the later forced-colours rule, so Chromium
computes no outline. The exact imported package remains byte-identical to the supplied archive.
The application restores the documented result in its later-loaded accessibility layer and hides
the decorative bracket layer while forced colours are active. This should be corrected in the
next source package rather than silently editing the 0.9.7 evidence.

## Reconciliation work packages

### DS-097-A — exact source import and contract sync

- Save the archive as the immutable 0.9.7 evidence export.
- Replace the runtime vendor with the exact package; do not hand-edit vendored files.
- Update active ATOMIC and IA guidance, design changelog, adherence configuration, manifests,
  gallery counts, version tests, and public API tests.
- Keep frozen requirements and older exports unchanged and explicitly historical.
- Prove vendor byte identity and run the existing design adherence gate.

### DS-097-B — shared visual and interaction substrate

- Mount one `FocusBrackets` instance and remove the local ancestor-focus patch.
- Set Full atmosphere as the default on every route and remove route-level compensation.
- Migrate removed token/class names.
- Rebuild shared Card, action rows, list shell, tab band, and phone footer primitives around the
  0.9.7 composition contract.
- Verify keyboard focus, reduced motion, narrow viewport behavior, and shared component tests.

### DS-097-C — contained application shell

- Establish the fixed application viewport and `ScrollRegion` ownership.
- Keep header/footer/tabs transparent and pinned without occluding content.
- Confirm the hard scroll edge, transient edge streaks, and transient drawn scrollbar.
- Verify safe-area, keyboard, and short/tall phone cases before migrating all routes.

### VIBE-A — entry, onboarding, generation, and Settings

- Reconcile Welcome, Sign in/Create account, Onboarding, Generate, and Settings.
- Forms sit directly on the atmosphere; step-specific content uses the authoritative frame rules.
- Preserve the recently corrected onboarding behavior while replacing local styling patterns.

### VIBE-B — Home and History journey

- Reconcile Home, History, Favorites affordances, and Session Detail.
- Apply one list frame, inset rules, tab band, and authoritative empty-state composition.
- Preserve the approved History-to-Review behavior.

### VIBE-C — workout journey

- Reconcile Review, Workout, and Summary.
- Apply pinned primary actions, authoritative Cards, rest/coaching/timer motion, and completion
  states without changing workout-generation semantics.

### VIBE-D — final rendered audit

- Exercise every route and primary journey at representative phone, tablet, and desktop widths.
- Compare typography, atmosphere, frame geometry, density, hierarchy, focus, scrolling, loading,
  empty, error, disabled, and reduced-motion states against 0.9.7.
- Record exceptions with screenshots and a reason; no undocumented local design dialects remain.
- Run route/journey E2E and the full protected verification set against the exact implementation
  commit.

## Dependency order

`DS-097-A -> DS-097-B -> DS-097-C -> VIBE-A/B/C -> VIBE-D`

VIBE-A, VIBE-B, and VIBE-C can run in parallel after the shared substrate is stable. VIBE-D is a
single reconciliation gate after all three land. This preserves parallelism without asking route
workers to invent competing versions of Card, focus, atmosphere, or scrolling.

## Verification evidence required

- Exact archive and runtime vendor hashes.
- Updated design-system version/API/adherence tests.
- Unit tests for shared Card, focus ownership, route atmosphere, fixed shell, ScrollRegion,
  footer actions, lists, tabs, and reduced motion.
- Browser evidence for each route group at narrow and wide viewports.
- Keyboard-only traversal with no ancestor focus leakage.
- Core account, onboarding, generation, Review, Workout, Summary, History, and Settings journeys.
- Final exact-head protected CI evidence.

## Deliberately deferred

- Extracting the design system into its own repository and adding Storybook remain valuable, but
  are tracked separately in #239. They are not prerequisites for making CLEAR conform to 0.9.7.
- New product behavior not defined by 0.9.7 or the active recovery requirements is outside this
  fidelity pass.

## Decision status

No owner decision is currently blocking the reconciliation. The supplied 0.9.7 archive resolves
the prior ambiguity about atmosphere, focus, scrolling, and composition. Any implementation
question that cannot be answered by 0.9.7 must be recorded as an exception instead of being
silently filled by a local convention.
