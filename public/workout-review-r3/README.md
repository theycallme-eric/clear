# CLEAR workout review — R3

1 November 2026. A design branch using actual shared components, with deterministic in-memory data.

Start with **Review** and **Workout**. Review headers are now static. Both contexts use MovementGroupHeader, MovementIdentity, MovementList and the same group spacing. Review supplies Swap; live Workout supplies progress, Rest and logging. Prescribed load appears in both. Compound rows read each round’s target; the group badge states the round count once. Standard work retains its full sets × reps prescription. Warm-up and grouped coaching keep the accepted appearance.

Overview intensity is shorter. Movement count has a Log/list glyph and visible label. EquipmentSummary provides a neutral read-only group. The duplicate live section card is replaced by compact navigation, retaining position/status, section jumping and focus. Those new equipment/icon/navigation treatments are first passes for owner review.

[Refinement checklist](REFINEMENTS.html) retains all R01–R37, including earlier superseded choices and open contracts. [Markdown copy](REFINEMENTS.md) is available for requirements. The repository’s `docs/design/library/WORKOUT-REVIEW-FEEDBACK-2026-10-31.md` remains the editable source; original R01–R23 detail is preserved beside it in archive/. This checklist is a generated snapshot, not a separate tracker.

The left comparison remains released baseline 94f2c2f, identified as a baseline rather than a claim about later production. All seven areas/40 examples/80 panes remain available. SOURCE.json identifies the exact proposal. The previous R2 deployment remains fixed.

After visual selection, reconcile the accepted shared owners/examples and feedback into Requirements Builder, then a scoped implementation and UAT. The multi-area prototype branch is not a wholesale merge candidate. Synthetic guide/range/report inputs and setup defaults still need real data contracts. Browser checks use real controllers with in-memory clients; they do not prove live backend behavior.
