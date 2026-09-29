/**
 * OVR-01c — the suggestion surface's own markup, over views produced by the
 * real `reviewLoadSuggestions`. No view here is written by hand: a test that
 * built its own `LoadSuggestionView` would pass for a screen that did its own
 * arithmetic, and the criterion is that the number is the rule table's.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createError, ErrorCode } from '../state/errors'
import {
  LOW_CONFIDENCE_LABEL,
  NO_SUGGESTION_LABEL,
  OVERRIDE_SCOPE_NOTE,
  reviewLoadSuggestions,
  sessionCountText,
  weightText,
  type LoadSuggestionView,
} from '../state/load-suggestions'
import type { AnchorEvidenceRow, LoadAnchorRow } from '../state/schemas'
import { anchorRow, evidenceRows, suggestionAcceptance } from '../test/load-suggestion-fixtures'
import {
  APPLY_OVERRIDE_LABEL,
  CLEAR_OVERRIDE_LABEL,
  LoadSuggestionButton,
  LoadSuggestionDialog,
  LoadSuggestionsStatus,
  NO_LAST_SESSION_TEXT,
  OVERRIDE_INVALID_TEXT,
  SUGGESTIONS_ERROR_TITLE,
  SUGGESTIONS_LOADING_LABEL,
  WHY_TITLE,
} from './load-suggestion'

function suggestionFor(
  anchors: readonly LoadAnchorRow[],
  evidence: readonly AnchorEvidenceRow[] = evidenceRows(),
): LoadSuggestionView {
  const suggestions = reviewLoadSuggestions({
    acceptance: suggestionAcceptance(),
    anchors,
    evidence,
  })
  const [view] = [...suggestions.values()]
  if (view === undefined) throw new Error('expected one suggestion')
  return view
}

describe('the suggestion affordance', () => {
  it('states the rule table’s weight beside its session-count confidence', () => {
    const suggestion = suggestionFor([anchorRow()])
    expect(suggestion.weight).not.toBeNull()

    render(<LoadSuggestionButton suggestion={suggestion} override={null} onOpen={() => undefined} />)

    const button = screen.getByRole('button')
    expect(button).toHaveTextContent(weightText(suggestion.weight ?? 0, 'kg'))
    expect(button).toHaveTextContent(sessionCountText(4))
    expect(button).not.toHaveTextContent(LOW_CONFIDENCE_LABEL)
    expect(button).toHaveAttribute('data-confidence', 'high')
  })

  it('leads a low-confidence suggestion with the words, in a distinct frame', () => {
    const suggestion = suggestionFor([anchorRow({ session_count: 1, confidence: 'low' })])
    expect(suggestion.confidence).toBe('low')

    render(<LoadSuggestionButton suggestion={suggestion} override={null} onOpen={() => undefined} />)

    const button = screen.getByRole('button')
    // The tier is read before the number, not after it as a footnote.
    const text = button.textContent ?? ''
    expect(text.indexOf(LOW_CONFIDENCE_LABEL)).toBeGreaterThanOrEqual(0)
    expect(text.indexOf(LOW_CONFIDENCE_LABEL)).toBeLessThan(
      text.indexOf(weightText(suggestion.weight ?? 0, 'kg')),
    )
    expect(button).toHaveAccessibleName(expect.stringContaining(LOW_CONFIDENCE_LABEL))
    expect(button.style.border).toContain('dashed')
  })

  it('says there is no number rather than showing a zero', () => {
    const suggestion = suggestionFor([anchorRow({ last_session_date: '2026-05-01' })])
    expect(suggestion.weight).toBeNull()

    render(<LoadSuggestionButton suggestion={suggestion} override={null} onOpen={() => undefined} />)

    const button = screen.getByRole('button')
    expect(button).toHaveTextContent(NO_SUGGESTION_LABEL)
    expect(button.textContent).not.toMatch(/\b0 kg\b/)
  })

  it('shows the override in place of the suggestion once one is set', () => {
    const suggestion = suggestionFor([anchorRow()])

    render(
      <LoadSuggestionButton
        suggestion={suggestion}
        override={{ weight: 200, unit: 'kg' }}
        onOpen={() => undefined}
      />,
    )

    expect(screen.getByRole('button')).toHaveTextContent('200 kg')
  })
})

describe('the why-this-number dialog', () => {
  function renderDialog(suggestion: LoadSuggestionView, override = null as { weight: number; unit: 'kg' } | null) {
    const onOverride = vi.fn()
    const onClearOverride = vi.fn()
    const onClose = vi.fn()
    render(
      <LoadSuggestionDialog
        open
        suggestion={suggestion}
        override={override}
        onClose={onClose}
        onOverride={onOverride}
        onClearOverride={onClearOverride}
      />,
    )
    return { onOverride, onClearOverride, onClose }
  }

  it('shows last session’s sets, the RPE recorded and the rule that fired', () => {
    const suggestion = suggestionFor([anchorRow()])
    renderDialog(suggestion)

    const dialog = screen.getByRole('dialog', { name: new RegExp(WHY_TITLE) })
    const items = within(dialog).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Set 1 · 8 of 8 reps · 85 kg · RPE 7.5')
    expect(dialog).toHaveTextContent('RPE 7.5 median across 3 sets')
    expect(dialog).toHaveTextContent(suggestion.reason)
    expect(suggestion.reason).toMatch(/all reps completed → \+1 increment/)
    expect(dialog).toHaveTextContent(OVERRIDE_SCOPE_NOTE)
  })

  it('says so when there are no previous sets to explain from', () => {
    renderDialog(suggestionFor([anchorRow()], []))

    expect(screen.getByRole('dialog')).toHaveTextContent(NO_LAST_SESSION_TEXT)
  })

  it('hands back a typed weight in the suggestion’s unit', async () => {
    const user = userEvent.setup()
    const { onOverride, onClose } = renderDialog(suggestionFor([anchorRow()]))

    await user.type(screen.getByRole('spinbutton'), '205')
    await user.click(screen.getByRole('button', { name: APPLY_OVERRIDE_LABEL }))

    expect(onOverride).toHaveBeenCalledWith({ weight: 205, unit: 'kg' })
    expect(onClose).toHaveBeenCalled()
  })

  it('refuses a weight that is not one', async () => {
    const user = userEvent.setup()
    const { onOverride } = renderDialog(suggestionFor([anchorRow()]))

    await user.type(screen.getByRole('spinbutton'), '0')
    await user.click(screen.getByRole('button', { name: APPLY_OVERRIDE_LABEL }))

    expect(onOverride).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveTextContent(OVERRIDE_INVALID_TEXT)
  })

  it('returns to the suggestion when an override is cleared', async () => {
    const user = userEvent.setup()
    const { onClearOverride } = renderDialog(suggestionFor([anchorRow()]), {
      weight: 200,
      unit: 'kg',
    })

    await user.click(screen.getByRole('button', { name: CLEAR_OVERRIDE_LABEL }))

    expect(onClearOverride).toHaveBeenCalled()
  })
})

describe('the surface’s loading and error states', () => {
  it('announces loading with a ScanLoader', () => {
    render(<LoadSuggestionsStatus status="loading" />)

    expect(screen.getByText(new RegExp(SUGGESTIONS_LOADING_LABEL))).toBeInTheDocument()
  })

  it('names the failure and offers a retry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <LoadSuggestionsStatus
        status="error"
        error={createError(ErrorCode.PERSISTENCE_READ_FAILED)}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(SUGGESTIONS_ERROR_TITLE)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
