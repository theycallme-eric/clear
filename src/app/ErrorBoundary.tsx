/**
 * Top-level error boundary (CORE-04). Wraps the router so a render crash
 * produces a recoverable screen with a reload action — never a white page,
 * never a raw stack trace. The crash detail goes to the structured logger;
 * the screen gets plain language and the requestId when one exists.
 */
import { Component, type ReactNode } from 'react'

import { toAppError, type AppError } from '../state/errors'
import { createLogger, type Logger } from '../state/logger'
import { ErrorView } from '../ui/view-state'

const defaultLogger = createLogger({ scope: 'app.error-boundary' })

interface ErrorBoundaryProps {
  children: ReactNode
  /** Injectable for tests; defaults to a full page reload. */
  onReload?: () => void
  /** Injectable for tests; defaults to the app's structured logger. */
  logger?: Logger
}

interface ErrorBoundaryState {
  crash?: AppError
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {}

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { crash: toAppError(error) }
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    const appError = toAppError(error)
    const logger = this.props.logger ?? defaultLogger
    logger.error('render crash caught by top-level boundary', {
      code: appError.code,
      requestId: appError.requestId,
      details: appError.details,
      componentStack: info.componentStack ?? undefined,
    })
  }

  render() {
    const { crash } = this.state
    if (!crash) {
      return this.props.children
    }

    return (
      <main>
        <ErrorView
          // The screen never sees the thrown error's own text — it may carry
          // internal detail. Fixed plain-language copy plus the requestId.
          error={{
            code: crash.code,
            message: 'This screen stopped rendering. Your data is safe.',
            requestId: crash.requestId,
          }}
          title="Display error"
          actionLabel="Reload"
          onRetry={this.props.onReload ?? (() => window.location.reload())}
        />
      </main>
    )
  }
}
