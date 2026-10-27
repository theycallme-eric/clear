/**
 * REQ-009 — the half-sheet every set is entered in.
 *
 * The active workout screen shows each movement's prescription, its saved
 * results and an explicit Log set action; the fields themselves open here,
 * in one sheet docked in the pinned foot, beside the rest that is running.
 * New-entry and edit are the same sheet in two modes:
 *
 *   · a `Log set N` / `Edit set N` title — `Log round N` for a superset's
 *     round (REQ-016) — with the top collapse chevron, the sheet's one
 *     minimise control;
 *   · the movement's context, then the running rest if there is one, drawn
 *     with the shared timer card rather than by recolouring the sheet;
 *   · the measurement row and the set's optional effort (`set-effort.tsx`),
 *     both supplied by the logger that owns the draft;
 *   · one full-width Log set, or Cancel / Save correction as a pair — and,
 *     where the shell can clear a saved set, a quiet Clear set above the pair.
 *
 * It owns no draft and writes nothing. The logger that opens it keeps the
 * entry and decides what a submit means, so collapsing the sheet loses
 * nothing and only an explicit Log set records an observation.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

import { Button, ChevronDown, IconButton } from '../design-system/index'
import { CardContainmentContext } from './card-context'
import { ActionGroup } from './composition'
import { useInvalidFocus } from './formFocus'
import { Heading, HeadingLevelProvider } from './Heading'
import {
  SetLoggingSheetHostContext,
  type SetLoggingSheetHostApi,
} from './set-logging-sheet-context'
import { RestTimerBar } from './workout-chrome'
import './set-logging-sheet.css'

// ─────────────────────────────────────────────────────────────────────────────
// Host and slot
// ─────────────────────────────────────────────────────────────────────────────

/** Mounted once by the workout shell: at most one movement's sheet is open. */
export function SetLoggingSheetHost({ children }: { children: ReactNode }) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)

  const open = useCallback((key: string) => setOpenKey(key), [])
  const close = useCallback(
    (key: string) => setOpenKey((current) => (current === key ? null : current)),
    [],
  )

  const api = useMemo<SetLoggingSheetHostApi>(
    () => ({ openKey, open, close, container, attach: setContainer }),
    [openKey, open, close, container],
  )

  return <SetLoggingSheetHostContext value={api}>{children}</SetLoggingSheetHostContext>
}

/** Where the open sheet is drawn: the shell's pinned foot, above navigation. */
export function SetLoggingSheetSlot() {
  return (
    <SetLoggingSheetHostContext.Consumer>
      {(host) => (host === null ? null : <div ref={host.attach} data-set-sheet-slot="" />)}
    </SetLoggingSheetHostContext.Consumer>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The sheet
// ─────────────────────────────────────────────────────────────────────────────

export type SetSheetMode = 'new' | 'edit'

export interface SetLoggingSheetProps {
  mode: SetSheetMode
  setNumber: number
  /**
   * What the entry is called in the title and on its action, where it is not
   * one set — a superset's `round 2` (REQ-016). Omitted, it is `set N`.
   */
  entryName?: string
  /** The form's accessible name — `Log set 2 of back squat`. */
  formLabel: string
  /** The movement, its prescription and its equipment, in one line. */
  context: ReactNode
  /** The compact measurement row — see `SetMeasurementRow`. */
  measures: ReactNode
  /** The per-set effort, inserted between the measures and the action. */
  effort?: ReactNode
  /**
   * The countdown drawn below the context. Omitted, it is the session's one
   * rest, which is absent whenever no rest is running.
   */
  rest?: ReactNode
  saving?: boolean
  blocked?: boolean
  /**
   * Log set or Save correction. Returns whether the entry was accepted; a
   * refusal sends the caret to the first invalid field (CORE-05).
   */
  onSubmit(): boolean
  /** Edit mode only: leave the stored result as it is. */
  onCancel?(): void
  /**
   * Edit mode only: ask to clear this saved result — the wrong-movement
   * recovery (REQ-013). The caller confirms before anything is removed.
   */
  onClear?(): void
  onCollapse(): void
}

const STRUCTURE_BLEED_STYLE = { '--bleed': 'var(--border-frame-structure)' } as CSSProperties

const CONTEXT_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
  color: 'var(--text-card-label)',
}

export function SetLoggingSheet({
  mode,
  setNumber,
  entryName = `set ${setNumber}`,
  formLabel,
  context,
  measures,
  effort,
  rest,
  saving = false,
  blocked = false,
  onSubmit,
  onCancel,
  onClear,
  onCollapse,
}: SetLoggingSheetProps) {
  const titleId = useId()
  const bodyId = useId()
  const submitWith = useInvalidFocus()

  // Opening the sheet takes the reader to it — it is drawn in the pinned
  // foot, away from the card whose Log set opened it.
  useEffect(() => {
    document.getElementById(titleId)?.focus()
  }, [titleId])

  return (
    // Portalled out of the block's card, the sheet is not inside it: React
    // context would otherwise carry that card's containment along, and the
    // rest's timer card would lose its own frame.
    <CardContainmentContext.Provider value={false}>
    <section aria-labelledby={titleId} className="clr-set-sheet" data-mode={mode}>
      <div className="clr-bleed" style={STRUCTURE_BLEED_STYLE}>
        <div
          id={bodyId}
          className="clr-chamfer clr-chamfer--md clr-chamfer--structure clr-set-sheet__frame"
        >
          <div className="clr-row clr-set-sheet__head">
            <HeadingLevelProvider level={2}>
              <Heading id={titleId} tabIndex={-1} className="clr-set-sheet__title">
                {mode === 'edit' ? 'Edit' : 'Log'} {entryName}
              </Heading>
            </HeadingLevelProvider>
            <IconButton
              label="Minimize"
              icon={<ChevronDown />}
              aria-expanded
              aria-controls={bodyId}
              onClick={onCollapse}
            />
          </div>

          <p style={CONTEXT_STYLE}>{context}</p>

          {rest === undefined ? <RestTimerBar /> : rest}

          <form
            aria-label={formLabel}
            onSubmit={submitWith(onSubmit)}
            className="clr-stack clr-stack--tight"
          >
            {measures}
            {effort}
            {mode === 'edit' && onClear !== undefined ? (
              <ActionGroup>
                <Button type="button" variant="quiet" size="sm" aria-label={`Clear set ${setNumber}`} onClick={onClear}>
                  Clear set
                </Button>
              </ActionGroup>
            ) : null}
            {mode === 'edit' ? (
              <ActionGroup className="clr-action-group--paired">
                <Button type="button" variant="secondary" size="lg" onClick={onCancel}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="lg" loading={saving} disabled={blocked}>
                  Save correction
                </Button>
              </ActionGroup>
            ) : null}
            {mode === 'edit' ? null : (
              <ActionGroup>
                <Button type="submit" variant="primary" size="lg" loading={saving} disabled={blocked}>
                  Log {entryName}
                </Button>
              </ActionGroup>
            )}
          </form>
        </div>
      </div>
    </section>
    </CardContainmentContext.Provider>
  )
}

/** Weight / Unit / Reps — or Seconds, or only the measure — on one row. */
export function SetMeasurementRow({ children }: { children: ReactNode }) {
  return <div className="clr-set-sheet__measures">{children}</div>
}
