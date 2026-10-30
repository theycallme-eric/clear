# Motion restoration and scroll comparison

Issue [598](https://github.com/theycallme-eric/clear/issues/598), branch
`codex/library-motion-lab`, based on `c141aed`. Review at `/gallery/motion`.

The Motion Lab uses the nine pinned 0.14.3 effects on current shared components.
`src/dev/gallery-motion-patterns.ts` lists meanings and current consumer examples.
Replay and optional timing changes are local. The rules examples exercise the
app's actual interruption and one-loop helpers. Reduced-motion preferences are
respected; the additional still-preview control affects this page only.

## Scroll references

The earlier `uploads/CLEAR-REQUEST-contained-scroll.md` requests a 26px content
dissolve. The shipped ScrollRegion implementation, declaration and foundation
CSS explicitly specify hard clipping with transient edge streaks and no fade.
These are different source stages, not two names for the same effect.

The paired panels use the actual ScrollRegion, identical content and a linked
position control. Only the reference panel has a scoped 26 CSS pixel mask.
The pinned layers and shared streaks remain outside that mask. This comparison
does not choose a new app behavior. A chosen foundation change needs a separate
versioned implementation and affected-screen verification.

- `scroll-comparison-320.png` and `scroll-comparison-390.png`: default Clear skin,
  matching mid-scroll positions, from `e2e/gallery-motion.spec.ts`. These show
  the cutoff/fade; the live preview demonstrates the brief glow.
- `home/`: genuine synthetic Home captures from the existing
  `ui-polish-b05-scroll-boundaries.spec.ts` case, on clean source `c141aed`.
  Each JSON retains its actual viewport/source/pixel record. The test measured
  the header rule at luminance 71.1 at rest and 105.8 during scrolling, then
  verified settling. Home is composed with Screen's real ScrollRegion. There
  is no content dissolve. This checks that source with intercepted fixtures,
  rather than Eric's installed device, account or deployed release.

## Verification

The targeted browser suite covers all nine replays, keyboard timing/reset,
linked scrolling, aligned panels at 320/390px, four skins, interruption,
loop priority, reduced motion, accessibility, direct navigation/reload and
absence of account traffic. It runs against both development and built output.
Existing production dependency/font and source-bound audit checks remain in
use. Results and corrections are recorded in the journal and PR.
