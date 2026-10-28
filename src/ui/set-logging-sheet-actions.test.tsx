import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

import { SetLoggingSheet } from './set-logging-sheet'

it('keeps quiet Clear before the final Cancel / Save pair, with only Save submitting', async () => {
  const user = userEvent.setup()
  const onClear = vi.fn()
  const onCancel = vi.fn()
  const onSubmit = vi.fn(() => true)
  render(
    <SetLoggingSheet
      mode="edit"
      setNumber={1}
      formLabel="Edit set 1 of back squat"
      context="Back squat"
      measures={<input aria-label="Reps" defaultValue="8" />}
      rest={null}
      onClear={onClear}
      onCancel={onCancel}
      onSubmit={onSubmit}
      onCollapse={() => {}}
    />,
  )
  const form = within(screen.getByRole('form', { name: 'Edit set 1 of back squat' }))
  const clear = form.getByRole('button', { name: 'Clear set 1' })
  const cancel = form.getByRole('button', { name: 'Cancel' })
  const save = form.getByRole('button', { name: 'Save correction' })
  expect(form.getAllByRole('button')).toEqual([clear, cancel, save])
  expect(clear).toHaveClass('clr-btn--quiet')
  expect(cancel.closest('.clr-action-group--paired')).toBe(save.closest('.clr-action-group--paired'))
  expect(save.closest('.clr-action-group--paired')).toBe(screen.getByRole('form').lastElementChild)

  await user.click(clear)
  expect(onClear).toHaveBeenCalledTimes(1)
  expect(onSubmit).not.toHaveBeenCalled()
  await user.click(cancel)
  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(onSubmit).not.toHaveBeenCalled()
  await user.click(save)
  expect(onSubmit).toHaveBeenCalledTimes(1)
})
