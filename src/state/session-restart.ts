/**
 * REQ-003 — restarting a past session from its detail, without a favorite and
 * without a model.
 *
 * A restart is the favorite restart minus the favorite: the session's own
 * *intended at start* reconstruction (SES-01b) is the stored prescription, and
 * `snapshotOf` — the same function a favorite is saved through — turns it into
 * the document Review takes. No generation call, and nothing written: Review's
 * Start is still what makes rows, so a restart the user backs out of leaves the
 * original session exactly as it was.
 *
 * Two questions, answered in this order and kept apart on purpose:
 *
 *   · **`restartEligibility`** is what the detail screen can say up front, from
 *     the record it already holds: only a completed session is offered, and
 *     only one recorded under a contract this build can still validate. A
 *     legacy session stays readable — the record is not the problem — but its
 *     Restart is unavailable and says why rather than failing on the tap.
 *   · **`restartAcceptance`** is the tap: rebuild, then validate against the
 *     schema for the version the session names (DATA_MODEL §11). A rebuild that
 *     does not validate is a typed refusal the screen reports in place.
 *
 * React-free and fetch-free, like `favorites.ts` beside it.
 */
import {
  createError,
  ErrorCode,
  err,
  isErr,
  ok,
  type AppError,
  type Result,
} from './errors'
import { OUTDATED_SNAPSHOT_REASON, isOutdatedSnapshot, snapshotOf } from './favorites'
import {
  parseBoundary,
  snapshotSchemaFor,
  SNAPSHOT_SCHEMAS,
  type SessionAcceptance,
  type SessionReconstruction,
} from './schemas'
import type { LocalDay } from './streak'

/** Why a session's Restart is not offered, in the words the screen shows. */
export const RESTART_NOT_COMPLETED_MESSAGE =
  'Only a completed workout can be restarted.'
export const RESTART_UNSUPPORTED_MESSAGE =
  'This workout was recorded before a change to how workouts are stored, so it can’t be restarted. Generate a new workout instead.'
/** A rebuild that did not validate. The original record is untouched by it. */
export const RESTART_FAILED_MESSAGE =
  'This workout couldn’t be rebuilt for a restart. Nothing about it has changed — try again, or generate a new workout.'

export type RestartEligibility =
  | { readonly available: true }
  | { readonly available: false; readonly reason: 'not_completed' | 'unsupported_contract'; readonly message: string }

/**
 * Whether this session can be restarted, from the record alone.
 *
 * Completed first: an abandoned or never-started session is a record of
 * something the user did not finish, and "restart" would be a claim about a
 * workout that has no finished version to repeat.
 */
export function restartEligibility(reconstruction: SessionReconstruction): RestartEligibility {
  if (reconstruction.state !== 'completed') {
    return { available: false, reason: 'not_completed', message: RESTART_NOT_COMPLETED_MESSAGE }
  }
  if (snapshotSchemaFor(reconstruction.session.contract_version) === null) {
    return {
      available: false,
      reason: 'unsupported_contract',
      message: RESTART_UNSUPPORTED_MESSAGE,
    }
  }
  return { available: true }
}

/**
 * The session's intended-at-start prescription, as an acceptance for `today`.
 *
 * The version gate runs before the rebuild so a legacy contract is refused by
 * name rather than by whatever part of the current schema it happens to trip.
 */
export function restartAcceptance(
  reconstruction: SessionReconstruction,
  today: LocalDay,
): Result<SessionAcceptance> {
  const version = reconstruction.session.contract_version
  const schema = snapshotSchemaFor(version)
  if (schema === null) {
    return err(
      createError(ErrorCode.VALIDATION_CONSTRAINT, {
        details: {
          reason: OUTDATED_SNAPSHOT_REASON,
          snapshot_contract_version: version,
          supported: Object.keys(SNAPSHOT_SCHEMAS),
        },
      }),
    )
  }

  const snapshot = snapshotOf(reconstruction)
  if (isErr(snapshot)) return snapshot

  const validated = parseBoundary(schema, snapshot.value)
  if (isErr(validated)) return validated

  return ok({ ...validated.value, date: today })
}

/** The sentence a refused restart is reported with. */
export function restartFailureMessage(error: AppError): string {
  return isOutdatedSnapshot(error) ? RESTART_UNSUPPORTED_MESSAGE : RESTART_FAILED_MESSAGE
}
