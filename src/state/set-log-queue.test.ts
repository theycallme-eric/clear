/**
 * EXE-07's rules, tested where they are pure: what goes in the queue, what
 * comes out of it, and what a refusal is worth.
 *
 * The behavioural half — a set durable before the request, drawn as unsynced
 * until a row exists, retried without duplicating — is
 * `set-logging-provider.test.tsx`. What is asserted here is the part that must
 * hold no matter who calls it: the queue never loses an entry it was given, it
 * never keeps one the database can already account for, and a record it cannot
 * vouch for is dropped at the door rather than sent as a row that would be
 * refused forever.
 */
import { describe, expect, it } from 'vitest'

import { createError, ErrorCode } from './errors'
import {
  attempted,
  enqueued,
  hasSustainedFailure,
  isAlreadyStored,
  isPermanent,
  isStalled,
  queuedSetLog,
  readSetLogQueue,
  reconciled,
  retryable,
  retryDelayMs,
  SET_LOG_QUEUE_STORAGE_KEY,
  SET_LOG_RETRY_BASE_MS,
  SET_LOG_RETRY_MAX_MS,
  settled,
  SUSTAINED_SET_LOG_ATTEMPTS,
  writeSetLogQueue,
  type QueuedSetLog,
  type QueueStorage,
} from './set-log-queue'
import type { SetLogEntry } from './set-logging'

const SESSION = '50000001-0000-4000-8000-000000000000'

function entry(overrides: Partial<SetLogEntry> = {}): SetLogEntry {
  return {
    id: 'a0000001-0000-4000-8000-000000000000',
    exerciseId: '80000001-0000-4000-8000-000000000000',
    blockId: '70000001-0000-4000-8000-000000000000',
    distanceUnit: null,
    weightUnit: 'kg',
    performed: { setNumber: 1, reps: 8, weight: 60 },
    ...overrides,
  }
}

function queued(overrides: Partial<SetLogEntry> = {}): QueuedSetLog {
  return queuedSetLog(entry(overrides), SESSION, '2026-09-24T18:02:00.000Z')
}

/** A `localStorage` a test owns, including one that refuses to co-operate. */
function memoryStorage(
  seed: Record<string, string> = {},
  options: { throwing?: boolean } = {},
): QueueStorage {
  const data = new Map(Object.entries(seed))

  return {
    getItem: (key) => {
      if (options.throwing) throw new Error('storage is unavailable')
      return data.get(key) ?? null
    },
    setItem: (key, value) => {
      if (options.throwing) throw new Error('quota exceeded')
      data.set(key, value)
    },
    removeItem: (key) => void data.delete(key),
  }
}

describe('what a queue holds', () => {
  it('appends a set, oldest first', () => {
    const first = queued()
    const second = queued({ id: 'a0000002-0000-4000-8000-000000000000' })

    expect(enqueued(enqueued([], first), second).map((item) => item.entry.id)).toEqual([
      first.entry.id,
      second.entry.id,
    ])
  })

  it('replaces rather than duplicates an entry under an id it already holds', () => {
    const original = queued()
    const again = { ...original, attempts: 3 }

    // A double tap, a re-render, a restored entry: the id is the row's primary
    // key, so the same id can never become two sets.
    expect(enqueued([original], again)).toEqual([again])
  })

  it('drops a settled entry and leaves the others alone', () => {
    const first = queued()
    const second = queued({ id: 'a0000002-0000-4000-8000-000000000000' })

    expect(settled([first, second], first.entry.id)).toEqual([second])
  })

  it('records a refusal against one entry without discarding it', () => {
    const [recorded] = attempted([queued()], queued().entry.id, createError(ErrorCode.NETWORK_OFFLINE))

    // Still owed. A set that silently disappeared is the defect being closed.
    expect(recorded.attempts).toBe(1)
    expect(recorded.lastErrorCode).toBe(ErrorCode.NETWORK_OFFLINE)
  })
})

describe('what a refusal is worth', () => {
  it('reads a conflict on a client-minted id as the set already being stored', () => {
    expect(isAlreadyStored(createError(ErrorCode.PERSISTENCE_CONFLICT))).toBe(true)
    expect(isAlreadyStored(createError(ErrorCode.NETWORK_OFFLINE))).toBe(false)
  })

  it.each([
    ErrorCode.NETWORK_OFFLINE,
    ErrorCode.NETWORK_TIMEOUT,
    ErrorCode.NETWORK_SERVER_ERROR,
    ErrorCode.NETWORK_RATE_LIMITED,
    ErrorCode.PERSISTENCE_WRITE_FAILED,
    ErrorCode.AUTH_SESSION_EXPIRED,
  ])('keeps retrying %s, which is about the connection', (code) => {
    expect(isPermanent(createError(code))).toBe(false)
  })

  it.each([
    ErrorCode.VALIDATION_CONSTRAINT,
    ErrorCode.VALIDATION_OUT_OF_RANGE,
    ErrorCode.VALIDATION_REQUIRED_FIELD,
    ErrorCode.PERSISTENCE_NOT_FOUND,
  ])('stops retrying %s, which is about the row', (code) => {
    expect(isPermanent(createError(code))).toBe(true)
  })

  it('stops sending a stalled entry, but never drops it', () => {
    const stalled = attempted(
      [queued()],
      queued().entry.id,
      createError(ErrorCode.VALIDATION_CONSTRAINT),
    )

    expect(isStalled(stalled[0])).toBe(true)
    expect(retryable(stalled)).toEqual([])
    // Still queued, still counted: the user is told, not quietly relieved of it.
    expect(stalled).toHaveLength(1)
  })
})

describe('when to try again, and when to say so', () => {
  it('waits the base interval before the first retry, and doubles from there', () => {
    const first = attempted([queued()], queued().entry.id, createError(ErrorCode.NETWORK_OFFLINE))
    const second = attempted(first, queued().entry.id, createError(ErrorCode.NETWORK_OFFLINE))

    expect(retryDelayMs([queued()])).toBe(SET_LOG_RETRY_BASE_MS)
    expect(retryDelayMs(first)).toBe(SET_LOG_RETRY_BASE_MS)
    expect(retryDelayMs(second)).toBe(SET_LOG_RETRY_BASE_MS * 2)
  })

  it('caps the backoff, so a retry always comes', () => {
    let queue = [queued()]
    for (let index = 0; index < 20; index += 1) {
      queue = [...attempted(queue, queued().entry.id, createError(ErrorCode.NETWORK_OFFLINE))]
    }

    expect(retryDelayMs(queue)).toBe(SET_LOG_RETRY_MAX_MS)
  })

  it('says nothing for a single refusal, and states it once past that', () => {
    const once = attempted([queued()], queued().entry.id, createError(ErrorCode.NETWORK_OFFLINE))
    const twice = attempted(once, queued().entry.id, createError(ErrorCode.NETWORK_OFFLINE))

    expect(SUSTAINED_SET_LOG_ATTEMPTS).toBe(2)
    expect(hasSustainedFailure([queued()])).toBe(false)
    expect(hasSustainedFailure(once)).toBe(false)
    expect(hasSustainedFailure(twice)).toBe(true)
  })

  it('states a refusal a retry cannot fix immediately', () => {
    const stalled = attempted(
      [queued()],
      queued().entry.id,
      createError(ErrorCode.VALIDATION_CONSTRAINT),
    )

    expect(hasSustainedFailure(stalled)).toBe(true)
  })
})

describe('reconciling against what the server already has', () => {
  it('drops an entry whose row is in the snapshot under the same id', () => {
    const item = queued()

    expect(
      reconciled(
        [item],
        [{ id: item.entry.id, exerciseId: item.entry.exerciseId, setNumber: 1 }],
      ),
    ).toEqual([])
  })

  it('drops an entry whose set number is already recorded against that prescription', () => {
    const item = queued()

    // The write landed and the answer was lost. `(exercise, set_number)` is
    // unique, so this is the same set — re-sending it would be refused, and
    // asking the user to re-enter it would be the app arguing with itself.
    expect(
      reconciled(
        [item],
        [
          {
            id: 'ffffffff-0000-4000-8000-000000000000',
            exerciseId: item.entry.exerciseId,
            setNumber: 1,
          },
        ],
      ),
    ).toEqual([])
  })

  it('keeps an entry the snapshot knows nothing about', () => {
    const item = queued()

    expect(
      reconciled(
        [item],
        [{ id: 'ffffffff-0000-4000-8000-000000000000', exerciseId: item.entry.exerciseId, setNumber: 2 }],
      ),
    ).toEqual([item])
  })
})

describe('surviving a reload', () => {
  it('reads back exactly what it wrote', () => {
    const storage = memoryStorage()
    const queue = [queued(), queued({ id: 'a0000002-0000-4000-8000-000000000000' })]

    writeSetLogQueue(storage, queue)

    expect(readSetLogQueue(storage)).toEqual(queue)
  })

  it('removes the key rather than storing an empty queue', () => {
    const storage = memoryStorage()

    writeSetLogQueue(storage, [queued()])
    writeSetLogQueue(storage, [])

    expect(storage.getItem(SET_LOG_QUEUE_STORAGE_KEY)).toBeNull()
  })

  it.each([
    ['unparsable', 'not json at all'],
    ['not an array', '{"entry":{}}'],
  ])('answers an empty queue for a %s record', (_label, raw) => {
    expect(readSetLogQueue(memoryStorage({ [SET_LOG_QUEUE_STORAGE_KEY]: raw }))).toEqual([])
  })

  it('drops an entry it cannot vouch for and keeps the ones it can', () => {
    const good = queued()
    const storage = memoryStorage({
      [SET_LOG_QUEUE_STORAGE_KEY]: JSON.stringify([
        good,
        // No unit to stamp: a row built from this would be refused forever.
        { ...good, entry: { ...good.entry, weightUnit: 'stone' } },
        // A set number the table cannot hold.
        { ...good, entry: { ...good.entry, performed: { setNumber: 0 } } },
        'a set, allegedly',
      ]),
    })

    expect(readSetLogQueue(storage)).toEqual([good])
  })

  it('treats storage it cannot reach as no queue rather than as a failure', () => {
    const storage = memoryStorage({}, { throwing: true })

    // Safari in private mode throws on access. Less durable, never less
    // functional: the set is still in memory and still being flushed.
    expect(readSetLogQueue(storage)).toEqual([])
    expect(() => writeSetLogQueue(storage, [queued()])).not.toThrow()
    expect(readSetLogQueue(null)).toEqual([])
    expect(() => writeSetLogQueue(null, [queued()])).not.toThrow()
  })
})
