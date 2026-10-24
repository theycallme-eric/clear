# Reviewed workout V3 release — issue #517

Eric explicitly authorized integration through production deployment on24 October2026. V4 owner notes remain future direction only in the existing local workout-quality-review/PROMPT_REFINEMENT_PROPOSAL_2026-10-21.md. No new corpus or paid model request is part of this release.

## Source and scope

Pre-release main fe64a874ec90a9cba68e210f4d60f906d12bf1af; unchanged backend tree25779ab63a8ff8082cbcb8324e70e3b5b43ae8a2. Before release the official Supabase CLI observed generate-workout34 and generate-section2 ACTIVE, with bundle hashes exactly matching the prior Task035 deployment receipt. Pre-release prompt5.3.0 source SHA25656af02f2fac48a2aa8a97a335a0679329c59bc8bce489d146476ef399103d04b matches the existing deployment binding.

Prompt5.4.0 integrates the reviewed compact V3 coaching additions into current ladder timing support. Contract4.2.0, provider/budget/auth, code-owned loads, null overview/section introductions, validators and UI are unchanged. Post-review corrections: retain an eligible high-confidence progressing squat anchor as primary or3x5 support with prior_session loading, subject to recovery/time; make existing bodyweight-default glute bridge eligible for warmup and prescribe bodyweight there. Prompt prose is guidance, not proof a model follows it.

The existing ledger/seed path adds one glute-bridge row. Exact expected warmup counts increase by one for each tier/focus; matrix/disposition/type source lists are regenerated without altering schema. Migration19 and its rollback remain byte-identical. New generated migration20261024000026_v3_hinge_warmup.sql applies only the warmup addition, idempotently. No existing workout is rewritten.

## Size and checks

Owner-approved V3 budget14917 plus the independently existing ladder allowance737 =15654 bytes. Current fixtures15626/15648, system10301 bytes. Historical ratio guard<0.67 applies after removing the separately budgeted ladder cost; the ladder allowance remains independently bounded<800. No additional allowance was invented for this integration.

Prompt/runtime mirror and version checks, bodyweight eligibility and exercise/pattern exclusion checks, original/fresh migration/rollback checks, saved ladder behavior and all existing required checks run before publication. Full results/CI and deployment receipts are recorded in the journal and local release evidence. A passing unit test is not live workout-quality or latency validation.

## Fallback preserved

Local release handoff directory: /Users/eric/clear-app/workout-quality-review/prompt-v3/release-handoff/fallback-current-2026-10-24/. Contains exact runtime/spec/contract/validator/ledger, a complete pre-release source archive, SHA256 manifest, current official CLI metadata and glute-bridge pre-change metadata. Historical fallback-v1 remains alongside it. The CLI source-unpack command refused cross-directory shared imports; partial extraction is explicitly not a complete backup. Complete source preservation instead uses the matching commit, prompt hash and current deployed bundle identities, with the prior deployment receipt as provenance.

## Release sequence and rollback

After all local and protected CI checks pass: ready/merge the single PR normally, capture merged source, apply only migration26 to the confirmed projectqxckevxniacktaqecypl, deploy generate-section then generate-workout with the existing official CLI --use-api path and unchanged auth settings. Record actual function versions/status/bundle hashes and source checks. No whole-directory prune or unrelated migration push. Capture glute-bridge after-state. Distinguish source publication, deployed identity and real workout testing.

Rollback uses a new commit reverting only prompt/runtime/spec/budget edits to preserved pre-release values; redeploy the affected functions through the same path. Do not reset main or revert newer UI/ladder work. If the catalog addition needs reversing, inspect current row then run only docs/backend/rollback/v3-hinge-warmup.sql (restores glute-bridge's captured accessory membership; do not run the broad historical rollback). Keep saved sessions. Preserve migration history rather than deleting applied rows. Current versions and rollback actions must be journaled.

Deployment pending until actual receipts are collected; this document is not evidence that a deploy happened.

## Verification checkpoint — blocked before release

Full local suite:5431 passed,2 failed out of5433 (212 files). The two existing design-0143-final-audit assertions reject stale current-source identity. The only non-test src change is the generated database.types.ts comment listing migration26; emitted schema/type declarations and all UI source remain unchanged. Existing checks hash source bytes, so this comment still invalidates earlier current-source visual records. Existing capture harness is write-once and refuses to overwrite its historical records. No stale screenshot was rebound, no failing guard was waived and no UI was changed to manufacture a pass.

TypeScript/build/seed/types/requirements checks pass; lint0 errors133 warnings, design-system lint passes. Release blocked until the current-source evidence requirement is met through a fresh honest capture and audit update. Keep PR draft. No migration or backend deployment performed. Current pre-release hosted versions remain34/2; this is not a claim5.4.0 is deployed.
