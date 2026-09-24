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

import { CIRCUIT_START } from './circuit'
import {
  clearWorkoutShellState,
  readCircuitState,
  readCircuitStates,
  readWorkoutShellState,
  restoredSectionIndex,
  usePersistedCircuit,
  usePersistedSection,
  WORKOUT_CIRCUIT_STORAGE_KEY,
  WORKOUT_SHELL_STORAGE_KEY,
  writeCircuitState,
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

/**
 * EXE-03's half: a circuit's place in its rounds is the second thing the rows
 * cannot answer, and it is remembered on the same terms — written on every
 * tap, discarded when it cannot be trusted, dropped when the session ends.
 */
describe('circuit records', () => {
  const BLOCK = '70000001-0000-4000-8000-000000000000'
  const OTHER_BLOCK = '70000002-0000-4000-8000-000000000000'
  const AT_ROUND_TWO = { round: 2, position: 3, restStartedAt: null }

  /** A whole `Storage`, since two keys are in play here. */
  function memoryStorage(): ShellStorage {
    const values = new Map<string, string>()
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: (key) => void values.delete(key),
    }
  }

  it('round-trips one block’s round and position', () => {
    const storage = memoryStorage()
    writeCircuitState(storage, BLOCK, AT_ROUND_TWO)

    expect(readCircuitState(storage, BLOCK)).toEqual(AT_ROUND_TWO)
    expect(readCircuitState(storage, OTHER_BLOCK)).toBeNull()
  })

  it('leaves the session’s other circuits where they were', () => {
    const storage = memoryStorage()
    writeCircuitState(storage, BLOCK, AT_ROUND_TWO)
    writeCircuitState(storage, OTHER_BLOCK, {
      round: 1,
      position: 1,
      restStartedAt: '2026-09-24T09:10:00.000Z',
    })

    expect(readCircuitState(storage, BLOCK)).toEqual(AT_ROUND_TWO)
    expect(readCircuitStates(storage)).toHaveProperty(OTHER_BLOCK)
  })

  it('drops a record it cannot vouch for rather than restoring a wrong one', () => {
    const storage = memoryStorage()
    storage.setItem(
      WORKOUT_CIRCUIT_STORAGE_KEY,
      JSON.stringify({
        [BLOCK]: { round: 0, position: 1, restStartedAt: null },
        [OTHER_BLOCK]: AT_ROUND_TWO,
      }),
    )

    // Round zero is not a round anyone is in; the other record is untouched.
    expect(readCircuitState(storage, BLOCK)).toBeNull()
    expect(readCircuitState(storage, OTHER_BLOCK)).toEqual(AT_ROUND_TWO)
  })

  it('ignores an unparsable map and storage that refuses to be read', () => {
    const storage = memoryStorage()
    storage.setItem(WORKOUT_CIRCUIT_STORAGE_KEY, '{ not json')

    expect(readCircuitStates(storage)).toEqual({})
    expect(readCircuitStates(hostileStorage())).toEqual({})
    expect(() => writeCircuitState(hostileStorage(), BLOCK, AT_ROUND_TWO)).not.toThrow()
    expect(readCircuitState(null, BLOCK)).toBeNull()
  })

  it('is forgotten with the session, along with the open section', () => {
    const storage = memoryStorage()
    writeWorkoutShellState(storage, {
      sessionId: SESSION,
      sectionIndex: 2,
      updatedAt: '2026-09-24T09:10:00.000Z',
    })
    writeCircuitState(storage, BLOCK, AT_ROUND_TWO)

    clearWorkoutShellState(storage)

    expect(readWorkoutShellState(storage)).toBeNull()
    expect(readCircuitStates(storage)).toEqual({})
  })

  it('restores on mount and writes on every advance', () => {
    const storage = memoryStorage()
    writeCircuitState(storage, BLOCK, AT_ROUND_TWO)

    const { result } = renderHook(() =>
      usePersistedCircuit(BLOCK, (stored) => stored ?? CIRCUIT_START, storage),
    )

    expect(result.current.state).toEqual(AT_ROUND_TWO)

    act(() => {
      result.current.advanceTo({ round: 3, position: 1, restStartedAt: null })
    })

    expect(result.current.state.round).toBe(3)
    expect(readCircuitState(storage, BLOCK)).toEqual({
      round: 3,
      position: 1,
      restStartedAt: null,
    })
  })

  it('repairs what it restores through the caller, which knows the block', () => {
    const storage = memoryStorage()
    writeCircuitState(storage, BLOCK, AT_ROUND_TWO)

    const { result } = renderHook(() =>
      usePersistedCircuit(BLOCK, () => CIRCUIT_START, storage),
    )

    expect(result.current.state).toEqual(CIRCUIT_START)
  })

  it('keeps working when there is no storage at all', () => {
    const { result } = renderHook(() =>
      usePersistedCircuit(BLOCK, (stored) => stored ?? CIRCUIT_START, null),
    )

    act(() => {
      result.current.advanceTo({ round: 2, position: 1, restStartedAt: null })
    })

    expect(result.current.state.round).toBe(2)
  })
})
