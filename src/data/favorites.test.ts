/**
 * FAV-01's copy path for a legacy workout, under REQ-010.
 *
 * Generated overviews and section introductions are no longer shown anywhere,
 * but a session composed before prompt 5.2.0 still holds both strings — and a
 * favorite saved from it is a copy of that session, not a reinterpretation.
 * So the transport sends the historical prose and every piece of structured
 * work through unchanged, the restored favorite still carries both, and only
 * the briefing built from it leaves the prose out.
 */
import { describe, expect, it } from 'vitest'

import { isErr } from '../state/errors'
import { favoriteDraft, restore } from '../state/favorites'
import { reviewBriefing } from '../state/review'
import type { SavedWorkoutDraft, SavedWorkoutRow, SessionReconstruction } from '../state/schemas'
import { fixtureId, reconstructionFixture } from '../test/workout-double'
import { createFavoritesClient } from './favorites'

const USER = 'a0000001-0000-4000-8000-000000000000'
const OVERVIEW ='Squat-led session with unilateral accessory work.'
const SECTION_NOTE = 'Build to a heavy set of five.'

/** A completed session from before REQ-010, prose and all. */
function legacyRecord(): SessionReconstruction {
  const plain = reconstructionFixture({
    state: 'completed',
    sections: [
      { title: 'Warm-up', blocks: [{ exercises: ['completed'] }] },
      {
        title: 'Primary lift',
        sectionType: 'primary_lift',
        blocks: [
          { exercises: ['completed', 'completed'] },
          { structureType: 'amrap', timerSeconds: 480, exercises: ['completed'] },
        ],
      },
    ],
  })
  return {
    ...plain,
    session: { ...plain.session, overview: OVERVIEW },
    sections: plain.sections.map((entry) => ({
      ...entry,
      section: { ...entry.section, section_notes: SECTION_NOTE },
    })),
  }
}

function draftOf(record: SessionReconstruction): SavedWorkoutDraft {
  const draft = favoriteDraft(record)
  if (isErr(draft)) throw new Error(`draft refused: ${draft.error.code}`)
  return draft.value
}

/** A client whose `save_favorite` answers the row it was sent, and keeps the body. */
function recordingClient() {
  const sent: unknown[] = []
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      p_user_id: string
      p_favorite: SavedWorkoutDraft
    }
    sent.push(body.p_favorite)
    const at = '2026-10-20T10:00:00+00:00'
    const favorite: SavedWorkoutRow = {
      id: fixtureId('7', 1),
      user_id: body.p_user_id,
      ...body.p_favorite,
      times_completed: 1,
      last_completed_at: at,
      created_at: at,
      updated_at: at,
    }
    return new Response(JSON.stringify({ outcome: 'saved', favorite }), { status: 200 })
  }
  const client = createFavoritesClient({
    url: 'https://project.supabase.co',
    anonKey: 'anon-key',
    accessToken: 'user-token',
    fetch,
  })
  return { client, sent }
}

describe('a legacy favorite keeps its historical prose and structured work (REQ-010)', () => {
  it('copies the overview, every section note and every block into the draft', () => {
    const record = legacyRecord()
    const snapshot = draftOf(record).workout_snapshot

    expect(snapshot.workout.overview).toBe(OVERVIEW)
    expect(snapshot.workout.sections.map((section) => section.section_notes)).toEqual([
      SECTION_NOTE,
      SECTION_NOTE,
    ])
    expect(snapshot.workout.sections.map((section) => section.blocks.length)).toEqual([1, 2])
    expect(
      snapshot.workout.sections.flatMap((section) =>
        section.blocks.map((block) => block.exercises.length),
      ),
    ).toEqual([1, 2, 1])
  })

  it('sends the snapshot to save_favorite unchanged, prose included', async () => {
    const draft = draftOf(legacyRecord())
    const { client, sent } = recordingClient()

    const saved = await client.save(USER, draft)

    if (isErr(saved)) throw new Error(`save refused: ${JSON.stringify(saved.error)}`)
    expect(sent).toEqual([draft])
    expect(JSON.stringify(sent[0])).toContain(OVERVIEW)
    expect(JSON.stringify(sent[0])).toContain(SECTION_NOTE)
  })

  it('restores the favorite whole, and briefs it with no overview or introduction', async () => {
    const draft = draftOf(legacyRecord())
    const { client } = recordingClient()
    const saved = await client.save(USER, draft)
    if (isErr(saved)) throw new Error('save refused')

    const restored = restore(saved.value, '2026-10-20')
    if (isErr(restored)) throw new Error(`restore refused: ${restored.error.code}`)

    // Nothing historical is dropped on the way back …
    expect(restored.value.workout).toEqual(draft.workout_snapshot.workout)

    // … and the screen's briefing shows the work without the prose.
    const briefing = reviewBriefing(restored.value)
    expect(briefing.sections.map((section) => section.title)).toEqual([
      'Warm-up',
      'Primary lift',
    ])
    expect(briefing.movementCount).toBe(4)
    expect(JSON.stringify(briefing)).not.toContain(OVERVIEW)
    expect(JSON.stringify(briefing)).not.toContain(SECTION_NOTE)
  })
})
