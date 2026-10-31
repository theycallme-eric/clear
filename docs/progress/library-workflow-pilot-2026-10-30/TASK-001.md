# TASK-001 library workflow pilot — ErrorView semantic error role

Issue #601 · REQ-001..003 · branch `agent-runner/task-001-a2-3c910f9e`.
This task-owned record replaces a shared daily-journal append for this body.

## Result and authority

The candidate passes direct final verification and is ready for a reviewable PR. Eric authorized the authenticated Format Preview capture exception, conditional on **no further Runner invocation**. All capture, final checks and PR work after that decision are operator work. No new native recovery, receipt, completed-run credit, merge or production release is claimed. The original Runner attempt remains failed at its stale-evidence gate.

## Source and reuse

Canonical owner: `src/ui/view-state.tsx#ErrorView`. Existing registry entry: `src/dev/gallery-registry.tsx` → ErrorView, `/gallery/app?component=ErrorView`. Released base: `65522e93d60d439ad82a545833812a58095f2216`; corrected approved prototype: `c0d5782bf9bec8065b5e224c9d3b4f35a9dded17`. Final tested/captured runtime was frozen at `55843bdbb889a1066d0ea691ea520398177084e0`; later changes are evidence and documentation only.

The alert root scopes both existing `--border-card` and `--brd` hooks to `var(--border-toast-negative)`. Bar, frame, emission and icon keep the error role under an inherited AppDialog border. No literal colour, token, component or global card override was added. Gallery and app keep the same ErrorView implementation. Only the missing `inside a card` and `inside an AppDialog` specimens were added: 52 entries, 140 initial examples. The generated component index lists entries and remains unchanged.

The local consumer fixture mounts the actual Generate profile/places failures with guard preconditions held, and the actual protected-route guard separately. Existing synthetic clients exercise Retry and Home navigation with zero account/database writes or generation. The 0.14.3 import and archive are unchanged.

## Findings and their dispositions

- Released ErrorView set its body border but left sibling paint reading inherited roles. The first proposal added only `--border-card`; AppDialog could still supply an already resolved `--brd`. Corrected prototype c0d5782 scopes both hooks at the shared root. This exact semantic correction is retained.
- The first skin-switch proof read too early. Final browser readings wait for the document's actual `data-skin` and finished transitions.
- Attempt 1 was interrupted before a normalized worker result. The partial implementation was preserved as `49bf036a59b2ecb416901ff5d84e342cddbcb195`; native attempt 2 reused it. The comparison test's original 30-second default expired; its bounded 240-second allowance covers the unchanged full comparison.
- Parent review caught a source-only test being discoverable in deployed-preview CI. It reads an old git object and serves local fixtures, which deployed/shallow-checkout targets do not provide. `browserTestIgnoreForTarget` now excludes this specific source-only file before external-target module import; the existing harness test verifies the classification. The exact local command still executes all eight cases without skips. Protected workflows are unchanged.
- The worker reported 5907 passed / two failed unit tests because the source-bound Format Preview audit was stale. Runner independently passed all eight ErrorView browser cases, then correctly stopped at the full-suite gate (`criterion-evidence-failed`). It published no PR. The selected runtime does not admit that reason to failed-workspace recovery. Neither state nor policy was altered to work around it.
- Eric then approved the established authenticated collector's disposable test-account setup/cleanup and prohibited further Runner invocation. Genuine new capture and direct final checks resolve the product/evidence gate; the native failed history remains intact.

## Real evidence

The existing authenticated Format Preview collector passed 4/4 skin cases and produced eight fresh PNGs in 25.9 seconds on frozen source `55843bd`, loopback `http://127.0.0.1:60420`. New group: `docs/design/evidence-0143/task034-format-preview-library-601/`. Runtime: `6ee55d1f00a40177574be3eaaab313ee90fa15adee4151ecb6a5fa4da3a44da3`; driver: `c1ad60740985a9bbcf5d259d3bc399a4780707d2017539aa8d5de0f8058b6fb7`. All records agree with the unchanged pinned package. Actual PNG bytes, hashes and dimensions were checked; normal Signal and short CLEAR images were viewed.

The existing fixture completed disposable setup/cleanup. Session/preview generation, blocked generation, attempted preview writes and forwarded preview writes are zero. Setup writes are not mislabelled as a zero-write authentication journey. Historical records and PNGs remain unchanged. The ordinary audit names the real new identities.

Source-labelled proposal images and six unmodified final browser observation files are retained in `docs/design/library/evidence/lib-003/`. These distinguish released/proposed design images from final candidate readings. They are ordinary PR evidence, not another inventory or approval system.

## Direct final checks — 30 October 2026, America/Chicago

| Command | Result |
|---|---|
| `npx playwright test e2e/library-error-role.spec.ts --project=mobile` | 8 passed, 0 skipped; 87.1s |
| `npx vitest run src/app/Generate.test.tsx src/ui/view-state.test.tsx` | 128 passed, 2 files |
| `npm test` | 5909 passed, 240 files; 46.5s |
| `npm run build` | passed, including typecheck |
| `npm run lint` | 0 errors, 151 warnings |
| `npm run lint:ds` | passed |
| `node scripts/gallery-index.mjs --check` | 52 entries verified |
| Immutable directories vs released base | identical |
| Historical capture groups vs released base | identical |
| `git diff --check` | passed |

The eight named browser cases cover: released mismatch in a safe isolated baseline; gallery and actual AppDialog in four skins at 320/390px; semantics/copy/glyph/request-id/Retry; host containment and ordinary-state paint; actual Generate profile and places failures with footer Retry; the separately labelled guard; one-shot and reduced-motion behavior. Tests use fresh candidate-source servers and preserve the candidate file hash. Source-only proof is not deployed proof.

## Remaining review and workflow limit

Publish the ordinary PR and observe its exact-head CI. Review the ErrorView entry, especially Signal, contained content and the dialog specimen. Merge remains an owner decision. The larger workout proposal and application ScrollRegion #600 remain separate.

This pilot demonstrates approved design reuse through Builder, DAG, implementation and a correctly enforced evidence hold. Final operator completion does **not** establish end-to-end native Runner delivery. That limit is recorded, not converted into a new Runner task under the owner's no-Runner instruction.
