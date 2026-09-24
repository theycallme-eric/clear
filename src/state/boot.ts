/**
 * REQ-057 — what the boot sequence is, as arithmetic over the app's real
 * initialization.
 *
 * Pattern 7 (`docs/design/exports/clear-design-system-0.6.0/docs/patterns.md`)
 * and the Boot Sequence template state the rule this module exists to make
 * structural: **the sequence is as long as the work is.** There is no timer
 * here, no minimum duration, and no step that resolves on anything but a read
 * finishing — so "never manufactures delay" is a property of the shape rather
 * than a discipline someone has to keep. `boot.test.ts` asserts that negative
 * against this file's source, because a `setTimeout` added for effect is
 * exactly the kind of change no behavioural test would notice.
 *
 * Four checks, in the order the template writes them: profile, session
 * history, equipment, constraints. Each is one of the reads the app performs
 * anyway (`boot-queries.ts` binds them), so the rows a user sees are the work
 * that is actually happening and not a script playing beside it.
 *
 * The view is a total function of the four check states:
 *
 *   * any check failed → `failed`, naming the first failure in step order,
 *     with the template's data-intact reassurance and one retry;
 *   * all four done → `ready`, which is the app continuing on its own;
 *   * otherwise `checking`, with a row per finished check and real progress.
 *
 * `ready` is the whole of "auto-continue": there is no `entered` flag and no
 * action that produces one, because a gate in front of a ready app is the
 * thing pattern 7 names as the failure.
 */
import type { HistoryPage } from '../data/history'
import type { UserConstraint } from '../data/constraints'
import type { AppError } from './errors'
import type { Location, Profile } from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────────────────────

export type BootStepId = 'profile' | 'history' | 'equipment' | 'constraints'

export interface BootStep {
  readonly id: BootStepId
  /** The row's leading noun. Terse system lines, per pattern 7's content rule. */
  readonly label: string
  /** What the failure sentence says could not be read. */
  readonly subject: string
}

/** The four checks, in the order the template lists them. */
export const BOOT_STEPS: readonly BootStep[] = [
  { id: 'profile', label: 'Profile', subject: 'your profile' },
  { id: 'history', label: 'Session history', subject: 'session history' },
  { id: 'equipment', label: 'Equipment', subject: 'your equipment' },
  { id: 'constraints', label: 'Constraints', subject: 'your constraints' },
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Copy
// ─────────────────────────────────────────────────────────────────────────────

/** The `ScanLoader` label while initialization runs. */
export const BOOT_LABEL = 'System check'

/** The failure heading, verbatim from the template. */
export const BOOT_FAILURE_TITLE = 'System check failed'

/** The reassurance that follows every failure sentence, verbatim. */
export const BOOT_DATA_INTACT = 'Your data is intact.'

/** The one recovery action. */
export const BOOT_RETRY_LABEL = 'Retry'

// ─────────────────────────────────────────────────────────────────────────────
// Checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One check's state. `detail` is the right-hand side of its row — "loaded",
 * "42 entries" — and exists only once the read that produced it has answered.
 */
export type BootCheck =
  | { readonly status: 'checking' }
  | { readonly status: 'done'; readonly detail: string }
  | { readonly status: 'failed'; readonly error: AppError }

/**
 * Every step's state. A record rather than a list, so a step that nobody bound
 * to a read fails to compile instead of silently never completing.
 */
export type BootChecks = Readonly<Record<BootStepId, BootCheck>>

export interface BootFailure {
  readonly step: BootStep
  /** The read's own error — its code and requestId are what support needs. */
  readonly error: AppError
  /** What failed, plus the reassurance. Fixed copy, never the raw error text. */
  readonly message: string
}

export type BootView =
  | {
      readonly status: 'checking'
      /** Finished rows, in step order. Decorative; `ScanLoader` hides them. */
      readonly lines: readonly string[]
      /** Checks finished, out of `max`. Real progress, so it may be shown. */
      readonly value: number
      readonly max: number
    }
  | { readonly status: 'failed'; readonly failure: BootFailure }
  | { readonly status: 'ready' }

/** The sentence a failed step shows: what could not be read, then the promise. */
export function bootFailureMessage(step: BootStep): string {
  return `Could not read ${step.subject}. ${BOOT_DATA_INTACT}`
}

/**
 * The boot screen, derived from the four checks and nothing else.
 *
 * Failure wins over progress: a user whose history read 500'd is not told the
 * app is still working. The first failure in step order is the one named, so
 * two simultaneous failures still produce one sentence and one retry.
 */
export function bootView(checks: BootChecks): BootView {
  const lines: string[] = []

  for (const step of BOOT_STEPS) {
    const check = checks[step.id]
    if (check.status === 'failed') {
      return {
        status: 'failed',
        failure: { step, error: check.error, message: bootFailureMessage(step) },
      }
    }
    if (check.status === 'done') {
      lines.push(`${step.label} · ${check.detail}`)
    }
  }

  return lines.length === BOOT_STEPS.length
    ? { status: 'ready' }
    : { status: 'checking', lines, value: lines.length, max: BOOT_STEPS.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// Details
// ─────────────────────────────────────────────────────────────────────────────
//
// What each row says once its read has answered. Every one of them is a fact
// about the data that arrived: nothing here is a label chosen in advance, which
// is what stops the log from being a script.

/** A user with no row yet is a fact, not an error — ONB-01 is what they see next. */
export function profileDetail(profile: Profile | null): string {
  return profile === null ? 'new account' : 'loaded'
}

export function historyDetail(page: HistoryPage): string {
  const count = page.sessions.length
  if (count === 0) return 'no entries'
  return `${String(count)}${page.hasMore ? '+' : ''} ${count === 1 ? 'entry' : 'entries'}`
}

/**
 * Equipment is read as the user's locations — the default one is the place a
 * session is generated for, so naming it is naming the equipment in force.
 */
export function equipmentDetail(locations: readonly Location[]): string {
  const preferred = locations.find((location) => location.is_default) ?? locations[0]
  return preferred === undefined ? 'none set' : preferred.name
}

export function constraintsDetail(constraints: readonly UserConstraint[]): string {
  const count = constraints.length
  return count === 0 ? 'none' : `${String(count)} in force`
}
