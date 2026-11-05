# Logging field ownership

Shared appearance does not create shared data fields. The gallery keeps the
existing source meanings below; held/synthetic controller values are examples,
not schema support or durable-write evidence. Richer timed results remain the
explicit application-engineering work described by revision 6.

| Context | Field / action contract | Existing source reference |
| --- | --- | --- |
| Anchor / primary and other lift | Optional actual Weight, Unit, Reps and categorical Effort; submitting the set reports performed work. No extra Performed checkbox or Notes field is added. | `src/ui/set-logger.tsx`, `set-logging-sheet.tsx` |
| Timed movement | Measure/effort; load fields only for a loaded prescription. Plank fixture is unloaded. | `SetMeasureFields`, prescription modality/load contract |
| Distance movement | Actual Weight/Unit where loaded, distance measure, Effort. | `SetMeasureFields` |
| Extra set | Existing set fields with its extra set number, without a new data type. | `ExerciseSetLogger` |
| Saved-set correction | Existing recorded fields, Save correction/Cancel and Clear set confirmation with Keep set as the safe action. | `ExerciseSetLogger`, clear confirmation |
| Superset round | Per-movement Performed, actual load/unit/measure and Effort, separated as complete groups. No added generic Notes field or explanatory paragraph. | `SupersetRoundSheet` in `set-logger.tsx` |
| Circuit round / take back | Recorded round time, existing rest and Take back this round. No guessed movement actuals. | `src/ui/circuit-block.tsx` |
| Circuit movement entry | Existing actual measurement entry; circuit controller retains round position/time ownership. | `CircuitBlock` / shared measurement entry |
| Movement note | Note belongs to that movement; independent save/error ownership. | `src/ui/exercise-coaching.tsx` |
| Workout feedback | Existing five-value session Feeling and optional session Notes, distinct from categorical set/block Effort. | `src/app/Summary.tsx`, `FeelingRow` |
| Rest day / reason change | Existing native Reason select with Rest day/Injured/Unwell/Away and its existing effect helper. No new Notes field or invented reasons. | `src/app/Home.tsx`, `src/state/rest-days.ts`; existing writer sends note null |
| EMOM | Accepted no-minutes-counter results, optional categorical Effort/Notes and applicable actual movement load; engineering mapping pending. | Accepted TimedResultLog contract / revision 6 |
| AMRAP | Nullable rounds plus per-movement next-round actuals/load, optional Effort/Notes; zero stays distinct from unreported. | Accepted TimedResultLog contract / revision 6 |
| For Time | Complete/Incomplete and applicable per-movement actuals/load, Effort/Notes; Finish is not automatic performed-work proof. | Accepted TimedResultLog contract / revision 6 |
| Ladder | Ordered prefix, dynamic completion count, per-movement partials for next round, applicable load, Effort/Notes and reversible Finish draft. | Accepted ladder/timed-result owners / revision 6 |

Gallery confirmation/retry is intentionally synthetic. Real cancellation,
correction/clear writes, rest lifecycle, History, reload and original-cap recovery
remain owned and verified by the later application tasks.
