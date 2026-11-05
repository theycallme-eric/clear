# Catalog-test launch readiness

Scope: owner-authorized launch readiness for the gallery-aligned refinement body, related to #666.
This change does not complete that issue or any of the 47 approved implementation tasks.

The native supervisor stopped before claiming a task because the catalog-viability test
`fails every focus whose recorded result the change moved` exceeded its existing five-second
timeout. The same baseline had passed the earlier preparation run. The failed supervised run
retains 6,066 passing tests and the one timeout; no claim or attempt history was reset.

The test called `failures(stripped)` inside the focus loop. That function computes the complete
viability report for the same unchanged catalog and presets, including all focuses. Compute it
once, then retain every per-focus assertion against that report. The timeout, test count,
production implementation, catalog data and assertions remain unchanged.

The live ready queue recommended #666; its comments contained no additional direction. Delivery
uses the already-authorized protected integration branch, not main. Shared daily-journal edits
are avoided through the approved task-owned record convention.

Verification: the focused catalog-viability suite passed all 17 tests. `npm run build`,
`npm run lint:ds` and `npm test` passed: 250 test files and 6,067 tests. Main and the integration
branch were freshly fetched before publication; both still resolve to `03087f7`, the tested base.
Protected GitHub CI remains required before the authorized integration-branch merge. This record
does not represent that future check or the supervised restart as already complete.
