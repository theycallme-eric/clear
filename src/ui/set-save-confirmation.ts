/**
 * TASK-020 (REQ-020; C46, G12; R07, R17) — the deliberate Save's lifecycle in
 * the set-logging sheet: what the sheet shows after Log set N or Log round N,
 * and when that ends.
 *
 *   · **Save confirms; it does not move on.** An accepted entry is replaced by
 *     its confirmation — the saved result read back from the shell's set list —
 *     beside the rest that was already running. The next set's form is not
 *     drawn in its place.
 *   · **The rest is the existing one.** Nothing here starts, restarts or
 *     extends a rest: the rest is the session's one (`rest-provider.tsx`), and
 *     its Add 30s and Skip rest are the shared bar's. The confirmation only
 *     remembers which rest it was saved during — the period's identity, its
 *     start and its prescription — so an extension keeps it and a different
 *     rest is never mistaken for it.
 *   · **Rest end collapses and resets.** When that rest runs out or is
 *     skipped, a sheet still showing the confirmation collapses, and the
 *     confirmation is over: the next deliberate Rest opens the next entry.
 *     Nothing is ever opened by the rest ending, and nothing is recorded by it.
 *   · **An early collapse is the athlete's.** Minimize before the rest ends
 *     closes the sheet and ends the confirmation there; the rest ending later
 *     finds nothing open and reopens nothing.
 *   · **No rest, no clock to wait for.** Saved with no rest running, the
 *     confirmation stays until the athlete collapses it.
 *
 * It is derived, not scheduled: no timer of its own, no write, no storage.
 */
import { useEffect, useRef, useState } from 'react'

import { useRestTimer, type RestPeriod } from '../state/rest'

/** The entry just saved, and the rest it was saved during. */
interface SavedEntry {
  /** The set number, or the superset's round number, the Save recorded. */
  readonly entry: number
  /** The running rest's identity at Save, or null when none was running. */
  readonly rest: RestIdentity | null
}

interface RestIdentity {
  readonly exerciseId: string
  readonly startedAt: number
}

function identity(rest: RestPeriod): RestIdentity {
  return { exerciseId: rest.exerciseId, startedAt: rest.startedAt }
}

export interface SaveConfirmationOptions {
  /** Whether this logger's sheet is open. */
  readonly open: boolean
  /** True while the open sheet holds a correction rather than the confirmation. */
  readonly editing?: boolean
  /**
   * Whether the shell's set list holds the confirmed entry. A Save the shell
   * refused never appears there, and its entry stays on the form instead.
   */
  readonly recorded: (entry: number) => boolean
  /**
   * The rest the confirmation was saved during has ended while the sheet still
   * shows it: collapse the sheet. Called once per ending.
   */
  readonly onRestEnd: () => void
}

export interface SaveConfirmation {
  /** The entry being confirmed, or null when the sheet shows a form. */
  readonly confirmed: number | null
  /** Log set N / Log round N was accepted: confirm `entry`. */
  confirm(entry: number): void
  /** A deliberate collapse or next entry: the confirmation is over. */
  reset(): void
}

export function useSaveConfirmation({
  open,
  editing = false,
  recorded,
  onRestEnd,
}: SaveConfirmationOptions): SaveConfirmation {
  const { rest, remainingSeconds } = useRestTimer()
  const [saved, setSaved] = useState<SavedEntry | null>(null)

  const running = rest !== null && remainingSeconds > 0
  const sameRest =
    saved !== null &&
    saved.rest !== null &&
    running &&
    rest.exerciseId === saved.rest.exerciseId &&
    rest.startedAt === saved.rest.startedAt
  // The rest it was saved during has run out, been skipped or been replaced.
  const restEnded = saved !== null && saved.rest !== null && !sameRest
  const confirmed = saved !== null && !restEnded && recorded(saved.entry) ? saved.entry : null

  // Read at the moment the rest ends, not when the effect was declared.
  // Whether the sheet holds a confirmation at all: a refused Save keeps its
  // form, and a form is never collapsed by a rest ending.
  const holdsConfirmation = saved !== null && recorded(saved.entry)
  const latest = useRef({ open, editing, holdsConfirmation, onRestEnd })
  useEffect(() => {
    latest.current = { open, editing, holdsConfirmation, onRestEnd }
  })

  // The transition only: a sheet reopened afterwards is a deliberate entry,
  // and an edit left open over the ending is not collapsed under the athlete.
  useEffect(() => {
    if (!restEnded) return
    const now = latest.current
    if (now.open && !now.editing && now.holdsConfirmation) now.onRestEnd()
  }, [restEnded])

  return {
    confirmed,
    confirm(entry) {
      setSaved({ entry, rest: running && rest !== null ? identity(rest) : null })
    },
    reset() {
      setSaved(null)
    },
  }
}

/**
 * Whether the reader was in the sheet (or nowhere) when the rest ended, so an
 * automatic collapse returns focus to the entry action only then — never
 * pulling it away from somewhere else the athlete went. Since TASK-043 the
 * entry may be held by the focused logging dialog (`.clr-accepted-log`), whose
 * X and title are part of it too.
 */
export function focusIsInSetSheet(): boolean {
  const focused = document.activeElement
  return (
    focused === null ||
    focused === document.body ||
    focused.closest('.clr-set-sheet, .clr-accepted-log') !== null
  )
}
