/**
 * One inline save, reported where the control is — the settings screens' shared
 * mechanism (SET-01, SET-02).
 *
 * It lives here rather than in either screen because both hubs make the same
 * promise: there is no Save button to forget on a preference, the write happens
 * the moment the choice is made, the cache is updated optimistically so the
 * control answers immediately, and a failed write puts the previous value back
 * and says so (IA.md §4 — "save failed — optimistic update rolls back"). Two
 * copies of that would be two chances for one of them to stop rolling back.
 *
 * The optimistic write and its rollback stay the caller's — only it knows which
 * cache entry the change belongs to — and this owns the part every save shares:
 * a busy state while the write is in flight, a settled one after it, and a toast
 * for the failure, because the screen still stands and an `ErrorView` would
 * replace a working card with an error page.
 */
import { useCallback, useState } from 'react'

import type { AppError, Result } from '../state/errors'
import { showErrorToast } from '../state/toasts'

export type SaveStatus = 'idle' | 'saving' | 'saved'

export interface InlineSave {
  readonly status: SaveStatus
  readonly save: <T>(
    write: () => Promise<Result<T>>,
    onFailure: (error: AppError) => void,
  ) => Promise<void>
}

export function useInlineSave(): InlineSave {
  const [status, setStatus] = useState<SaveStatus>('idle')

  const save = useCallback(
    async <T,>(
      write: () => Promise<Result<T>>,
      onFailure: (error: AppError) => void,
    ) => {
      setStatus('saving')
      const result = await write()

      if (!result.ok) {
        setStatus('idle')
        onFailure(result.error)
        showErrorToast(result.error)
        return
      }
      setStatus('saved')
    },
    [],
  )

  return { status, save }
}

/** The save's own polite status line — never colour alone, and never a spinner. */
export function SaveStatusLine({ status }: { status: SaveStatus }) {
  return (
    <p className="label" role="status">
      {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ' '}
    </p>
  )
}
