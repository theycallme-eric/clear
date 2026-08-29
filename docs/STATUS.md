# CLEAR rebuild status

Updated 2026-08-29. This is a checkpoint, not a second backlog; GitHub issues become live truth
after the migration described below.

## Current position

- Private GitHub repository created: `theycallme-eric/clear`.
- Full planning history pushed to `main` (23 commits before this baseline update).
- Requirements v0.7: **71 requirements, 136 edges, no cycles**.
- Critical path: 15 nodes. Initial ready queue: **ENV-01 only**.
- Approved `clear-design-system@0.5.0` artifact imported: 512 files.
- `ENV-01` is implemented on its isolated branch: React/Vite/TypeScript shell, tested routing and
  404, project boundaries, and the planning workspace relocated under `docs/`.

## Readiness gaps closed in v0.7

1. **Visual source is explicit.** Every IA screen names a design-kit screen, template, or specimen
   reference. `ATOMIC.md` now requires inspection of those references while keeping their markup out
   of the production API boundary.
2. **Generation composition is specified.** `docs/specs/generation/PROMPT_v4.md` carries the useful v3
   coaching rules onto contract 4.1: SQL resolves candidates, Claude composes IDs and structure,
   code validates, hydrates facts, and persists.
3. **Motion is mapped.** Every screen contract names the intended route/content choreography and
   prevents motion from replaying on routine refetches or logging interactions.
4. **The abstract pipeline has a concrete trace.** `WORKED_EXAMPLE.md` follows request → candidates
   → model output → persisted rows → generated/intended/performed reconstruction.
5. **The migration generator is bounded correctly.** The final requirement can no longer absorb
   the requirements appendix into its issue body.

## GitHub migration

The repo exists, code history is real, and the ENV-01 branch is locally verified. Issue migration
remains the active operation:

1. regenerate and validate all issue bodies from requirements v0.7;
2. commit and push the baseline to `main`;
3. create 11 labels and four milestones;
4. create 71 issues;
5. wire 136 native blocked-by relationships;
6. verify live counts, representative bodies, dependency edges, and the single-item ready queue.

Scripts are re-runnable and `docs/github/issue-map.txt` is repository-specific and ignored.

## Distance to a PWA

`PWA-01` is an M2 integration node, not the start of the build. It depends directly on `ENV-03`
(deployed SPA/deep-link shell) and `DS-02` (design-system integration). Once those are merged, basic
installability is small: manifest, icons, theme and iOS metadata, install verification, and a minimal
shell-only service worker. A useful product still depends on the M1 core loop; offline generation and
offline data are deliberately deferred.

## Open product judgment

The generation architecture is strong: deterministic code owns eligibility and factual truth, while
the model owns composition. The first implementation should resist moving quality heuristics into
hard rejection. Record warmup coverage, variety, ratios, and repetition as observability; tune the
prompt from real failures. The highest-risk unknown is not schema shape but candidate quality and
whether 35–50 minute compositions remain coherent after duration validation and retry.

The promoted EXE-06 and EXE-07 requirements currently have complete acceptance criteria but no
separate deep specs. That is acceptable for issue creation; add specs only if implementation exposes
an unresolved policy, rather than writing documents preemptively.
