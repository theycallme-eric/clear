/**
 * REQ-009 — the half-sheet every set is entered in.
 *
 * The active workout screen shows each movement's prescription, its saved
 * results and a Rest entry action (REQ-012) that opens this sheet and starts
 * the prescribed rest; the fields themselves open here, in one sheet floating
 * over the lower screen (B05-07.4), beside the rest that is running. The sheet's Log set N is
 * the only save, and never starts or restarts rest.
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
  use,
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
import { FittedScrollRegion } from './fitted-scroll-region'
import { EchoExcluded } from './foreground-echo'
import { useInvalidFocus } from './formFocus'
import { Heading, HeadingLevelProvider } from './Heading'
import {
  SetLoggingSheetHostContext,
  useSetLoggingSheetOpen,
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

/** Where the open sheet is drawn. */
export function SetLoggingSheetSlot() {
  return (
    <SetLoggingSheetHostContext.Consumer>
      {(host) => (host === null ? null : <div ref={host.attach} data-set-sheet-slot="" />)}
    </SetLoggingSheetHostContext.Consumer>
  )
}

/**
 * B05-07.4: the layer the open sheet floats in, over the lower workout content
 * and its Previous/Next rather than laid out above them. Behind the panel the
 * screen is dimmed and lightly blurred — the Dialog backdrop's dim and blur,
 * without its scanline and static layers.
 *
 * The backdrop is only a picture. It is not a native Dialog: it traps no
 * focus, answers no Escape and dismisses nothing when tapped, so the sheet
 * keeps its one explicit Minimize and the content above stays as reachable as
 * it was. The panel scrolls through the public region (GLOBAL-03).
 */
export function SetLoggingSheetOverlay() {
  const open = useSetLoggingSheetOpen()
  return (
    <div className="clr-set-sheet-layer" data-open={open ? '' : undefined}>
      {open ? <div aria-hidden="true" className="clr-set-sheet-layer__backdrop" /> : null}
      <FittedScrollRegion className="clr-set-sheet-layer__entry">
        <SetLoggingSheetSlot />
      </FittedScrollRegion>
    </div>
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

  // Opening the sheet takes the reader to it — it is drawn over the lower
  // screen, away from the card whose Rest opened it. In the shell's overlay
  // the title is already in view, and its region has not been sized yet:
  // scrolling to it there would leave the sheet opened part-way down.
  const hosted = use(SetLoggingSheetHostContext) !== null
  useEffect(() => {
    document.getElementById(titleId)?.focus({ preventScroll: hosted })
  }, [titleId, hosted])

  return (
    // Portalled out of the block's card, the sheet is not inside it: React
    // context would otherwise carry that card's containment along, and the
    // rest's timer card would lose its own frame. It is still not on the
    // background (REQ-004), so nothing in it echoes.
    <CardContainmentContext.Provider value={false}>
    <EchoExcluded>
    <section aria-labelledby={titleId} className="clr-set-sheet" data-mode={mode}>
      <div className="clr-bleed" style={STRUCTURE_BLEED_STYLE}>
        {/*
          B05-07.3: the frame carries the shipped accent bar in every mode.
          Overlays otherwise carry none; this app-owned sheet is the owner's
          scoped exception (ledger EXC-06). The sheet is still not a card, so
          the rest's timer card inside it is not a nested one.
        */}
        <span className="clr-card__bar clr-set-sheet__bar" aria-hidden="true" />
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
    </EchoExcluded>
    </CardContainmentContext.Provider>
  )
}

/** Weight / Unit / Reps — or Seconds, or only the measure — on one row. */
export function SetMeasurementRow({ children }: { children: ReactNode }) {
  return <div className="clr-set-sheet__measures">{children}</div>
}
