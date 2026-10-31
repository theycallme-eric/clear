# CLEAR workout review: shared layout revision

31 October 2026. This isolated proposal applies Eric’s R24–R29 feedback and the selected right-hand B05-04 hierarchy. The left side remains the released baseline `94f2c2f`; it is labeled as a baseline, not a claim about later releases. The right side uses the actual revised app components.

Seven areas, 40 selectable examples and 80 current/proposed panes. Use each Example menu; both phone views work independently and can open separately. Start with:

1. **Review & weight guidance:** prominent movement name, separate prescription and quiet equipment, Swap beside the name, compact group badge, no inner rail, separators only between movements. The same MovementIdentity/MovementList implementation serves Review, live blocks and saved detail.
2. **Workout & logging:** choose Superset entry or Circuit. Open the single bottom Coaching and notes disclosure. Movement notes keep separate drafts and writers. Try logging a round, minimizing and reopening rest.
3. **Setup & Generate:** pinned title/progress with one divider below; Focus value opens the existing choices; Overview facts wrap rather than scroll horizontally.

The other areas remain available for ongoing design feedback. Synthetic guide, rough-load and training-progress inputs still need production read/persistence/default contracts. The shorter setup flow and settings visibility remain proposals. This preview is not approval to merge the whole design branch.

Canonical owners: `src/ui/movement-presentation.tsx`, `src/ui/block-renderers-frame.tsx`, `src/ui/exercise-coaching.tsx`, and the existing Review/session-detail controllers. The real gallery contains MovementIdentity, MovementList and MovementIdentityComparison. `docs/design/library/COMPONENTS.md` is generated from the one registry. See SOURCE.json for the exact proposal source.

After visual review, carry the accepted component and gallery references into ordinary requirements. Preserve distinct Review, live logging and saved-result behavior. The broader candidate is not production-ready until its remaining data contracts are resolved.

Verification: 409 selected unit tests, 80 rendered panes and 69 focused checks passed. Seven automated accessibility samples had no violations; typecheck, app/preview builds and design lint passed. Changed-source lint has zero errors and 135 existing/export Fast Refresh warnings.
