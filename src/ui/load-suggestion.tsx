/**
 * OVR-01c — the suggestion surface on Review: the affordance one anchored
 * prescription carries, the "why this number" `Dialog` it opens, and the status
 * the whole surface shows while its two reads are settling or have failed.
 *
 * Every number and every sentence comes from `src/state/load-suggestions.ts`,
 * which is where `suggestLoad` is called. This file decides treatment only:
 *
 *   * **Low confidence is a different affordance, not a footnote.** It leads
 *     with its own glyph and the words "Low confidence", the frame is dashed
 *     rather than solid and the number drops to the muted data face — so the
 *     tier reads before the weight does, in every skin and to a screen reader.
 *   * **A suggestion with no number says so** in words, and never as a zero.
 *     A prescription with no anchor has no entry at all, and the caller renders
 *     nothing for it.
 *   * **The override is this session's.** The dialog says so beside the field,
 *     and all it does is hand a weight back to the screen, which folds it into
 *     the acceptance payload through `applyLoadOverrides`. Nothing here can
 *     reach an anchor.
 *
 * Spec: `docs/specs/OVR-01_progressive-overload.md` §5 and UI touchpoints 2–3.
 */
import { useState, type CSSProperties } from 'react'

import {
  AlertTriangle,
  Button,
  HelpCircle,
  Input,
  Pencil,
  ScanLoader,
  WeightPlate,
} from '../design-system/index'
import type { AppError } from '../state/errors'
import {
  LOW_CONFIDENCE_LABEL,
  NO_SUGGESTION_LABEL,
  OVERRIDE_LABEL,
  OVERRIDE_SCOPE_NOTE,
  SUGGESTION_LABEL,
  deltaText,
  lastSetText,
  parseOverride,
  recordedRpeText,
  sessionCountText,
  suggestionSummary,
  weightText,
  type LoadOverride,
  type LoadSuggestionView,
} from '../state/load-suggestions'
import { AppDialog } from './app-dialog'

export const WHY_TITLE = 'Why this number'
export const LAST_SESSION_LABEL = 'Last session'
export const RULE_LABEL = 'Rule applied'
export const NO_LAST_SESSION_TEXT = 'No sets from a previous session are on record for this lift.'
export const APPLY_OVERRIDE_LABEL = 'Use this weight'
export const CLEAR_OVERRIDE_LABEL = 'Use the suggestion'
export const CLOSE_LABEL = 'Close'
export const OVERRIDE_INVALID_TEXT = 'Enter a weight above zero.'
export const SUGGESTIONS_LOADING_LABEL = 'Reading load history'
export const SUGGESTIONS_ERROR_TITLE = 'Suggested weights didn’t load'
export const SUGGESTIONS_RETRY_LABEL = 'Retry'

const DATA_STYLE: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  color: 'var(--text-card-label)',
  margin: 0,
}

const VALUE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--heading-h6-size)',
  color: 'var(--text-card-header)',
  margin: 0,
}

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--spacing-200)',
}

const STACK_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--spacing-200)',
}

const LIST_STYLE: CSSProperties = { ...STACK_STYLE, listStyle: 'none', margin: 0, padding: 0 }

// ─────────────────────────────────────────────────────────────────────────────
// The affordance
// ─────────────────────────────────────────────────────────────────────────────

export interface LoadSuggestionButtonProps {
  readonly suggestion: LoadSuggestionView
  readonly override: LoadOverride | null
  readonly onOpen: () => void
}

/**
 * One prescription's suggestion, as the control that explains it. The whole
 * reading is the accessible name, so "Low confidence" and the session count are
 * heard in the same breath as the number.
 */
export function LoadSuggestionButton({ suggestion, override, onOpen }: LoadSuggestionButtonProps) {
  const low = suggestion.confidence === 'low'
  const delta = override === null ? deltaText(suggestion.delta, suggestion.unit) : null

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={suggestionSummary(suggestion, override)}
      data-confidence={suggestion.confidence}
      style={{
        ...ROW_STYLE,
        alignSelf: 'flex-start',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        padding: 'var(--spacing-100) var(--spacing-200)',
        border: `var(--border-width) ${low ? 'dashed' : 'solid'} var(--border-card)`,
        borderRadius: 0,
      }}
    >
      {low && (
        <span style={{ ...DATA_STYLE, ...ROW_STYLE, textTransform: 'uppercase' }}>
          <HelpCircle size={16} />
          {LOW_CONFIDENCE_LABEL}
        </span>
      )}
      {!low && override === null && suggestion.weight !== null && (
        <WeightPlate size={16} />
      )}
      {override !== null ? (
        <>
          <span style={{ ...DATA_STYLE, textTransform: 'uppercase' }}>{OVERRIDE_LABEL}</span>
          <span style={VALUE_STYLE}>{weightText(override.weight, override.unit)}</span>
          <Pencil size={16} />
        </>
      ) : suggestion.weight === null ? (
        <span style={DATA_STYLE}>{NO_SUGGESTION_LABEL}</span>
      ) : (
        <>
          <span style={{ ...DATA_STYLE, textTransform: 'uppercase' }}>{SUGGESTION_LABEL}</span>
          <span style={low ? DATA_STYLE : VALUE_STYLE}>
            {weightText(suggestion.weight, suggestion.unit)}
          </span>
          {delta !== null && <span style={DATA_STYLE}>{delta}</span>}
        </>
      )}
      <span style={DATA_STYLE}>{sessionCountText(suggestion.sessionCount)}</span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The dialog
// ─────────────────────────────────────────────────────────────────────────────

export interface LoadSuggestionDialogProps {
  readonly suggestion: LoadSuggestionView
  readonly override: LoadOverride | null
  readonly open: boolean
  readonly onClose: () => void
  /** A weight for this session only, in the suggestion's unit. */
  readonly onOverride: (override: LoadOverride) => void
  readonly onClearOverride: () => void
}

/**
 * "Why this number": the sets the rule was read from, the RPE recorded across
 * them, the rule that fired in its own words, and the field that replaces the
 * number for this session.
 */
export function LoadSuggestionDialog({
  suggestion,
  override,
  open,
  onClose,
  onOverride,
  onClearOverride,
}: LoadSuggestionDialogProps) {
  const [draft, setDraft] = useState(
    override === null ? '' : String(override.weight),
  )
  const [invalid, setInvalid] = useState(false)
  const { lastSession, unit } = suggestion

  function apply() {
    const weight = parseOverride(draft)
    if (weight === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onOverride({ weight, unit })
    onClose()
  }

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={`${WHY_TITLE} · ${suggestion.name}`}
      actions={
        <>
          <Button variant="quiet" onClick={onClose}>
            {CLOSE_LABEL}
          </Button>
          {override !== null && (
            <Button
              variant="secondary"
              onClick={() => {
                setDraft('')
                onClearOverride()
                onClose()
              }}
            >
              {CLEAR_OVERRIDE_LABEL}
            </Button>
          )}
          <Button variant="primary" onClick={apply}>
            {APPLY_OVERRIDE_LABEL}
          </Button>
        </>
      }
    >
      <div style={STACK_STYLE}>
        <p style={{ ...ROW_STYLE, margin: 0 }}>
          {suggestion.confidence === 'low' && <HelpCircle size={16} />}
          {suggestionSummary(suggestion)}
        </p>

        <section style={STACK_STYLE} aria-label={LAST_SESSION_LABEL}>
          <p style={{ ...DATA_STYLE, textTransform: 'uppercase' }}>
            {lastSession === null ? LAST_SESSION_LABEL : `${LAST_SESSION_LABEL} · ${lastSession.date}`}
          </p>
          {lastSession === null ? (
            <p style={{ margin: 0 }}>{NO_LAST_SESSION_TEXT}</p>
          ) : (
            <>
              <ul style={LIST_STYLE}>
                {lastSession.sets.map((set) => (
                  <li key={set.setNumber}>{lastSetText(set, unit)}</li>
                ))}
              </ul>
              <p style={{ margin: 0 }}>{recordedRpeText(lastSession)}</p>
            </>
          )}
        </section>

        <section style={STACK_STYLE} aria-label={RULE_LABEL}>
          <p style={{ ...DATA_STYLE, textTransform: 'uppercase' }}>{RULE_LABEL}</p>
          <p style={{ margin: 0 }}>{suggestion.reason}</p>
        </section>

        <Input
          label={`${OVERRIDE_LABEL} (${unit})`}
          type="number"
          inputMode="decimal"
          value={draft}
          onChange={(value) => {
            setDraft(value)
            setInvalid(false)
          }}
          helperText={OVERRIDE_SCOPE_NOTE}
          errorText={invalid ? OVERRIDE_INVALID_TEXT : undefined}
        />
      </div>
    </AppDialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The surface's own states
// ─────────────────────────────────────────────────────────────────────────────

export type LoadSuggestionsStatusProps =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: AppError; readonly onRetry: () => void }

/**
 * The loading and error states of the anchor reads. Inline and small, because
 * they qualify one part of the briefing rather than replace it: the workout is
 * still readable and still startable while suggestions are missing.
 */
export function LoadSuggestionsStatus(props: LoadSuggestionsStatusProps) {
  if (props.status === 'loading') {
    return <ScanLoader label={SUGGESTIONS_LOADING_LABEL} />
  }

  return (
    <div role="alert" style={{ ...ROW_STYLE, justifyContent: 'space-between' }}>
      <p style={{ ...ROW_STYLE, margin: 0 }}>
        <span style={{ color: 'var(--icon-toast-negative)', display: 'flex' }}>
          <AlertTriangle size={16} />
        </span>
        <span>{SUGGESTIONS_ERROR_TITLE}</span>
        <span style={DATA_STYLE}>{props.error.message}</span>
      </p>
      <Button variant="quiet" size="sm" onClick={props.onRetry}>
        {SUGGESTIONS_RETRY_LABEL}
      </Button>
    </div>
  )
}
