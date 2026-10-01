# CLEAR 0.9.7 VIBE-C audit — Review, Workout, Summary

**Issue:** #273  
**Authoritative source:** `docs/design/exports/clear-design-system-0.9.7/`  
**Package SHA-256:** `12620dc5d9b6d7de965f25b80f86a90b8ee3e6a5eeea813eb1b85b0563d74790`

This pass applies the final 0.9.7 ruling to the workout journey. Generation, acceptance,
session lifecycle, logging, swaps, rest ownership, coaching, progression, completion, debrief
persistence, and favorite behavior are frozen. The work changes composition and presentation,
not those decisions.

## Authoritative rulings used

- Full atmosphere and the contained `ScrollRegion` shell remain universal.
- Every screen's primary forward action belongs in the measured pinned footer.
- Workout cards are closed frames; the optional accent column reads the card's own semantic
  surface and border.
- Review facts and Summary results use small framed readouts rather than one undifferentiated
  container.
- Active-workout progress is segmented. Rest is a framed operational state; its low state steps
  to urgency over 400ms, pulses to 80%, remains labelled, and announces the milestone once.
- No animation delays work. Reduced motion keeps the final state and removes decoration.
- Destructive Abandon stays away from the frequently used forward control.

## Differences found and disposition

| Surface | Before this pass | 0.9.7 ruling | Disposition |
|---|---|---|---|
| Review actions | Start and Regenerate scroll with the prescription | primary and alternate action in measured footer | move both to shared `PhoneFooter` / `ActionRow` |
| Review facts | four facts grouped in one large accent Card | compact individual framed readouts | use shared metric grid/frames; retain semantic `dl` |
| Review sections | closed Cards without the workout accent | workout product profile permits and uses the semantic accent Card | use the shared Card accent; preserve disclosure and suggestions |
| No-review recovery | deprecated `EmptyState`-owned action | factual message in content, action in footer | move Generate to the footer |
| Workout navigation | Previous/Next/Finish scroll after all blocks | forward navigation remains reachable at the hard edge | move navigation into the measured footer |
| Rest | inline unframed bar between blocks and navigation | framed timer state with labelled urgency and mechanical motion | move the shared rest surface into the measured footer, add semantic timer frame and one low-time announcement |
| Workout content | scroll and footer could compete for the final controls | measured footer must reserve its real height | rely on the public `ScrollRegion` measurement; keep logging/coaching in the single scroller |
| Summary result | duration, streak, and favorite grouped in one large Card | debrief stats each receive a small frame | use the shared metric frame for duration and streak; keep favorite as a distinct functional Card |
| Summary completion | Save and close scrolls with the form | primary completion action is pinned | associate the pinned submit button with the debrief form |

## Shared changes

The metric grid/frame and footer/action composition are shared vocabulary. Review and Summary
must use the same implementation so spacing, chamfer geometry, responsive columns, and future
system corrections cascade rather than becoming route-specific patches.

## Verification contract

- focused Review, Workout, Summary, composition, rest, and reduced-motion tests;
- Review → Workout → Summary → Home browser evidence on phone and desktop, including footer
  reachability and keyboard traversal;
- `npm run lint:ds`, `npm run lint -- --quiet`, `npm run typecheck`, `npm test`, and
  `npm run build`;
- protected preview E2E before merge.

## Verification outcome

- The deterministic real-data Review → Workout → Summary → Home walk passed on the phone and
  desktop projects. It uses a disposable Supabase user and persisted current-contract workout,
  performs the actual accept/start/complete/debrief writes, captures all three VIBE-C screens,
  checks accessibility, reaches the primary actions by keyboard, and proves each action remains
  inside the measured footer.
- The model-backed new-user core loop reached `generate-workout` twice (one phone request and one
  desktop request), and both deployed calls returned the typed `GENERATION_MODEL_ERROR` / HTTP 502.
  The test remains red and unchanged in meaning: fixture evidence does not replace evidence of a
  live model call. A stale locator found during that run was corrected because Goal now persists
  from onboarding and Generate asks only for the first unresolved Focus.
- `npm test`: 168 files, 3,169 tests passed. `npm run lint:ds`, quiet application lint,
  `npm run typecheck`, Playwright collection (334 tests), and `npm run build` passed. The build
  retains its existing chunk-size advisory.
