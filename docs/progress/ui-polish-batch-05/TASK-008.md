# TASK-008 — Review compact summary with icon fact row

Issue #566 · REQ-008 · AC-023/024/025/063 · JOURNEY-006.
Run `61a099b3-56ee-4d25-90cd-9dab2510bc29`, current attempt2/2.
Branch `agent-runner/task-008-a2-61a099b3`; tested build base
`b933e929c02f5b74f66a7b915455bdbc121a2f56` (TASK-005 protected squash merge).
This task-owned record replaces the shared daily journal under the approved body exception.

## Intended outcome and reference

B05-03 replaces Review's tall overview grid with a compact icon-fact row under the existing workout
title, with equipment near the top. All actual facts remain: effective duration, focus/anchor,
intensity out of10, goal and total movement count. The preview's three demo facts do not authorize
removing actual product data. Keep legitimate “None — bodyweight only” equipment; do not add the
struck “Bodyweight movements included” sentence. Preserve distinct completed-result readouts.

Sources: staged DECISIONS, GLOBAL-PATTERNS (compact summary facts03), VISUAL-REFERENCE B05-03,
CODE-REFERENCES, anchored preview excerpts, RUN-CONTEXT and task-owned progress template. Original
reference `sources/source-06-B05-03-review-summary.jpg` was opened and compared with rendered captures;
SHA-256 `7ade92cac74f9dd915dd451817b66e43856b87eaf4023edd8642339afbf76779`.
Compare its left tall overview with right YOUR WORKOUT03.1 icon row and following equipment card.
Approved decisions permit internal public components/tokens/layout mechanics; GLOBAL03 supplies the
existing horizontal containment pattern. There is no unresolved owner decision to remove facts or
waive the one-row requirement.

## Final product correction

- Review uses app-owned `SummaryFacts`/`SummaryFact`, with the actual pre-start facts in reference
  order: Duration, Anchor, Intensity, Goal, Movements. Existing actual h1 and equipment logic remain.
- Shared `SummaryFacts` places a valid native description list inside public `OverflowRail`. Each
  grouped fact has its glyph inside the term and an adjacent definition; hidden term text remains
  accessible. Existing four system glyphs remain; movement count had no glyph and retains its label.
- Every fact stays whole on **one aligned row**: no continuation lines, text shrinking, truncation,
  dropped facts or invented values. Wider data scrolls inside the card with the shipped rail cues.
- One named focus entry permits native horizontal keys in both directions and full final-fact
  reachability. The app-owned rail boundary uses existing focus tokens to keep its ring visible
  while the wider track scrolls. No private vendor mutation, assigned scroll offsets, fake navigation
  selection or new visual tokens.
- Gallery examples use the same composition for pictured and widest facts. Generic `MetricGrid` and
  `MetricFrame` retain their separate result/score layout; no blanket metric CSS change.

| Consumer | Classification and result |
| --- | --- |
| Review pre-start workout facts | Equivalent compact facts: shared SummaryFacts;3states×2widths×2skins verified |
| Completed Summary duration/streak | Distinct completed results: retained MetricGrid/MetricFrame;390/320 render checked |
| Session detail performed record | Distinct labelled/provenanced record: retained five metric frames;390/320 render checked |
| Conditioning/AMRAP score readouts | Distinct score objects: MetricFrame retained; source classification checked |

## Actual attempt history and corrections

Attempt1 worker succeeded but native focused browser verification failed one of11 cases on the first
full Axe scan (button-name/landmark-unique), classified criterion-evidence-failed. Its checkpoint
`8df69d07a2a0142790105da524789a6c98cb75d1`, original captures and outcome remain preserved/inactive.
The selected no-model recovery does not admit that reason; the normal configured fresh attempt2 was
used. No ledger/failure class or claim was rewritten.

Attempt2 worker succeeded; its native criterion/browser checks passed, then required project npm test
failed because runtime-source-bound format/audit evidence was stale. Native reason is genuinely
verification-failed; existing same-workspace no-model recovery applies after real proof refresh,
without a third model attempt. Initial checkpoint `314f73dc597855810bbce9e4e80fb5924819786e`, original
73files/56PNG, and original task note remain preserved outside the product tree and in Git history.

Operator review rejected the original “pass” captures/spec that allowed2–4 wrapped lines and the
claim that removing facts needed an owner decision. The public rail resolves width pressure while
preserving every fact. Original false-green records were retained, never relabelled. The original
unasserted first Axe priming scan was removed. A font/icon heuristic cause was not established and
is not claimed. The final test waits for observable route/region/fonts and actual finite route motion,
then fully asserts the **first** Axe scan; no discarded scan, exclusion or retry hides violations.

Strict correction runs exposed endpoint rounding, real keyboard focus and cue-record sampling
issues. Endpoint geometry remains at its original tolerance; actual keys reach containment. This
spec's existing11 cases run sequentially so browser foreground changes cannot steal native keyboard
focus. Synthetic origin checks verify the answering checkout and fail on server exit. Cue metadata
is sampled after the actual assertion polls. Earlier failed runs and the prior green capture before
that metadata timing correction remain separately archived, not substituted for final proof.

## Final focused verification, 2026-10-29 UTC

All commands were actively collected through terminal; no worker or browser process is left running.

| Command/check | Actual final result |
| --- | --- |
| `npx playwright test e2e/ui-polish-b05-summary-facts.spec.ts --project=mobile` | **11 passed,49.2s** (final retained session9943) |
| `npx vitest run src/app/review-screen.test.tsx` | **25 passed** |
| Related Review/gallery/composition unit suite | **94 passed** (119 focused total) |
| Typecheck, design-system lint, scoped spec lint | Passed |
| Full lint | 0errors; baseline143warnings |
| Git diff check | Passed |

Each of12 real Review state/width/skin cells (pictured/widest/bodyweight ×390/320 ×Clear/Vapour)
has all five tops equal and one16px row, full first-to-final and back native keyboard reachability,
correct settled remaining-overflow cues and page horizontal offset0. Each first full Axe scan is
asserted; network guard recorded no unexpected calls, writes or generation. Equipment stays near
the top and retains the real bodyweight-empty state. Summary/session detail classification cases
also pass. Source-only score classification is not represented as a rendered screen.

Final raw proof:28JSON capture records and40primaryPNGs (80including attached copies), every PNG
and reference hash verified. Retained outside the product at
`/Users/eric/Documents/Projects/support-tooling/project-workspaces/clear/ui-polish-batch-05-2026-10-28/runner/reports/task-008-corrected-browser-evidence`, with separate SHA256 manifest.
Recorded source is `314f73dc597855810bbce9e4e80fb5924819786e` plus reviewed uncommitted correction
(`dirty:true`), honestly recorded. Spec SHA256
`f2e0bc39932d746a9db7b9c6c9cd5d363ae39c8b9b21a152948ce35404d86cb7`.
Normal Clear, narrow Vapour, widest/bodyweight endpoints and visible rail focus were visually
reviewed against B05-03. This is Chromium phone emulation; physical-iPhone UAT remains pending.

## Source-bound proof and next action

The unchanged project audit binds the active format-preview proof to the runtime source. Reviewed
source was frozen at `f643b01f081a2076aa07a6ef12bc83889722d38a`, with exactly nine approved files,
clean status, unchanged validators and the actual b933e929 build base. Source hashes matched the
stable preservation copies. Six untracked generated diagnostics were moved outside the product to
the correction-history directory with original device/inode/size preserved; unreadable content
hashes remain explicitly unavailable. No original failure or attempt history was discarded.

The existing authenticated collector then completed in foreground session 18202, terminal exit 0:
**4 skin cases passed in 24.6 seconds**, producing eight new phone/short PNGs in
`docs/design/evidence-0143/task034-format-preview-batch05-task008/`. All four records name the frozen
source, runtime `dd45bd8b70b06c002a68f11b1cef828237cfb24e8c0045e0a4fbd6b342843abf`, driver
`e0b9150cf1108b60ce123324a2d8b27bffd77986a38581a9b661cc447e569b1b` and the pinned 0.14.3 package.
The manifest is complete. The preview walk recorded zero generation, blocked generation, attempted
write and forwarded write counters; existing authenticated-session setup/cleanup stayed on the owned
disposable local backend. The first record is clean; later dirty statuses reflect new evidence files.

Existing v1 source-only provenance names this run, attempt 2, exact approved graph/task revision,
retained branch and tested build base. Its actual payload digest, derived with unchanged
`capturePayloadSha256()`, is `fef05a9538eedde15241507b0a6fdd600566adfe01c23a1af99d147e661c9033`.
The audit records actual application/runtime/driver identities. Historical groups remain unchanged.
Existing focused proof consumers passed **116/116 tests across three files in 12.72 seconds**:
`src/test/design-0143-final-audit.test.ts`, `src/test/format-preview-evidence.test.ts` and
`src/test/capture-source-lineage.test.ts`. Phone CLEAR and short Vapour PNGs were opened for visual
inspection. The first sandbox invocation could not create its native macOS temporary directory and
executed zero tests; the unchanged command passed in native host context. No test/config workaround
was introduced. This validation does not substitute for native acceptance.

Next: commit genuine proof/audit/progress, then invoke existing native same-workspace recovery.
Its criterion/task/project checks and exact-head receipt remain mandatory, followed by ordinary
PR/exact-head CI/protected build merge. Full project checks have not yet been rerun on this corrected
source; no native acceptance or completion is claimed here. This is local Chromium proof, not
physical-iPhone UAT or deployed proof. Runner/framework, approvals, references, counters, protected
vendor and workflow paths, distance, hosted services, main and production remain unchanged.
