# CLEAR workout experience: refreshed design review

31 October 2026. Design proposals awaiting owner review.

Open http://127.0.0.1:8789/. All seven areas, 41 selectable examples and 82 current/proposed panes are available together. Use each area's Example menu; both phone views are interactive and can open separately. Skin and phone controls apply to every group. The older hub on port 8788 remains a historical reference.

## What to review

Review the proposed experience, rather than checking every token or component. Start anywhere and leave feedback by area/example. In particular:

- Setup and Generate: larger Goal/Focus, both smaller-link and framed Change focus options, Recovery inside the choices, and the shorter setup flow.
- Review and preparation: equipment/name grouping, optional rough load guidance, matching warm-up/cooldown lists and independent optional clocks.
- Workout/logging: log a set or round, inspect confirmation/rest, minimize/reopen, and let rest end. Compare supported formats without combining their distinct behaviors.
- History/progress and Settings: status/date grouping, saved detail, candidate training-progress location/content, and the proposed visibility of preferences.

These are the existing full-set proposals with the recorded R01–R23 feedback retained. R22's ErrorView correction is now released and appears on both sides; it no longer needs a separate design decision. The two Change focus treatments, report placement/content, and setup/settings simplifications remain open for visual review. Unchanged Home is included for context.

## Source and reuse

Left: exact released source `94f2c2f3bf7e4d0eeb856d3716fd843f188e6fc2`, including the approved library and ErrorView fix. Its 5,773 tracked Git blobs were checked against the isolated baseline with no differences. This is real screen/component code with synthetic display data, not live account screenshots.

Right: isolated local branch `codex/workout-library-refresh-2026-10-31`, refreshed from prior proposal `4bc4e52704e177e82914dfb7af162cb09079375d`. Exact commit is recorded in [SOURCE.json](SOURCE.json). It uses the released shared `ReviewExerciseRow` and metadata recipes, rather than restoring the obsolete private row. Both sides import the same eight global stylesheets in released order, including `text-roles.css`. Immutable 0.14.3 files are unchanged. The ErrorView implementation is identical on both sides; the former prototype CSS workaround was removed.

The current library guidance is in `product/docs/design/library/README.md`; its registry and component index are the discovery source. [DESIGN-NOTES.md](DESIGN-NOTES.md) maps the proposed extensions and remaining integration. [COVERAGE.md](COVERAGE.md) maps the 20 original touchpoints. No historical gallery proposal is treated as current authority.

## Boundaries and next step

Guide, rough-range and training-progress values are illustrative typed presentation inputs. They do not establish generation, adaptation or persistence contracts. The shortened setup holds explicit fixture values for fields the current backend still requires; this is not approval of new-user defaults. Existing load overrides, logging owners, separate rest/preparation clocks and legacy readers remain distinct.

Each phone has isolated in-memory storage and a namespaced fixture database. No external services or real account writes were observed. Hosted save/receipt/failure behavior, reload/repeat compatibility and workout-quality outcomes require later integration evidence. This is not a production-ready implementation packet or approval to merge the multi-area prototype.

After visual feedback, carry approved shared owners, states and intentional differences into the ordinary requirements/issue workflow. Resolve the listed contract gaps there before implementation. Agent Runner was not invoked for this refresh and must not be invoked again under the current owner instruction.

## Verification

- 82/82 panes rendered; 61/61 focused interaction, fit and shared-error checks passed.
- Seven sampled views had no automated accessibility violations; no browser exceptions, external requests or generation calls were observed.
- Typecheck, preview build and project design lint passed. Changed-source lint: zero errors, three Fast Refresh warnings (two retained in SetLogger, one in the prototype context module).
- RestTimerBar compatibility selection: 15 passed, 24 unrelated tests excluded by name filter. The full application unit suite was not rerun for this multi-area prototype.
- Seven representative proposed views fit 320px. Error role was checked in all four skins on both sides. The whole prototype was not exhaustively reviewed in every skin/state on physical devices.

Actual results, scripts and screenshots are in `evidence/`. These checks establish this named comparison's mechanics; owner design review and wider integration remain pending.
