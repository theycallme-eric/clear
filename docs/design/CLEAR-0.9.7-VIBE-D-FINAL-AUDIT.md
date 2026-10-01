# CLEAR Design System 0.9.7 — Final Application Audit

**Status:** implementation and local evidence complete; protected exact-head verification pending  
**Authority:** `CLEAR Design System 0.9.7..zip`  
**Source SHA-256:** `12620dc5d9b6d7de965f25b80f86a90b8ee3e6a5eeea813eb1b85b0563d74790`  
**Starting application head:** `910d830071f0` (VIBE-C, PR #280)  
**Tracking issue:** #274

## Ruling

CLEAR Design System 0.9.7 is the final authority for this pass. The application does not blend
the archive with 0.6.0, old screenshots, ATOMIC's historical rules, or route-local conventions.
The exact imported vendor remains immutable. Application code may repair a verified upstream
accessibility defect, but that repair must be named below rather than silently changing the
evidence package.

The source/package comparison is recorded in
`docs/design/CLEAR-0.9.7-RECONCILIATION-AUDIT.md`. DS-097-A through VIBE-C completed that migration.
This document records the final rendered and source-level audit after those route passes landed.

## What VIBE-D found and corrected

1. **Tablet was not a first-class browser lane.** A tablet-sized resize existed inside one shell
   test, but the application routes and journeys only had phone and desktop projects. Playwright
   now has a 768 × 1024 Chromium touch-tablet project with coarse pointer and no hover. The normal
   preview run therefore exercises phone, tablet, and desktop.
2. **A few application consumers retained the old actionable-empty-state composition.** Places &
   Equipment and exercise-swap failure handling still put recovery actions inside `EmptyState`.
   Recovery actions now use the shared error composition, and the Places primary action lives in
   the measured footer. A source test prevents actions from returning to `EmptyState`.
3. **Deprecated vocabulary could return without a focused failure.** A production-source gate now
   rejects removed 0.9.7 class/token/API names, legacy orange/blue aliases outside the skin
   definition, and actionable `EmptyState` usage. This complements the vendored adherence lint;
   it does not modify the source package.
4. **Rendered evidence was transient and hard to associate with a build.** The representative
   journeys now save named VIBE screenshots. Preview and deployed E2E upload them under an artifact
   name containing the exact deployment SHA, retained for 14 days.
5. **Root toasts could cover pinned actions.** The failure toast and the measured footer were both
   correct in isolation, but their independent bottom placement overlapped at all three widths.
   The root toast host now reads the rendered footer edge and clears it, including wrapped actions
   and visual-viewport changes. The correction applies to every toast and route.

All five changes are shared test/composition corrections. None introduces a new product feature.

## Route and journey evidence

Every production route is visited in all three browser projects. Signed-in states are then walked
through the real or deterministic journey that owns them.

| Surface | Phone | Tablet | Desktop | Evidence |
| --- | --- | --- | --- | --- |
| Welcome; Sign in; Create account | Pass | Pass | Pass | app-shell route, atmosphere, font, card/direct-form, and screenshot checks |
| Onboarding | Pass | Pass | Pass | five-step question/footer walk plus question and confirmation screenshots |
| Home | Pass | Pass | Pass | ordered hierarchy, empty active-session ruling, tabs, footer, screenshot |
| Generate | Pass | Pass | Pass | standing Goal, unresolved Focus, direct form, contained scroller, measured footer, screenshot |
| Loading and generation failure | Pass | Pass | Pass | held typed request proves the transient screen, honest failure, recovery toast, and pinned-action clearance without spending a model call |
| Review | Pass | Pass | Pass | Supabase-backed History restart and screenshot; pinned Regenerate/Start actions |
| Workout | Pass | Pass | Pass | Supabase-backed start/log/finish journey and screenshot; coaching/rest/navigation containment |
| Summary | Pass | Pass | Pass | Supabase-backed completion/debrief/Home return and screenshot |
| History; Favorites | Pass | Pass | Pass | live list/filter/review routing, screenshot, and persisted Favorite behavior |
| Session Detail | Pass | Pass | Pass | live non-reviewable detail plus cross-user error state and screenshot |
| Settings | Pass | Pass | Pass | direct settings composition, selection states, appearance journey, screenshot |
| Places & Equipment | Pass | Pass | Pass | live create/edit/default/delete/reload journey and screenshot |
| Not Found | Pass | Pass | Pass | route, heading, title, accessibility, reduced-motion checks |

The deterministic Review → Workout → Summary → Home walk uses the real Supabase persistence
boundary but does not spend a model call. The model-backed core loop remains an independent release
signal; see **Open non-visual release signal** below.

## State and interaction matrix

| Contract area | Result | Evidence |
| --- | --- | --- |
| Typography | Pass | Rajdhani/Oxanium/Space Grotesk load from the application origin with no font layout shift |
| Full atmosphere | Pass | all colored layers remain materially visible on entry and route screens at every width |
| Frame geometry and density | Pass | closed frames, automatic chamfer sizing, attached accent columns, compact metric frames, and source adherence lint |
| Hierarchy | Pass | screen headings, card order, one-list containment, tab bands, result grids, and action placement are asserted in route-family journeys |
| Focus | Pass with one documented upstream exception | all four skins, auth, settings, keyboard order, text-field ownership, brackets, and forced-colours recovery |
| Contained scrolling | Pass | one scroll owner, hard edge, transient streak/bar, fixed transparent layers, short phone, visual-viewport reduction |
| Pinned layers | Pass | onboarding, Generate, Review, Workout, Summary, Home, and Places actions remain outside and clear of the scroller |
| Loading | Pass | held request screenshots, ScanLoader state tests, reduced-motion checks, and live core-loop observation |
| Empty | Pass | Home, History/Favorites, Review/Summary recovery, Places, and source prohibition on actions inside `EmptyState` |
| Error | Pass | shared `ErrorView`, retry action outside empty composition, cross-user detail failure, typed generation failure, and root-toast footer clearance |
| Disabled | Pass | onboarding/Generate gates and workout navigation; controls remain visible and inert |
| Selected | Pass | checkbox/radio/chip states, tab state, Goal/experience/skin choices, focus ownership |
| Reduced motion | Pass | every production route reaches its final state immediately under the real media preference |

## Necessary exception ledger

### Forced-colours focus specificity in the immutable 0.9.7 package

- **Route/state:** all routes; keyboard focus while `forced-colors: active`.
- **Screenshot:** `vibe-d-forced-colours-exception.png` in the exact-SHA VIBE audit artifact.
- **Reason:** the package prose and final media rule say focus geometry returns to the operating
  system, but the earlier bracket-mode suppression selector has greater specificity. Editing the
  vendor would break archive identity. The later-loaded application accessibility layer restores
  the documented operating-system outline and hides decorative brackets only in forced colours.
- **Approval:** retained from the approved 0.9.7 reconciliation decision: preserve the exact
  package, repair the verified accessibility result at the application layer, and raise the source
  defect for a future package rather than inventing a different visual rule.

There are no route-specific visual exceptions and no approved local design dialects.

## Source drift guard

Production code under `src/app`, `src/ui`, and `src/styles` is checked for the retired vocabulary
that was found during the 0.6.0 → 0.9.7 comparison, including legacy frame openings, glow helpers,
old tracking/surface/chamfer tokens, unprefixed motion helpers, local `hasLeftBorder`, old color-role
aliases, and actions embedded in `EmptyState`. The exact vendor is excluded intentionally because
its compatibility surface is evidence, not application usage.

This source check is deliberately narrow. The authoritative design adherence lint remains the
broader rule set for raw values, allowed components, and token usage.

## Local verification

- deterministic visual/interaction matrix: **168 passed, 6 expected project-specific skips**;
- live Places & Equipment CRUD, phone/tablet/desktop: **3 passed**;
- live History/Favorites/Review/Workout/Summary/Detail, phone/tablet/desktop: **18 passed**;
- VIBE-D full unit suite: **169 files / 3,173 tests passed**;
- design-system lint, application lint, typecheck, and production build: **passed** (the existing
  bundle-size advisory remains non-blocking);
- Playwright collection: **510 tests in 14 files**;
- protected checks: recorded on the pull request and exact-head CI run after this document lands.

## Open non-visual release signal

The real model-backed core loop currently reaches the deployed `generate-workout` function and
receives typed `GENERATION_MODEL_ERROR` / HTTP 502 responses. Phone and desktop reproduced the same
provider-boundary failure during VIBE-C. The deterministic real-data lifecycle passes, so this is
not evidence of a route-fidelity defect; it is still a release blocker for a usable generated
workout. The live assertion remains enabled and has not been replaced by a fixture or weakened.

VIBE-D should not be marked fully closed until the exact implementation head has green protected
CI and the live generation signal succeeds. The design reconciliation itself is not waiting on a
new visual decision.

## Final disposition

The application has one current visual source of truth: CLEAR Design System 0.9.7. The old design
dialect is historical evidence only. Future UI input should be reviewed as a proposed next design
system revision; it must not be applied directly as route-local patches or silently overrule 0.9.7.
