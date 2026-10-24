import { describe, expect, it } from 'vitest'
import { SYSTEM_PROMPT } from '../../supabase/functions/_shared/prompt.ts'
import { createCandidatesClient } from '../data/candidates'
import type { UserConstraintRow } from '../data/constraints'
import { createCandidatesDouble } from './candidates-double'

const user = 'v3-test-user'
const constraint = (scope: UserConstraintRow['scope']): UserConstraintRow => ({
  id: `exclude-${scope}`, scope, user_id: user, action: 'exclude', persistence: 'persistent',
  applies_to_session_id: null, target_exercise_id: scope === 'exercise' ? 'glute-bridge' : null,
  target_pattern: scope === 'movement_pattern' ? 'hinge' : null,
  target_equipment: scope === 'equipment' ? 'bodyweight' : null,
  note: null, created_at: '2026-10-24T00:00:00Z',
})

async function warmup(constraints: UserConstraintRow[] = []) {
  const url = 'https://v3-test.supabase.co'
  const client = createCandidatesClient({ url, anonKey: 'anon', accessToken: 'test',
    fetch: createCandidatesDouble({ url, anonKey: 'anon', users: { test: user }, constraints,
      profiles: { [user]: { goalPreset: 'strength', enabledSections: ['warmup', 'primary_lift'],
        locations: [{ id: 'home', isDefault: true, equipment: ['bodyweight'] }] } },
    }).fetch,
  })
  const result = await client.retrieve({ userId: user, focus: 'lower_body' })
  if (!result.ok) throw new Error(result.error.code)
  return result.value.find((section) => section.section === 'warmup')?.candidates ?? []
}

describe('V3 bodyweight hinge eligibility', () => {
  it('offers an existing hinge rehearsal with bodyweight alone', async () => {
    const bridge = (await warmup()).find((exercise) => exercise.exerciseId === 'glute-bridge')
    expect(bridge?.usableEquipment).toEqual(['bodyweight'])
    expect(bridge?.patterns).toContain('hinge')
    expect(SYSTEM_PROMPT).toContain('Warmup glute-bridge uses bodyweight.')
  })
  it.each(['exercise', 'movement_pattern'] as const)('keeps the %s exclusion effective', async (scope) => {
    expect((await warmup([constraint(scope)])).map((exercise) => exercise.exerciseId)).not.toContain('glute-bridge')
  })
  it('scopes anchor retention to eligible history and keeps code-owned loading', () => {
    expect(SYSTEM_PROMPT).toContain('eligible high-confidence progressing back squat anchor')
    expect(SYSTEM_PROMPT).toContain('honor recovery directives and the session time budget')
    expect(SYSTEM_PROMPT).toContain('using prior_session load')
    expect(SYSTEM_PROMPT).toContain('Code fills\nloads from logged history.')
  })
})
