import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createError, ErrorCode } from '../state/errors'
import { createLogger, type LogLevel } from '../state/logger'
import { renderWithProviders } from '../test/render'
import { ErrorBoundary } from './ErrorBoundary'

const INTERNAL_DETAIL = 'internal invariant broken in SectionRenderer'

function Boom({ error }: { error: unknown }): never {
  throw error
}

function memoryLogger() {
  const lines: Array<{ level: LogLevel; line: string }> = []
  const logger = createLogger({
    scope: 'test.boundary',
    sink: { write: (level, line) => lines.push({ level, line }) },
  })
  return { lines, logger }
}

// React reports every caught render error through console.error; silence the
// expected noise so real failures stay visible in the run output.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('top-level error boundary (CORE-04)', () => {
  it('a render crash shows a recoverable screen, never a blank page', () => {
    const { logger } = memoryLogger()
    render(
      <ErrorBoundary logger={logger} onReload={() => {}}>
        <Boom error={new Error(INTERNAL_DETAIL)} />
      </ErrorBoundary>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Display error')
    expect(alert).toHaveTextContent(
      'This screen stopped rendering. Your data is safe.',
    )
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('never shows the raw error text or a stack trace', () => {
    const { logger } = memoryLogger()
    const { container } = render(
      <ErrorBoundary logger={logger} onReload={() => {}}>
        <Boom error={new Error(INTERNAL_DETAIL)} />
      </ErrorBoundary>,
    )

    expect(container.textContent).not.toContain(INTERNAL_DETAIL)
    expect(container.textContent).not.toMatch(/\bat\s+Boom\b/)
  })

  it('shows the requestId when the crash carried one', () => {
    const { logger } = memoryLogger()
    render(
      <ErrorBoundary logger={logger} onReload={() => {}}>
        <Boom
          error={createError(ErrorCode.GENERATION_FAILED, {
            requestId: 'req_crash_777',
          })}
        />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('req_crash_777')
  })

  it('the reload action recovers the screen', async () => {
    const { logger } = memoryLogger()
    const onReload = vi.fn()
    render(
      <ErrorBoundary logger={logger} onReload={onReload}>
        <Boom error={new Error(INTERNAL_DETAIL)} />
      </ErrorBoundary>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('logs the crash through the structured logger with its code', () => {
    const { lines, logger } = memoryLogger()
    render(
      <ErrorBoundary logger={logger} onReload={() => {}}>
        <Boom error={createError(ErrorCode.GENERATION_FAILED)} />
      </ErrorBoundary>,
    )

    const errorLines = lines.filter((entry) => entry.level === 'error')
    expect(errorLines.length).toBeGreaterThanOrEqual(1)
    expect(errorLines[0].line).toContain('GENERATION_FAILED')
  })

  it('the app test tree carries the same boundary, so crashes never blank a screen', () => {
    renderWithProviders(<Boom error={new Error(INTERNAL_DETAIL)} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Display error')
  })
})
