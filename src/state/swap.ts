/**
 * EXE-06 — the mid-workout swap, as arithmetic over rows.
 *
 * The rack is taken at minute 12. The requirement's answer is not a new
 * mechanism: it is REV-02's lineage — append a revision carrying the same
 * `slot_id`, supersede the row it replaces, leave that row's execution alone —
 * performed at a different moment (DATA_MODEL §7). So this module owns only
 * what that lineage means *in terms of the snapshot the shell is holding*, and
 * it is pure: no client, no fetch, no React. `swap-provider.tsx` is the one
 * thing that calls a database with what these functions compute.
 *
 * Four questions, and each is its own function because each is a separate way
 * to get the requirement wrong:
 *
 *   * **What may replace this?** `swapOptions` — the *same* candidate query
 *     generation used, evaluated at swap time against the location this session
 *     is being performed at. Not one predicate is re-decided here: equipment,
 *     the user's exclusions and every limitation ran in SQL before a row
 *     arrived (`generation_candidate_sets`). What this narrows is duplication —
 *     an exercise already in the session is not an alternative to itself — and
 *     a narrowing is not a second opinion about eligibility.
 *   * **What does the replacement prescribe?** `prescriptionFor` — the outgoing
 *     row's own columns, with the exercise and its equipment substituted. A
 *     swap changes *which movement*, never how much of it: re-deriving sets and
 *     reps here would be this requirement quietly regenerating a slot.
 *   * **What does the snapshot look like afterwards?** `applySwap` — the
 *     superseded row keeps its set logs and its `execution_status`; the
 *     replacement arrives with none. That is the acceptance criterion about
 *     reconstruction ("3×8 Deadlift, then switched to RDL") expressed as the
 *     only shape the shell is allowed to hold afterwards, which is also why
 *     the shell never re-reads to find out: the two rows the write answered
 *     say everything that changed.
 *   * **What does undo go back to?** `undoTarget` — the row this one replaced,
 *     found through `replaces_id`, and restored *as a further revision* rather
 *     than by flipping a status. Lineage is append-only: `UNIQUE (replaces_id)`
 *     forbids branching, and re-activating a superseded row would drag its
 *     logs' `prescription_revision_status` with it through DATA-01d's composite
 *     foreign key — the sets already logged would stop being attached to the
 *     row that was actually performed, which is the defect the split statuses
 *     exist to prevent. Undo therefore restores the prior *exercise*, and the
 *     sets logged against it are untouched by that.
 */
import type { Candidate, SectionCandidates, SectionType } from '../data/candidates'
import type { SwapResult } from '../data/sessions'
import type {
  Prescription,
  SessionSnapshot,
  WorkoutExerciseRow,
} from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// What may replace a slot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One alternative for a slot: the exercise, the name to show, and the piece of
 * equipment it would be performed with at this location.
 *
 * The equipment is resolved here rather than at the point of the write because
 * `workout_exercises.equipment_used` is NOT NULL and `btrim(...) <> ''` — a
 * candidate whose usable equipment is empty cannot be prescribed at all, and it
 * is dropped from the list rather than offered and refused on tap.
 */
export interface SwapOption {
  readonly exerciseId: string
  readonly name: string
  readonly equipment: string
}

/**
 * The alternatives for one slot, from the candidate sets generation retrieves.
 *
 * `inUse` is every exercise the session already prescribes, the outgoing one
 * included. A section with no entry in `sections` answers an empty list, which
 * the caller renders as the empty state — "nothing else here fits" is an
 * answer, and it is not the same answer as a failed read.
 */
export function swapOptions(
  sections: readonly SectionCandidates[],
  sectionType: SectionType,
  outgoing: WorkoutExerciseRow,
  inUse: ReadonlySet<string>,
): readonly SwapOption[] {
  const section = sections.find((entry) => entry.section === sectionType)
  if (section === undefined) return []

  const options: SwapOption[] = []
  for (const candidate of section.candidates) {
    if (inUse.has(candidate.exerciseId)) continue

    const equipment = equipmentFor(outgoing.equipment_used, candidate)
    if (equipment === null) continue

    options.push({ exerciseId: candidate.exerciseId, name: candidate.name, equipment })
  }

  return options
}

/**
 * Which piece of equipment the replacement is performed with: the one the user
 * is already holding when the candidate can use it, and otherwise the
 * candidate's first usable one. The list is the database's — §3's query
 * intersects the catalog against the location — so "first usable" is a choice
 * among things this location actually has, never a guess about the gym.
 */
export function equipmentFor(outgoing: string, candidate: Candidate): string | null {
  if (candidate.usableEquipment.includes(outgoing)) return outgoing
  return candidate.usableEquipment[0] ?? null
}

/** Every exercise the session currently prescribes, superseded rows included. */
export function exercisesInUse(snapshot: SessionSnapshot): ReadonlySet<string> {
  const used = new Set<string>()
  for (const section of snapshot.sections) {
    for (const block of section.blocks) {
      for (const entry of block.exercises) used.add(entry.exercise.exercise_id)
    }
  }
  return used
}

// ─────────────────────────────────────────────────────────────────────────────
// Locating a slot in the snapshot
// ─────────────────────────────────────────────────────────────────────────────

/** Where a prescription sits: the row itself, and the section it is performed in. */
export interface SlotLocation {
  readonly exercise: WorkoutExerciseRow
  readonly sectionType: SectionType
}

/**
 * The prescription with this id, and the section it belongs to — or null when
 * the snapshot does not hold it, which is what a stale control taps.
 */
export function locateSlot(
  snapshot: SessionSnapshot,
  workoutExerciseId: string,
): SlotLocation | null {
  for (const section of snapshot.sections) {
    for (const block of section.blocks) {
      for (const entry of block.exercises) {
        if (entry.exercise.id === workoutExerciseId) {
          return { exercise: entry.exercise, sectionType: section.section.section_type }
        }
      }
    }
  }
  return null
}

/**
 * The row this one replaced, or null when the slot has never been swapped.
 *
 * Found through `replaces_id` rather than by walking `slot_id` backwards in
 * time: the predecessor is one hop, and the column is the lineage. A row whose
 * predecessor is not in the snapshot answers null — an undo that cannot name
 * what it would restore must not be offered.
 */
export function undoTarget(
  snapshot: SessionSnapshot,
  workoutExerciseId: string,
): WorkoutExerciseRow | null {
  const slot = locateSlot(snapshot, workoutExerciseId)
  if (slot === null || slot.exercise.replaces_id === null) return null

  const predecessor = locateSlot(snapshot, slot.exercise.replaces_id)
  return predecessor === null ? null : predecessor.exercise
}

// ─────────────────────────────────────────────────────────────────────────────
// What the replacement prescribes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `session_function` per section, for the one field of the contract that has
 * nowhere to land.
 *
 * Contract 4.1.0 §5 returns `session_function` and `anchor_relationship` per
 * exercise and `workout_exercises` has no column for either (`schemas.ts`,
 * DATA-01c) — `insert_prescription` drops both. A mid-workout swap has no model
 * to ask for them, so rather than echo a value it cannot read back, it says the
 * least it can: the function the *section* already implies, and an anchor
 * relationship of `neutral`, which claims nothing. Neither value reaches a row;
 * they exist so the payload is the shape `prescriptionSchema` describes.
 */
const SECTION_FUNCTION: Readonly<Record<SectionType, Prescription['session_function']>> = {
  warmup: 'prep',
  mobility: 'recovery',
  primary_lift: 'primary',
  accessory: 'accessory',
  skill_power: 'primary',
  carries: 'accessory',
  core: 'core',
  stability_balance: 'balance',
  conditioning: 'conditioning',
  cooldown: 'recovery',
}

/**
 * The prescription a swap writes: `row`'s own columns, performed as `exercise`.
 *
 * Every field that describes *how much work* travels unchanged — sets, the
 * target in whichever of its three shapes, per-side, rest, tempo, the load
 * guidance, the interval flag. Only the movement and its equipment change,
 * because that is the whole of what a swap is. Used twice: for the replacement
 * a user picks, and for an undo, which is the same operation reading the
 * predecessor's row.
 *
 * `null` for a row whose target columns contradict its `target_kind`. That row
 * cannot exist — `CONSTRAINT target_shape` refuses it — so null means the
 * snapshot in hand is not what the database holds, and the caller refuses the
 * swap. Inventing a rep count to make the payload well-formed would prescribe
 * work nobody asked for.
 */
export function prescriptionFor(
  row: WorkoutExerciseRow,
  exercise: { readonly exerciseId: string; readonly equipment: string },
  sectionType: SectionType,
): Prescription | null {
  const common = {
    exercise_id: exercise.exerciseId,
    equipment: exercise.equipment,
    session_function: SECTION_FUNCTION[sectionType],
    anchor_relationship: 'neutral',
    modality: row.modality,
    sets: row.sets,
    per_side: row.per_side,
    distance_unit: row.distance_unit,
    rest_seconds: row.rest_seconds,
    tempo: row.tempo,
    // `load_guidance` is nullable on the row and not in the contract. `none` is
    // the value that says the same thing the null does — no guidance — and it
    // is self-describing, so it needs no `load_value` to be coherent.
    load_type: row.load_type ?? 'none',
    load_value: row.load_value,
    is_interval_exercise: row.is_interval_exercise,
  } as const

  switch (row.target_kind) {
    case 'fixed':
      if (row.target_value === null) return null
      return {
        ...common,
        target_kind: 'fixed',
        target_value: row.target_value,
        target_min: null,
        target_max: null,
        target_sequence: null,
      }
    case 'range':
      if (row.target_min === null || row.target_max === null) return null
      return {
        ...common,
        target_kind: 'range',
        target_min: row.target_min,
        target_max: row.target_max,
        target_value: null,
        target_sequence: null,
      }
    case 'sequence':
      if (row.target_sequence === null) return null
      return {
        ...common,
        target_kind: 'sequence',
        target_sequence: row.target_sequence,
        target_value: null,
        target_min: null,
        target_max: null,
      }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The snapshot afterwards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The session as it stands once a swap has been written, from the two rows the
 * write answered.
 *
 * Computed rather than re-read, and that is a correctness decision before it is
 * a round-trip saved: a swap that succeeded and a re-read that failed would
 * leave the screen prescribing a movement the database has already superseded,
 * and the next set would be logged against it. `swap_session_exercise` answers
 * both rows precisely so the caller never has to ask a second question.
 *
 * The superseded entry keeps the set logs it arrived with. That is the
 * acceptance criterion — sets already logged stay attached to the row that was
 * actually performed — and the replacement arrives with none, so the next set
 * logged in this slot is attributed to it.
 */
export function applySwap(snapshot: SessionSnapshot, revision: SwapResult): SessionSnapshot {
  return {
    ...snapshot,
    sections: snapshot.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => {
        const present = block.exercises.some(
          (entry) => entry.exercise.id === revision.superseded.id,
        )
        if (!present) return block

        return {
          ...block,
          exercises: [
            ...block.exercises.map((entry) =>
              entry.exercise.id === revision.superseded.id
                ? { ...entry, exercise: revision.superseded }
                : entry,
            ),
            { exercise: revision.exercise, set_logs: [] },
          ],
        }
      }),
    })),
  }
}
