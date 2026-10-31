# CLEAR visual library plan

CLEAR will have a public visual library that accurately represents the reusable UI the application consumes. Design work happens in isolated branches and comparison previews. Approved visual decisions become explicit inputs to requirements, DAG tasks and implementation. Shared changes flow through the same component implementations, and the library stays accurate as the product evolves.

This is the active North Star and delivery checklist. The detailed audit remains supporting reference. Work through the three deliveries below; research counts and old work-package lists are not additional shipping prerequisites.

Version 2.0 · Updated 30 October 2026, America/Chicago. Eric approved this simplification after considering an external review. The goal is unchanged: consistent real UI, a useful public gallery and a dependable design-to-implementation path.

# What stays true

Owner clarification, 30 October 2026: the CLEAR repository and executable gallery
are the source of truth going forward. Claude Design maintains older files.
Approved shared app components/styles are authored here without waiting for a
Claude export. Keep the historical 0.14.3 import intact; replacing that dependency
remains a separate versioned migration. The legacy maintenance handoff is
[this copy-and-paste prompt](CLAUDE-DESIGN-MAINTENANCE-PROMPT.md).

- Gallery and app consume the same actual components, variables and shared presentation recipes. A shared change reaches the appropriate consumers.

- Related Review, History and Favorites presentations are shown together so their similarities and intentional differences can be reviewed. Preserve distinct prescription, logging and recorded-result behavior.

- Design experiments use isolated branches and previews. Show accurate current/proposed states; review material visual changes before requirements and integration. Merge and production release remain separate events.

- Search existing patterns first. A gap request states the need, existing options, smallest addition and affected consumers. New components, variables and variants remain possible through a concrete design decision.

- Provide public visual access without an account, an organized repository home and concise instructions that help agents find and reuse the library.

- Keep meaningful screen/state coverage and explicit exceptions. The owner reviews consequential designs; agents perform source mapping, reuse checks and relevant verification.

- Maintain the gallery with the shared implementation through ordinary changes. Foundation 0.14.3 stays a pinned immutable import for now; app-owned presentation is edited in src/ui and src/styles.

# Three deliveries

## 1 Accessible app gallery and clear agent guidance

Make /gallery and /gallery/app render the existing registered app components with the same styles and synthetic examples, without account startup or live writes. Prioritize current app presentation. Historical archive documents remain developer references; serving all 43 pages publicly is deferred.

Give agents one short route: AGENTS.md → docs/design/library/README.md → the existing gallery registry and src/ui. Keep implementation guidance in the repository. Generate a compact component index from the registry where useful, rather than maintain a competing catalog. State important coverage gaps and when a pattern should not be reused.

- [x] Public direct links and reloads work without authentication or backend configuration.

- [x] Gallery and app use the same implementations and ordered styles; product route protection remains correct.

- [x] Skin controls, meaningful keyboard/focus behavior, accessibility and narrow fit pass relevant checks.

- [x] Agent instructions point directly to existing patterns and a simple gap-request rule.

- [x] Current-source verification is honest; publish a reviewable PR/preview with remaining findings clearly identified before owner acceptance.

## 2 One real consistency improvement shown in context

Start with the verified repeated metadata text role in Review, History, Favorites and saved detail. Evaluate one small app-owned typography recipe using existing tokens; add only the variants demonstrated by the actual consumers. A shared CSS class may be sufficient. Do not create a new component merely to remove an inline object.

Show related real presentations together using existing gallery specimens and safe owner fixtures. Compare workout-entry summaries with summaries and movement rows with movement rows. Keep context-specific actions and behavior with their owners. Foundational buttons, fields and text states remain in scope as real app-styled examples, added in useful slices.

- [x] Identify the selected recipe, its consumers and intentional differences.

- [x] Consolidate the verified equivalent uses; investigate every unexpected appearance or behavior change.

- [x] Gallery examples render actual owners with comparable data where meaning permits, not look-alike copies.

- [x] Check relevant 320px/390px, state and skin contexts; record a concrete exception when a real owner cannot yet be rendered safely.

- [x] Stop at a bounded, reviewable improvement. Re-scope new token/component/behavior needs rather than silently expand the refactor.

## 3 One real design-to-delivery pilot

Use the wanted workout-prompt/experience work to demonstrate the full path. Reuse the existing superset shape when that work touches it; do not invent a design simply for proof. The completed spacing probe proves mechanical propagation. It does not prove that an approved visual decision survives requirements and integration.

- [ ] Prepare accurate current/proposed visuals on an isolated branch using actual shared components and named fixture states.

- [ ] Review and approve the meaningful design choice and intended consumers before requirements consume it.

- [ ] Link canonical components/registry entries, approved source and states, comparison evidence and intentional exceptions in the existing issue/PR and requirements/task inputs.

- [ ] Integrate the same approved implementation; verify both the shared owner and affected screens. Material departures return to review.

- [ ] Update the gallery and ordinary documentation with the change. Record merge/release accurately and retain only maintenance checks that prevent demonstrated drift.

# Ordinary workflow

1. Find the existing pattern and its current implementation; map the consumers relevant to this change.

2. Prepare a small isolated proposal and actual-component examples. Request a missing contract when necessary.

3. Review material visual decisions using source-labeled current/proposed evidence. A refactor that preserves appearance needs verification, not invented design approval.

4. Carry the approved component/source/state references through the existing requirements, issue, DAG and PR workflow.

5. Verify the integrated result and update the shared example/documentation. Use existing coverage, build, behavior and accessibility checks; add targeted checks when a real gap justifies them.

A PR/issue can hold the source, fixtures, comparison evidence and approval links. No separate approval-state system, twelve-field sidecar or new supervisor is required.

# Supporting research and deferred work

The [released UI audit](https://chatgpt.com/space/page_815f7176f3248191a07acf770c485f5a) and the expanded element/cascade register remain evidence and a backlog of reuse questions. The original source inventory is complete for its declared scope. Per-pattern rendered-state and cascade review remains bounded work, prioritized by repeated patterns, important gaps and UAT findings.

The 1,488 source rendering occurrences are not 1,488 missing components or mandatory user-review rows. Resolve meaningful patterns and owner exceptions as the library grows. Preserve intentional differences and legacy data meaning.

The [earlier ownership specification](https://chatgpt.com/space/page_aad0a08cae6c819196b34d1a47a10e48) and [proof/fixture contract](https://chatgpt.com/space/page_63ae8eab69488191a7a9576ca2c06235) are reference drafts superseded by this active checklist wherever their process or sequencing conflicts. Their old G/O packages, sidecar and proposed gate counts are not active requirements.

Deferred until a concrete need justifies them:

- Public historical-archive delivery; additional route families, ID alias infrastructure and branch-comparison routing.

- An external reusable toolkit, a separate repository and Storybook migration.
  Repository-owned shared app presentation is the current authoring path;
  preserving the historical foundation does not require a separate authoring migration.

- A formal approval-state machine, separate visual-decision schema and thirteen prospective maintenance gates.

- Exhaustive source/region ledgers and all missing fixtures as prerequisites to a useful first release. Keep the existing coverage findings, then add safe fixtures when priority or a changed owner warrants them.

The external review informed this simplification. Its typography recommendation is a useful starting point, not the complete answer to consistency. Direct agent routing improves an existing indirect path. Removing archive delivery does not automatically resolve unrelated evidence checks.

# Current status

Released audit baseline: 14acb2cc549b482e2fb5466a2402bbe5a34029c3. Delivery 1 has 49 entries and 131 initial examples; delivery 2's proposal expands the same register to 52 entries and 138 examples. Important live/session surfaces still need owner fixtures; registration counts do not certify state completeness or visual approval.

Eric explicitly approved merging and publishing PRs 593, 595, 597 and 599 on 30 October 2026. Delivery 1 merged through [PR 593](https://github.com/theycallme-eric/clear/pull/593) at `953d13df46ba4aef596d39dd4da9b13d3fc11e0a`, linked to [issue 590](https://github.com/theycallme-eric/clear/issues/590). Its public gallery deployment is verified. The integrated gallery is at https://clear-peach.vercel.app/gallery; PR records and deployment checks distinguish approved, merged and released sources.

Delivery 2 is implemented in [PR 595](https://github.com/theycallme-eric/clear/pull/595), tracking [issue 594](https://github.com/theycallme-eric/clear/issues/594). Six repeated metadata recipes share one app-owned stylesheet; actual Review, live movement, saved-detail and workout-summary presentations are compared in the gallery. All 5,894 unit tests pass; 208 component-state PNG comparisons are identical at 320/390px across four skins. Three public browser cases and four current-source collector cases pass. Owner merge/publication approval is recorded. [PR 599](https://github.com/theycallme-eric/clear/pull/599) is the final protected integration of the remaining approved stack, retaining PR 595's exact head and PR 597's source-preservation commits. Its final checks apply to the combined tree; the PR records the merge/deployment outcome. Recent-batch owner UAT can proceed independently. Delivery 3 needs the current workout-prompt proposal selected; paused mixed-source Refine previews remain historical references. No in-thread reviewer or new agent should be launched without the owner's request.

# Working rules for agents

Requested library refinement: [PR 599](https://github.com/theycallme-eric/clear/pull/599)
restores the package's motion lab/use cases at `/gallery/motion` and shows the
current hard-edge scroll treatment beside the dissolve direction Eric selected.
Eric likes the corrected glow and CRT direction; he requested a 15% shorter
dissolve, now 22.1px, with the glow unchanged. The production CSS-time unit bug
is tracked in issue600. The gallery normalizes the token for preview and offers
Hold for inspection. The shared app-owned correction and integration are tracked
in issue600; Claude maintenance is downstream. This does not replace delivery 3's pilot.

Read the repository's project instructions and the short library README before UI work. Search the existing registry and src/ui before creating presentation. Use the same components, style authority and real state owners in gallery examples; supply deterministic data/controllers without live writes.

Keep code and rendered evidence tied to the version they actually represent. Current, proposed, approved, merged and released are distinct facts recorded through the ordinary workflow. Never mix an old/partial preview into a current baseline or infer approval from a screenshot.

Use the source and pattern maps to find affected consumers. Do not merge unrelated state machines, impose a universal inline-style ban, edit immutable vendor mirrors or treat coverage discovery as proof of correctness.

# Active checklist

- [x] Establish the released-source inventory and retain its evidence and limits.

- [x] Consider the outside review and replace the immediate process with these three deliveries.

- [x] Delivery 1: focused app gallery and agent guidance approved, merged through PR 593 and publicly deployed.

- [x] Delivery 2 implementation and owner merge/publication approval: shared metadata recipe and actual-context comparison in PR 595; final protected integration recorded on PR 599.

- [ ] Delivery 3: demonstrate the approved workout-experience design through requirements and integration.

  - [ ] Workflow pilot TASK-001 ([issue 601](https://github.com/theycallme-eric/clear/issues/601)): ErrorView accent bar in the semantic error role. Candidate implemented locally from released base `65522e93d60d439ad82a545833812a58095f2216` and corrected prototype `c0d5782bf9bec8065b5e224c9d3b4f35a9dded17`. The one owner change scopes `--border-card` and `--brd` to `--border-toast-negative` on the `src/ui/view-state.tsx#ErrorView` alert root. The existing ErrorView gallery entry gained only `inside a card` and `inside an AppDialog` specimens. `e2e/library-error-role.spec.ts` (`error-role-consistency`) runs on its own fresh Vite servers. It shows red on an isolated released-owner baseline and green on the candidate across four skins at 320/390px, plus actual Generate profile/places failures and a separate route-guard state. It is local candidate-source proof only and is excluded from deployed-target discovery. The owner-authorized manual Format Preview refresh passed four cases/eight captures on frozen source `55843bd`. Final direct checks pass: 5909 unit tests, eight named browser cases (zero skips), build/typecheck, lint, design lint and the gallery index. Published as [draft PR 611](https://github.com/theycallme-eric/clear/pull/611); exact-head CI and review state live on that PR. Eric required no further Runner invocation. The earlier native attempt and its stale-evidence failure remain intact; manual completion will not establish a native completion receipt or fully prove Runner delivery. No merge or production release is claimed. Record: `docs/progress/library-workflow-pilot-2026-10-30/TASK-001.md`.

Next action: review [draft PR 611](https://github.com/theycallme-eric/clear/pull/611) and its current-head CI under the owner's no-Runner constraint; merge/release remain separate. The tested candidate is complete by direct verification, while native end-to-end Runner delivery remains unproven and is not being retried. Then select the current workout-prompt/experience proposal for delivery 3. Prepare accurate current/proposed visuals from that source; meaningful design approval precedes requirements and integration. Shared application scroll integration (#600) remains separate from the approved library publication.
