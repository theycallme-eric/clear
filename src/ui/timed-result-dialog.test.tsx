/**
 * TASK-046 (REQ-019, C45; G07; R43, R100): the timed families' entry into the
 * shared focused dialog (`refinements/timed-result-dialog.tsx`), read in
 * isolation over memory controllers. The route adoption, its writers, clocks
 * and the four skins are proved in the browser by `e2e/refinement/task-046.spec.ts`.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { TIMED_LOG_OPEN_LABEL, TIMED_LOG_TITLE, TimedResultDialog } from './refinements/timed-result-dialog'
import type { CompletionResult, EmomResult } from './refinements/timed-result-log'

function MemoryEmom({ onChange }: { onChange?: (next: EmomResult) => void }) {
  const [value, setValue] = useState<EmomResult>({ notes: '' })
  return (
    <TimedResultDialog
      format="emom"
      value={value}
      onChange={(next) => {
        onChange?.(next)
        setValue(next)
      }}
    />
  )
}

function MemoryLadder({ onUndo }: { onUndo: () => void }) {
  const [value, setValue] = useState<CompletionResult>({ completed: false, effort: null })
  return (
    <TimedResultDialog
      format="ladder"
      value={value}
      onChange={setValue}
      completionAction={{ label: 'Undo finish · Resume ladder', onAction: onUndo }}
    />
  )
}

describe('TASK-046 TimedResultDialog', () => {
  it('draws one Log results action and no log until it is opened; the log opens in the shared modal titled Log results, named by it, with the framed Close log X focused', async () => {
    const user = userEvent.setup()
    render(<MemoryEmom />)
    const opener = screen.getByRole('button', { name: TIMED_LOG_OPEN_LABEL })
    expect(opener).toHaveClass('clr-btn--primary')
    expect(opener.closest('[data-timed-log-opener="emom"]')).toHaveClass('clr-timed-actions')
    expect(opener).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('dialog')).toBeNull()
    expect(document.querySelector('form.clr-timed-log')).toBeNull()

    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: TIMED_LOG_TITLE })
    expect(dialog).toHaveClass('clr-accepted-log')
    expect(dialog.parentElement).toBe(document.body)
    expect(opener).toHaveAttribute('aria-expanded', 'true')
    const form = dialog.querySelector<HTMLElement>('form.clr-timed-log')!
    expect(form.dataset.timedFormat).toBe('emom')
    const title = within(dialog).getByRole('heading', { name: TIMED_LOG_TITLE })
    expect(form.getAttribute('aria-labelledby')).toBe(title.id)
    expect(within(form).queryByRole('heading')).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Close log' })).toHaveFocus()
    // No Save is invented: the route's section forward action is the writer.
    expect(within(dialog).queryByRole('button', { name: /save/i })).toBeNull()
  })

  it('closes by the X or Escape without touching the consumer’s record, and a reopen shows the draft', async () => {
    const user = userEvent.setup()
    const changes = vi.fn()
    render(<MemoryEmom onChange={changes} />)
    await user.click(screen.getByRole('button', { name: TIMED_LOG_OPEN_LABEL }))
    await user.type(screen.getByRole('textbox', { name: 'Notes · optional' }), 'Dropped a rep')
    const typed = changes.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Close log' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(changes).toHaveBeenCalledTimes(typed)

    await user.click(screen.getByRole('button', { name: TIMED_LOG_OPEN_LABEL }))
    expect(screen.getByRole('textbox', { name: 'Notes · optional' })).toHaveValue('Dropped a rep')
    // Escape is the native cancel (jsdom sends none for the key itself).
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: TIMED_LOG_OPEN_LABEL }))
    expect(screen.getByRole('textbox', { name: 'Notes · optional' })).toHaveValue('Dropped a rep')
    expect(changes).toHaveBeenCalledTimes(typed)
  })

  it('the ladder’s quiet completion action closes the log in the same act and still runs the consumer’s own handler once', async () => {
    const user = userEvent.setup()
    const undo = vi.fn()
    render(<MemoryLadder onUndo={undo} />)
    await user.click(screen.getByRole('button', { name: TIMED_LOG_OPEN_LABEL }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Undo finish · Resume ladder' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a log drawn before its attempt ends takes the secondary action', () => {
    function Before() {
      const [value, setValue] = useState<CompletionResult>({ completed: null, effort: null })
      return <TimedResultDialog format="ladder" openerVariant="secondary" value={value} onChange={setValue} />
    }
    render(<Before />)
    const opener = screen.getByRole('button', { name: TIMED_LOG_OPEN_LABEL })
    expect(opener).not.toHaveClass('clr-btn--primary')
  })
})
