/**
 * The readings a `MovementIdentity` shows, shared by its consumers (TASK-001;
 * G02, R31): Review, the live loggers and the accepted gallery state read the
 * same prescription columns through the same formatters, so the same movement
 * and data say the same thing in both contexts.
 */
import type { Enums } from '../../data/database.types'
import { exerciseName } from '../../state/prescription'
import { prescribedLoad } from '../../state/refinement-load-guidance'
import { equipmentName } from '../../state/review'

/**
 * The prescribed load to show beside a prescription, in either context. With
 * the compact equipment beside the name (R132), a `Bodyweight` load beside
 * `bodyweight` equipment says the same thing twice on one card, so the
 * equipment carries it alone — in a standard block as in a round (G02, R31,
 * AC-R002-01; TASK-002 widened TASK-001's round-only rule). Any other load is
 * the consumer's formatted reading (`loadText`), unchanged: a `Bodyweight` load
 * on a pull-up bar, a percentage or a weight is never hidden.
 */
export function prescribedLoadReading(load: string | null, equipment: string): string | null {
  if (load === null) return null
  return load.toLowerCase() === equipment.toLowerCase() ? null : load
}

/** The persisted prescription columns a live movement reads its identity from. */
export interface LiveMovementColumns {
  readonly exercise_id: string
  readonly equipment_used: string
  readonly load_type: Enums<'load_guidance'> | null
  readonly load_value: number | null
}

export interface LiveMovementReadings {
  readonly name: string
  readonly equipment: string
  /** The prescribed target load (R31), never a performed weight. */
  readonly load: string | null
}

/**
 * A live movement's name, compact equipment and prescribed load, through
 * Review's own formatters and the profile's unit. An unread unit states the
 * number without one rather than a guessed unit, as Review does.
 *
 * TASK-036 (G24, AC-R036-01): the load is the load-guidance read model's
 * prescribed target (`prescribedLoad`, over the same `loadText`): one target,
 * no range and no per-hand rewrite of the stored number.
 */
export function liveMovementReadings(
  prescription: LiveMovementColumns,
  weightUnit: Enums<'weight_unit'> | null,
): LiveMovementReadings {
  const equipment = equipmentName(prescription.equipment_used)
  const load = prescribedLoad(prescription, weightUnit).text
  return {
    name: exerciseName(prescription.exercise_id),
    equipment,
    load: prescribedLoadReading(load, equipment),
  }
}
