/**
 * The readings a `MovementIdentity` shows, shared by its consumers (TASK-001;
 * G02, R31): Review, the live loggers and the accepted gallery state read the
 * same prescription columns through the same formatters, so the same movement
 * and data say the same thing in both contexts.
 */
import type { Enums } from '../../data/database.types'
import { exerciseName } from '../../state/prescription'
import { equipmentName, loadText } from '../../state/review'

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
 */
export function liveMovementReadings(
  prescription: LiveMovementColumns,
  weightUnit: Enums<'weight_unit'> | null,
): LiveMovementReadings {
  const equipment = equipmentName(prescription.equipment_used)
  const load = prescription.load_type === null
    ? null
    : loadText(prescription.load_type, prescription.load_value, weightUnit)
  return {
    name: exerciseName(prescription.exercise_id),
    equipment,
    load: prescribedLoadReading(load, equipment),
  }
}
