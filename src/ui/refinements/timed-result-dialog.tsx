/**
 * TimedResultDialog — the four timed-result families' entry into the shared
 * focused logging dialog (TASK-046; REQ-019, C45; G07; R43, R81, R82, R100,
 * R115, R116; accepted gallery reference
 * eded158cfd928d382c9a9409e2c372270312741d, `GalleryLoggingMoment` with the
 * `emom` / `amrap` / `for_time` / `ladder` contexts; LOGGING-FIELDS.md).
 *
 * Deliberate consolidation of the two shared owners, adopted as they are:
 * where a timed block drew its `TimedResultLog` inline in its card, it now
 * draws one "Log results" action in the same place — the shared full-width
 * action row after the work (`.clr-timed-actions`) — and the same log, with
 * the same props, is held by `LoggingOverlay` titled "Log results", as the
 * accepted reference and the reviewed R7 replay compose it (R43: "Make this
 * the log button rather than just saying it's done"; R100: logging takes
 * focus and the workout behind it is unavailable while it is open).
 *
 * Presentation over the consumer, which keeps every owner it had:
 *
 * - **Fields and identity.** The props are the consumer's `TimedResultLog`
 *   props, passed through untouched: the EMOM's notes, the AMRAP's counts,
 *   For Time's and the ladder's Complete / Incomplete, the ladder's rounds,
 *   each movement's partial and load, the effort, `saved`. Nothing is added
 *   or removed, and no field is filled from the plan or the clock.
 * - **Drafts.** The consumer owns the record (its stored clock record, the
 *   ladder's durable draft, its memory effort and notes); the log keeps none.
 *   Closing — the framed "Close log" X or Escape — never unmounts the form
 *   and never touches the record, so a reopen shows exactly what was entered.
 * - **Writer.** There is no Save here, and none is invented: the block's
 *   result is saved, as before, by the section's one forward action through
 *   the shell's `BlockCompletionProvider` (REQ-013), from what the consumer
 *   reports. A refused save keeps everything for its retry; once the row is
 *   saved the consumer decides, as before, whether its log is still drawn.
 * - **Clocks.** The dialog pauses, resets and owns no clock (TASK-016).
 *
 * The one behaviour this owner adds to the log is the ladder's quiet
 * completion action (TASK-014, `Undo finish · Resume ladder`): the attempt it
 * resumes is back on the card, so the log closes in the same act, before the
 * consumer's own handler puts the focus on the race's lead control.
 *
 * Drawn from the first open on, and kept mounted (as the other focused logs
 * are, TASK-045): a section of blocks carries no closed dialog for a log
 * nobody opened, and the native dialog is still there to close itself and
 * return focus to the action that opened it. Portalled to the document body,
 * so nothing on the card is inherited into the dialog.
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'

import { Button } from '../../design-system/index'
import { LoggingOverlay } from './logging-overlay'
import { TimedResultLog, type TimedResultLogProps } from './timed-result-log'
import './tokens.css'
import './presentation.css'

/** The action that opens the log, and the dialog's title (accepted reference). */
export const TIMED_LOG_OPEN_LABEL = 'Log results'
export const TIMED_LOG_TITLE = 'Log results'

export type TimedResultDialogProps = TimedResultLogProps & {
  /**
   * The opener's emphasis. Primary once the attempt has ended — the log is
   * what is left to do; a log drawn before then (the ladder's) is offered as
   * a secondary action beside the attempt's own primary Start or Finish.
   */
  openerVariant?: 'primary' | 'secondary'
}

export function TimedResultDialog({ openerVariant = 'primary', ...log }: TimedResultDialogProps) {
  const [open, setOpen] = useState(false)
  const [asked, setAsked] = useState(false)
  const held = closingCompletionAction(log, () => setOpen(false))

  return (
    <>
      <div className="clr-timed-actions" data-timed-log-opener={log.format}>
        <Button
          variant={openerVariant}
          aria-expanded={open}
          onClick={() => {
            setAsked(true)
            setOpen(true)
          }}
        >
          {TIMED_LOG_OPEN_LABEL}
        </Button>
      </div>
      {asked
        ? createPortal(
            <LoggingOverlay open={open} title={TIMED_LOG_TITLE} onClose={() => setOpen(false)}>
              <TimedResultLog {...held} />
            </LoggingOverlay>,
            document.body,
          )
        : null}
    </>
  )
}

/**
 * The ladder's quiet completion action, closing the log first: Undo returns
 * the attempt to the card, where its lead control takes the focus.
 */
function closingCompletionAction(log: TimedResultLogProps, close: () => void): TimedResultLogProps {
  if (log.format === 'amrap' || log.format === 'emom') return log
  const action = log.completionAction ?? null
  if (action === null) return log
  return {
    ...log,
    completionAction: {
      label: action.label,
      onAction: () => {
        close()
        action.onAction()
      },
    },
  }
}
