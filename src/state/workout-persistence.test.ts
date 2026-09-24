/**
 * EXE-01 acceptance — "closing or backgrounding persists state without
 * trapping the user in the app".
 *
 * Two halves, and the second is as much of the requirement as the first:
 * the open section survives a close, a background and a refresh, **and**
 * nothing here registers a `beforeunload` handler. Leaving the app is allowed;
 * the trap is on in-app navigation, which is `Workout.test.tsx`'s subject.
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  clearWorkoutShellState,
  readWorkoutShellState,
  restoredSectionIndex,
  usePersistedSection,
  WORKOUT_SHELL_STORAGE_KEY,
  writeWorkoutShellState,
  type ShellStorage,
} from './workout-persistence'

const SESSION = 'session-a'
const OTHER_SESSION = 'session-b'

/** An in-memory `Storage`, so a test owns what a previous one wrote. */
function fakeStorage(seed: string | null = null): ShellStorage & { raw(): string | null } {
  let value = seed
  return {
    getItem: (key) => (key === WORKOUT_SHELL_STORAGE_KEY ? value : null),
    setItem: (key, next) => {
      if (key === WORKOUT_SHELL_STORAGE_KEY) value = next
    },
    removeItem: (key) => {
      if (key === WORKOUT_SHELL_STORAGE_KEY) value = null
    },
    raw: () => value,
  }
}

/** The storage Safari private mode is: every access throws. */
function hostileStorage(): ShellStorage {
  return {
    getItem() {
      throw new DOMException('denied')
    },
    setItem() {
      throw new DOMException('quota')
    },
    removeItem() {
      throw new DOMException('denied')
    },
  }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

describe('reading and writing the shell record', () => {
  it('round-trips the open section', () => {
    const storage = fakeStorage()

    writeWorkoutShellState(storage, {
      sessionId: SESSION,
      sectionIndex: 2,
      updatedAt: '2026-09-24T09:10:00.000Z',
    })

    expect(readWorkoutShellState(storage)).toEqual({
      sessionId: SESSION,
      sectionIndex: 2,
      updatedAt: '2026-09-24T09:10:00.000Z',
    })
  })

  it('ignores an absent, unparsable or malformed record rather than throwing', () => {
    expect(readWorkoutShellState(fakeStorage())).toBeNull()
    expect(readWorkoutShellState(fakeStorage('{ not json'))).toBeNull()
    expect(readWorkoutShellState(fakeStorage('{"sessionId":"","sectionIndex":0}'))).toBeNull()
    expect(
      readWorkoutShellState(fakeStorage('{"sessionId":"a","sectionIndex":-1,"updatedAt":"x"}')),
    ).toBeNull()
    expect(
      readWorkoutShellState(fakeStorage('{"sessionId":"a","sectionIndex":1.5,"updatedAt":"x"}')),
    ).toBeNull()
  })

  it('survives storage that refuses to be used at all', () => {
    const storage = hostileStorage()

    expect(readWorkoutShellState(storage)).toBeNull()
    // A full or refused quota loses a convenience, never a workout.
    expect(() =>
      writeWorkoutShellState(storage, {
        sessionId: SESSION,
        sectionIndex: 1,
        updatedAt: '2026-09-24T09:10:00.000Z',
      }),
    ).not.toThrow()
    expect(() => clearWorkoutShellState(storage)).not.toThrow()
    expect(readWorkoutShellState(null)).toBeNull()
  })

  it('restores an index only for the session it was written for', () => {
    const storage = fakeStorage()
    writeWorkoutShellState(storage, {
      sessionId: SESSION,
      sectionIndex: 3,
      updatedAt: '2026-09-24T09:10:00.000Z',
    })

    expect(restoredSectionIndex(storage, SESSION)).toBe(3)
    expect(restoredSectionIndex(storage, OTHER_SESSION)).toBeNull()
  })

  it('forgets the record, which is what completing and abandoning do', () => {
    const storage = fakeStorage()
    writeWorkoutShellState(storage, {
      sessionId: SESSION,
      sectionIndex: 1,
      updatedAt: '2026-09-24T09:10:00.000Z',
    })

    clearWorkoutShellState(storage)

    expect(readWorkoutShellState(storage)).toBeNull()
  })
})

describe('usePersistedSection', () => {
  const clock = () => Date.parse('2026-09-24T09:10:00.000Z')

  it('writes where the user is looking as soon as they look there', () => {
    const storage = fakeStorage()
    const { result } = renderHook(() => usePersistedSection(SESSION, 0, storage, clock))

    expect(readWorkoutShellState(storage)).toMatchObject({ sessionId: SESSION, sectionIndex: 0 })

    act(() => {
      result.current.setIndex(2)
    })

    expect(result.current.index).toBe(2)
    expect(readWorkoutShellState(storage)).toMatchObject({ sectionIndex: 2 })
  })

  it('persists when the phone is backgrounded', () => {
    const storage = fakeStorage()
    const { result } = renderHook(() => usePersistedSection(SESSION, 0, storage, clock))

    act(() => {
      result.current.setIndex(1)
    })
    // The app is swiped away: `visibilitychange` is the event that fires, and
    // it must write rather than ask anything.
    storage.removeItem(WORKOUT_SHELL_STORAGE_KEY)
    setVisibility('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('visibilitychange'))
    })

    expect(readWorkoutShellState(storage)).toMatchObject({ sectionIndex: 1 })
    setVisibility('visible')
  })

  it('persists on the last event a discarded tab reliably delivers', () => {
    const storage = fakeStorage()
    const { result } = renderHook(() => usePersistedSection(SESSION, 0, storage, clock))

    act(() => {
      result.current.setIndex(3)
    })
    storage.removeItem(WORKOUT_SHELL_STORAGE_KEY)
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(readWorkoutShellState(storage)).toMatchObject({ sectionIndex: 3 })
  })

  it('never asks the browser to keep the user in the app', () => {
    const added: string[] = []
    const original = window.addEventListener.bind(window)
    window.addEventListener = ((type: string, ...rest: unknown[]) => {
      added.push(type)
      return (original as (type: string, ...rest: unknown[]) => void)(type, ...rest)
    }) as typeof window.addEventListener

    try {
      renderHook(() => usePersistedSection(SESSION, 0, fakeStorage(), clock))
    } finally {
      window.addEventListener = original
    }

    // The one API here that could stop somebody leaving, and it is absent.
    expect(added).not.toContain('beforeunload')
    expect(added).toContain('pagehide')
  })

  it('stops listening once the shell is gone', () => {
    const storage = fakeStorage()
    const { unmount } = renderHook(() => usePersistedSection(SESSION, 1, storage, clock))

    unmount()
    storage.removeItem(WORKOUT_SHELL_STORAGE_KEY)
    window.dispatchEvent(new Event('pagehide'))

    expect(readWorkoutShellState(storage)).toBeNull()
  })

  it('forgets the record on the way out of the session', () => {
    const storage = fakeStorage()
    const { result } = renderHook(() => usePersistedSection(SESSION, 2, storage, clock))

    act(() => {
      result.current.forget()
    })

    expect(readWorkoutShellState(storage)).toBeNull()
  })

  it('works when there is no storage at all', () => {
    const { result } = renderHook(() => usePersistedSection(SESSION, 1, null, clock))

    act(() => {
      result.current.setIndex(2)
      result.current.persist()
      result.current.forget()
    })

    expect(result.current.index).toBe(2)
  })
})
