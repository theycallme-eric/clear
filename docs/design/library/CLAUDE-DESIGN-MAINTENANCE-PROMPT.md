# Prompt for maintaining the older Claude Design project

Copy the text below into Claude Design. This is a maintenance handoff from the
current CLEAR repository and gallery, not a request to make Claude the authority
for future application changes.

---

Maintain this older CLEAR Design project using the approved/current repository
work below. Eric has clarified that the CLEAR repository and executable gallery
are the source of truth going forward. This Claude Design project is maintained
for older files and references. Do not make the application wait for an export
from this project or overwrite current application work with older patterns.

## Read the current references

Repository: `theycallme-eric/clear`.

- `docs/design/library/README.md`: current ownership, reuse and gap-request rules.
- `docs/design/library/PLAN.md`: the bounded active delivery plan.
- `src/dev/gallery-registry.tsx` and generated `docs/design/library/COMPONENTS.md`.
- `src/dev/gallery-motion.tsx`, `gallery-motion-patterns.ts` and the loaded styles.
- Review stack: PRs 593, 595, 597 and 599. These are review/integration work;
  do not assume they are merged or released. Check their actual status.
- Preview: https://clear-git-codex-library-motion-lab-erics-projects-0ade0dda.vercel.app/gallery/motion

Use current repository implementation when you have access. If a source is
unavailable, identify the missing file rather than substitute an older visual.

## Approved scroll direction

Eric selected **CRT content dissolve with visible edge glow**. He liked the glow
and then requested a 15% shorter dissolve. The selected dissolve distance is
**22.1 CSS pixels**, reduced from the older request's 26px. The glow was not reduced.

- Dissolve content at the top and bottom edges of the scrolling viewport.
- Keep measured pinned header/footer layers outside the mask and transparent
  to the surrounding atmosphere. Preserve the existing nonzero measurement,
  font/resize update and bounded-retry safeguards.
- Preserve sufficient content inset for the first and last entries to be fully
  readable at rest. Keep vertical scrolling contained and prevent sideways drift.
- Existing edge streak: opacity **0.7**, **7px** role-colored box-shadow while
  scrolling; settle **420ms** after the last event. The drawn scrollbar uses the
  corresponding shared feedback. Use semantic colors, not fixed orange or blue.
- Reduced motion: static indicator at **0.5**, with no glow or transition.
- The gallery's Hold glow for inspection control is a review fixture. It does
  not mean that normal app scrolling should glow permanently.

There is a verified timing bug in the older public ScrollRegion implementation:
production CSS can serialize `420ms` as `.42s`, but `parseFloat()` alone treats
that as 0.42 milliseconds. Normalize seconds to milliseconds before passing the
delay to `setTimeout`; retain the established fallback for missing/invalid values.
Test the actual component with both `420ms` and `.42s` and confirm that its signal
remains active until the intended delay. CLEAR issue600 tracks shared integration.

The current gallery normalizes that token locally for preview. The selected
appearance is authoritative, but do not claim that production Home or every app
consumer already has this correction. Runtime integration is tracked separately.

## Motion vocabulary and usage

Preserve and demonstrate all nine existing patterns: Scan sweep, Glitch, Signal
loss, Boot stagger, Tumble, Phosphor decay, CRT off, Interlace and Trace.
Use the existing keyframes, duration, step and stagger vocabulary.

Match effects to meaning: loading/reading, one-shot failure, signal loss,
collection arrival, changing number, dismissal, explicit power-off, state re-sync
and frame arrival. Signal loss and CRT off were available vocabulary with no
current application consumer found; availability is not blanket approval to use
them everywhere. Keep hover/press/selection/focus behavior consistent with the
shared controls. New state interrupts an entrance rather than waiting for it.
Coordinate one interface loop, prioritizing urgent state over busy/ambient;
background atmosphere remains the documented exception. Reduced motion shows
readable static/end states without delaying interaction.

The restored lab uses actual components, replay controls and local timing/step
experiments with Reset. These experiments do not change global app settings.

## App-owned typography and shared presentations

The application consolidated a repeated metadata text role in
`src/styles/text-roles.css`:

- `clr-text-data-xs`: font-data, label-xs-size, tracking-data, text-card-label,
  zero margin; weight, line height and casing otherwise inherit.
- `clr-text-data-xs--upper`: explicit uppercase metadata.
- `clr-text-data-xs--quiet`: secondary text color.

Consumers include Review, History, Favorites, Favorite progression, load
suggestions and saved session detail. Preserve intentional larger titles,
prescriptions, numbers, glyph colors, warnings and owner-specific layout.
This is one shared recipe, not a universal inline-style ban.

ReviewExerciseRow was extracted into shared app UI so the gallery renders the
same row as Review. Two comparisons show real owners:

- WorkoutEntryComparison: History's completed session and Favorites' saved workout.
- MovementIdentityComparison: Review's movement row, live workout movement
  presentation and saved detail with its real disclosure/results table.

Keep prescription, logging, restart/removal and recorded-result behavior with
their respective owners. Do not merge these state machines into one component
or turn historical outcomes into current targets. These product compositions
can be documented as consumer examples; do not force workout-specific behavior
into generic design-system API.

## Gallery and agent workflow

The app now has a reviewable public-gallery implementation at `/gallery` and
`/gallery/app`, plus `/gallery/motion`. It uses the same implementations and
styles as the application, with safe synthetic examples and no CLEAR account
startup. Preview-host deployment protection is a separate hosting concern.

Navigation separates All components, History and Favorites, Movement across
workout screens, and Motion and behavior. Explanatory copy keeps its screen
gutters while specimen frames preserve their intended widths.

The existing registry is the component inventory; COMPONENTS.md is generated
from it. AGENTS.md routes UI work to the library README, registry and shared UI.
Search and reuse first. A new gap records the need, existing options checked,
smallest extension, shared owner/consumers and an actual-component preview.
For motion, name the pattern, trigger/state change and reduced-motion outcome
in the ordinary requirements/issue/PR. Design in isolated branches, approve
material visuals, then carry the same implementation through requirements,
DAG tasks and verification. Do not recreate it from a loose description.

The original 0.14.3 import/export remains historical, byte-identical evidence.
Its 43 archive pages are development references, not blanket visual approval
or public recommended components. Keep `_source/` historical. Do not create a
second catalog, framework, approval-state machine or parallel source of truth.

## Preserved Phosphor Echo direction

The selected round-3 source/preset is preserved under
`docs/design/library/intake/phosphor-echo/`:

- Opacity **29%**, softness **3.2 CSS px** Gaussian standard deviation.
- Offset **4.7px left**, **5.64px down** (displayed as 5.6px).
- One shared ghost-only filter: use the full filled silhouette, blur/offset/
  attenuate it, then subtract the original unshifted foreground footprint.
- Keep the foreground sharp and its transparency intact. Rear pixels must not
  show through translucent foreground interiors at the top/right.
- Inherit the associated semantic role color. Apply to eligible outer heading,
  back-button, Card and CTA frames; no independent echo on nested content,
  the back arrow or CTA label. Keep SVG icon geometry clean.

This is a selected static decorative input, not an animation or an effect that
has already been enabled app-wide. Actual-component placement still needs its
scoped integration/review. The isolated screen is a rendering reference, not
application source to copy wholesale. Earlier verification used an initial
preset; do not relabel it as proof of the selected preset on current components.

Eric identified Augmented UI as the closest aesthetic reference from the
shortlist. Record that direction without installing it or replacing CLEAR's
components merely to match the reference.

## Return

Make the relevant maintenance updates in this older project. Report changed
files, what now matches the repository/approved direction, and any gaps you
could not verify. Label historical material clearly. Do not claim current app
deployment, publish a release, or propagate this project's older files back
into the CLEAR repository without a separate request.
