import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { focusFirstInvalid, useInvalidFocus } from './formFocus'

describe('focusFirstInvalid (CORE-05, export pattern 1)', () => {
  it('focuses the first control marked aria-invalid, in DOM order', () => {
    render(
      <form aria-label="Sample">
        <input aria-label="Valid" />
        <input aria-label="First invalid" aria-invalid="true" />
        <input aria-label="Second invalid" aria-invalid="true" />
      </form>,
    )

    const focused = focusFirstInvalid(screen.getByRole('form'))

    expect(focused).toBe(screen.getByRole('textbox', { name: 'First invalid' }))
    expect(screen.getByRole('textbox', { name: 'First invalid' })).toHaveFocus()
  })

  it('returns null and moves nothing when every control is valid', () => {
    render(
      <form aria-label="Sample">
        <input aria-label="Valid" />
      </form>,
    )

    const focused = focusFirstInvalid(screen.getByRole('form'))

    expect(focused).toBeNull()
    expect(document.body).toHaveFocus()
  })
})

/**
 * The hook is the half that forms actually use, and the half that has to get
 * React's timing right: the control is marked invalid by the render the
 * failure causes, so the focus move has to happen after that render, not
 * inside the handler that caused it.
 */
describe('useInvalidFocus (CORE-05, the shared submit helper)', () => {
  /** A two-field form whose submit fails on the second field, or succeeds. */
  function Sample({
    accept = false,
    async: isAsync = false,
  }: {
    accept?: boolean
    async?: boolean
  }) {
    const onSubmit = useInvalidFocus()
    const [rejected, setRejected] = useState(false)

    function submit(): boolean | Promise<boolean> {
      if (accept) return isAsync ? Promise.resolve(true) : true
      if (isAsync) {
        return Promise.resolve().then(() => {
          setRejected(true)
          return false
        })
      }
      setRejected(true)
      return false
    }

    return (
      <form aria-label="Sample" onSubmit={onSubmit(submit)} noValidate>
        <input aria-label="First" />
        <input aria-label="Second" aria-invalid={rejected || undefined} />
        <button type="submit">Submit</button>
      </form>
    )
  }

  const submitButton = () => screen.getByRole('button', { name: 'Submit' })

  it('moves focus to the control the failed submit marked invalid', async () => {
    const user = userEvent.setup()
    render(<Sample />)

    await user.click(submitButton())

    expect(screen.getByRole('textbox', { name: 'Second' })).toHaveFocus()
  })

  it('moves focus again when the same bad value is submitted twice', async () => {
    const user = userEvent.setup()
    render(<Sample />)

    await user.click(submitButton())
    await user.click(screen.getByRole('textbox', { name: 'First' }))
    expect(screen.getByRole('textbox', { name: 'First' })).toHaveFocus()

    await user.click(submitButton())

    expect(screen.getByRole('textbox', { name: 'Second' })).toHaveFocus()
  })

  it('follows a failure the server decided, not only a local one', async () => {
    const user = userEvent.setup()
    render(<Sample async />)

    await user.click(submitButton())

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Second' })).toHaveFocus()
    })
  })

  it('leaves focus alone when the submit was accepted', async () => {
    const user = userEvent.setup()
    render(<Sample accept />)

    await user.click(submitButton())

    expect(submitButton()).toHaveFocus()
  })

  it('prevents the browser default, so the app owns the failure', async () => {
    const user = userEvent.setup()
    let defaultPrevented: boolean | null = null
    render(
      <div
        onSubmit={(event) => {
          defaultPrevented = event.defaultPrevented
        }}
      >
        <Sample />
      </div>,
    )

    await user.click(submitButton())

    expect(defaultPrevented).toBe(true)
  })
})

/**
 * "One shared submit helper, not a per-form habit" is only true while it is
 * the only way a form handles submission. A new form that writes its own
 * focus move is the failure mode this test exists to catch.
 */
describe('every form in the app submits through the shared helper', () => {
  const srcDir = resolve(import.meta.dirname, '..')

  function appSources(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // The vendored export owns its own component layer, and the gallery
      // renders specimens of it rather than app forms.
      if (entry.name === 'design-system' || entry.name === 'dev') continue

      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        appSources(full, found)
      } else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
        found.push(full)
      }
    }
    return found
  }

  const formFiles = appSources(srcDir).filter((file) =>
    /<form[\s>]/.test(readFileSync(file, 'utf-8')),
  )

  it('finds the forms it is checking', () => {
    expect(formFiles.length).toBeGreaterThan(0)
  })

  it('wires each one to useInvalidFocus', () => {
    const offenders = formFiles.filter(
      (file) => !readFileSync(file, 'utf-8').includes('useInvalidFocus'),
    )

    expect(offenders).toEqual([])
  })
})
