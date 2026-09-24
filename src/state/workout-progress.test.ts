/**
 * EXE-01 acceptance — "progress reflects section status", and "section headers
 * expose structure identity from the master clarity spec".
 *
 * Both are derivations from the snapshot, so both are tested against rows
 * rather than against a rendered bar: a section is complete because its
 * prescriptions are, and an EMOM says `EMOM · 10 MIN` because its block row
 * carries `timer_seconds`. Nothing here parses a string or remembers a press.
 */
import { describe, expect, it } from 'vitest'

import { snapshotFixture, type SectionFixture } from '../test/workout-double'
import type { SessionSnapshot } from './schemas'
import {
  clampSectionIndex,
  isSessionFinished,
  sessionProgress,
  startingSectionIndex,
  type BlockProgress,
  type SessionProgress,
} from './workout-progress'

/** The first block of the first section, which several cases are about. */
function firstBlock(progress: SessionProgress): BlockProgress {
  const block = progress.sections[0]?.blocks[0]
  if (block === undefined) throw new Error('the fixture has no first block')
  return block
}

/** The same snapshot with its first prescription swapped out (DATA_MODEL §7). */
function withSupersededFirstExercise(snapshot: SessionSnapshot): SessionSnapshot {
  return {
    ...snapshot,
    sections: snapshot.sections.map((entry, sectionIndex) =>
      sectionIndex > 0
        ? entry
        : {
            ...entry,
            blocks: entry.blocks.map((blockEntry, blockIndex) =>
              blockIndex > 0
                ? blockEntry
                : {
                    ...blockEntry,
                    exercises: blockEntry.exercises.map((exerciseEntry, index) =>
                      index > 0
                        ? exerciseEntry
                        : {
                            ...exerciseEntry,
                            exercise: {
                              ...exerciseEntry.exercise,
                              revision_status: 'superseded' as const,
                            },
                          },
                    ),
                  },
            ),
          },
    ),
  }
}

describe('sessionProgress', () => {
  it('keeps the session order and counts what is resolved', () => {
    const progress = sessionProgress(
      snapshotFixture({
        sections: [
          { title: 'Warm-up', blocks: [{ exercises: ['completed', 'completed'] }] },
          { title: 'Primary lift', blocks: [{ exercises: ['completed', 'not_started'] }] },
          { title: 'Accessory', blocks: [{ exercises: ['not_started'] }] },
        ],
      }),
    )

    expect(progress.sections.map((section) => section.title)).toEqual([
      'Warm-up',
      'Primary lift',
      'Accessory',
    ])
    expect(progress.sections.map((section) => section.status)).toEqual([
      'complete',
      'in_progress',
      'not_started',
    ])
    expect(progress.sections.map((section) => section.index)).toEqual([0, 1, 2])
    expect(progress.completed).toBe(1)
    expect(progress.total).toBe(3)
  })

  it('reads a skipped prescription as resolved, not as outstanding', () => {
    // A section that could never read complete because one movement was
    // skipped would trap the user (DATA_MODEL §8).
    const progress = sessionProgress(
      snapshotFixture({
        sections: [{ title: 'Warm-up', blocks: [{ exercises: ['completed', 'skipped'] }] }],
      }),
    )

    expect(progress.sections[0]?.status).toBe('complete')
    expect(progress.completed).toBe(1)
  })

  it('ignores a superseded prescription, so a swapped block can still finish', () => {
    const swapped = withSupersededFirstExercise(
      snapshotFixture({
        sections: [
          { title: 'Primary lift', blocks: [{ exercises: ['not_started', 'completed'] }] },
        ],
      }),
    )
    const progress = sessionProgress(swapped)

    // The old row keeps its `not_started` status so its logs keep their
    // meaning; counting it would make the block impossible to finish.
    expect(progress.sections[0]?.status).toBe('complete')
    expect(firstBlock(progress).exerciseCount).toBe(1)
  })

  it('derives a status per block as well as per section', () => {
    const progress = sessionProgress(
      snapshotFixture({
        sections: [
          {
            title: 'Conditioning',
            blocks: [{ exercises: ['completed'] }, { exercises: ['not_started'] }],
          },
        ],
      }),
    )

    expect(progress.sections[0]?.status).toBe('in_progress')
    expect(progress.sections[0]?.blocks.map((block) => block.status)).toEqual([
      'complete',
      'not_started',
    ])
  })

  it('is total over a session with no sections', () => {
    const progress = sessionProgress(snapshotFixture({ sections: [] }))

    expect(progress).toEqual({ sections: [], completed: 0, total: 0 })
    expect(isSessionFinished(progress)).toBe(false)
  })
})

describe('startingSectionIndex', () => {
  it('lands on the first section that is not finished', () => {
    const progress = sessionProgress(
      snapshotFixture({
        sections: [
          { blocks: [{ exercises: ['completed'] }] },
          { blocks: [{ exercises: ['completed'] }] },
          { blocks: [{ exercises: ['not_started'] }] },
        ],
      }),
    )

    expect(startingSectionIndex(progress)).toBe(2)
  })

  it('lands on the first section when everything is resolved', () => {
    const progress = sessionProgress(
      snapshotFixture({ sections: [{ blocks: [{ exercises: ['completed'] }] }] }),
    )

    expect(startingSectionIndex(progress)).toBe(0)
    expect(isSessionFinished(progress)).toBe(true)
  })
})

describe('clampSectionIndex', () => {
  it('keeps a restored index inside a session it no longer fits', () => {
    const progress = sessionProgress(snapshotFixture({ sections: [{}, {}] }))

    expect(clampSectionIndex(-3, progress)).toBe(0)
    expect(clampSectionIndex(1, progress)).toBe(1)
    expect(clampSectionIndex(9, progress)).toBe(1)
  })
})

describe('structureIdentity', () => {
  const identityOf = (section: SectionFixture) =>
    firstBlock(sessionProgress(snapshotFixture({ sections: [section] }))).identity

  it('names the structure before it names the work', () => {
    expect(identityOf({ blocks: [{ structureType: 'emom', timerSeconds: 600 }] })).toMatchObject({
      label: 'EMOM',
      detail: '10 MIN',
      glyph: 'Stopwatch',
    })
    expect(identityOf({ blocks: [{ structureType: 'amrap', timerSeconds: 480 }] })).toMatchObject({
      label: 'AMRAP',
      detail: '8 MIN',
    })
    expect(identityOf({ blocks: [{ structureType: 'for_time', timerSeconds: 600 }] })).toMatchObject(
      { label: 'FOR TIME', detail: '10 MIN CAP' },
    )
    expect(identityOf({ blocks: [{ structureType: 'circuit', rounds: 3 }] })).toMatchObject({
      label: 'CIRCUIT',
      detail: '3 ROUNDS',
      glyph: 'Circuit',
    })
    expect(identityOf({ blocks: [{ structureType: 'superset' }] })).toMatchObject({
      label: 'SUPERSET',
      detail: null,
      glyph: 'Superset',
    })
    expect(identityOf({ blocks: [{ structureType: 'standard' }] })).toMatchObject({
      label: 'STANDARD',
      detail: null,
      glyph: 'Dumbbell',
    })
  })

  it('says seconds when the window does not divide into minutes', () => {
    expect(identityOf({ blocks: [{ structureType: 'amrap', timerSeconds: 90 }] }).detail).toBe(
      '90 SEC',
    )
  })

  it('invents no number the block does not carry', () => {
    expect(identityOf({ blocks: [{ structureType: 'emom', timerSeconds: null }] }).detail).toBeNull()
    expect(identityOf({ blocks: [{ structureType: 'circuit', rounds: null }] }).detail).toBeNull()
  })

  it('states a rep scheme only when it is not the default', () => {
    expect(identityOf({ blocks: [{ repScheme: 'fixed' }] }).repScheme).toBeNull()
    expect(identityOf({ blocks: [{ repScheme: 'ladder_down' }] })).toMatchObject({
      repScheme: 'LADDER DOWN',
      // The ladder is the thing the user is about to do, so it takes the glyph.
      glyph: 'Ladder',
    })
    expect(identityOf({ blocks: [{ repScheme: 'pyramid' }] }).repScheme).toBe('PYRAMID')
  })
})
