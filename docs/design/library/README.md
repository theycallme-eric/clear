# CLEAR visual library

The public entry is `/gallery`. `/gallery/app` renders the same registered app
components as the development gallery. `/gallery/ds` shows original 0.14.3
archive specimens labeled as upstream references. These are distinct style
contexts; upstream illustrative content is not current app behavior or blanket
visual approval.

## Source and ownership

Canonical app presentation remains in `src/ui/`, with route/state owners in
`src/app/` and `src/state/`. Both entries use the existing register and renderers
in `src/dev/`. A later organization change must move that owner rather than
create competing copies.

`src/main.tsx` loads the public style entry and all app styles once in their
existing order. `AppEntry` lazily selects the library or product runtime. Only
`/gallery` and its path segments select the public library. It mounts no auth,
BootGate, active-session prompts, data clients or test providers. The product
runtime retains its existing provider/cache hierarchy.

Examples use real components with existing synthetic display data and state
controllers. Skin changes use `persist: false` and do not overwrite the person's
device preference. Toast/dialog/timer examples remain interactive.

## Immutable upstream references

The owner-supplied 0.14.3 runtime/evidence copies remain byte-identical and
immutable. `scripts/gallery/specimen-assets.ts` publishes the 43 review pages
and actual static dependencies at `/gallery-reference/0.14.3/`, preserving
relative paths and bytes. It does not publish the entire archive, historical
`_source`, uploads, templates, repository files or test helpers.

Public upstream frames allow scripts in an opaque sandbox; they cannot read
app storage or the parent document. Original CDN React/font dependencies and
offline fallback remain the archive's behavior. Compiled app/gallery fonts
remain self-hosted. Version upgrades require a reviewed import and identity
checks, never patches to mirrored vendor files.

The first actual mobile scan found archive defects: FormField's example input
has no accessible label, and OverflowRail's example tab references a missing
panel. These are upstream findings, not current-app approval or waivers. The
public-reference browser case retains the failures until an explicit resolution
preserves the archive/ownership contract. Gallery-owned reference rails provide
a named keyboard focus target through the existing `trackProps` API.

The service worker leaves `/gallery-reference/` on the network path. A reference
iframe must never replace the cached app document used for offline product
navigation. App navigation and fingerprinted app assets retain their policies.

## Review and promotion

Design experiments use isolated branches and previews. Current/proposed views
state source and named fixtures/states. Approve the actual shared implementation
before requirements and DAG integration, then carry source and consumer evidence
forward. Merge and production release are separate events. This first slice
labels a source snapshot; branch/deployment does not imply visual approval.

Search existing components and variables first. If insufficient, record the need,
options considered, smallest extension, preview, owner and downstream impact.
Obtain the applicable design decision before requirements consume a new contract.

## Coverage and next work

The released audit mapped 88 app UI exports. The shared gallery currently has
49 entries and 131 initial examples: 48 directly registered exports plus the
contextual Input specimen. Important session surfaces still need 25 planned owner
fixtures. Fourteen owner/context exemptions and one dormant export are classified
separately; these counts are not complete state or visual approval.

Next slices add stable IDs/source-status navigation, safe Workout/logging/timer
fixtures, the existing superset pilot, handoff and maintenance checks. Cover
MovementCountdownView and SetLoggingSheetOverlay through their real owners.
Preserve released Rest entry/internal Log and floating-sheet behavior; do not
restore the older pinned-foot/log-entry pattern.

Foundation authoring ownership is a separate decision. Using the pinned package
here does not depend on the deferred external repository/Storybook initiative239.

## Planning authority and evidence

- [Review guide: released UAT and gallery review](REVIEW-GUIDE.md)
- [Workout-prompt/experience agent handoff](WORKOUT-EXPERIENCE-PILOT.md)
- [North Star plan](https://chatgpt.com/space/page_48193bb4d7dc8191b9e4e55f837fee89)
- [Released inventory and accuracy report](https://chatgpt.com/space/page_815f7176f3248191a07acf770c485f5a)
- [Ownership and public gallery specification](https://chatgpt.com/space/page_aad0a08cae6c819196b34d1a47a10e48)
- [Fixtures and operating contract](https://chatgpt.com/space/page_63ae8eab69488191a7a9576ca2c06235)

`src/gallery/public-gallery.test.tsx` checks actual public routing and controls.
`src/dev/production-gallery.test.ts` inspects real build dependencies and emitted
upstream bytes. Existing registry/API/identity/font/accessibility checks remain
relevant. Browser proof uses the built entry and actual styles, not test render
providers.
