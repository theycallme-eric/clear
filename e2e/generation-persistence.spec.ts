import { namespaceId } from '../scripts/e2e/namespace.mjs'

import { expect, test } from './fixtures'
import { backend } from './support/backend'
import { liveModelEnabled, liveModelReason } from './support/live-model'

/**
 * TASK-072 — the rebuilt generation path, proved against the reused project.
 *
 * Unit and integration tests prove each seam with deterministic doubles. This
 * walk is deliberately smaller and stronger: a fresh user completes the real
 * onboarding transaction, calls the deployed model-backed Edge Function,
 * persists exactly the acceptance payload it returned, and reads the session
 * back through the same reconstruction API History uses.
 */
test.describe('live generation → persistence → reconstruction', () => {
  test.skip(!backend.available, backend.reason)
  test.skip(!liveModelEnabled, liveModelReason)
  test.describe.configure({ mode: 'serial' })

  let client: ReturnType<typeof backend.client>
  let user: { id: string; email: string } | null = null
  let token = ''
  let locationId = ''
  let acceptance: Record<string, unknown> | null = null
  let sessionId = ''

  const email = `clear-e2e-${namespaceId()}-generation@example.com`
  const requestId = `req_e2e_${namespaceId().replace(/[^a-z0-9]/g, '')}`

  const must = <T>(
    response: { ok: boolean; status: number; body: unknown },
    what: string,
  ): T => {
    const failure =
      typeof response.body === 'object' && response.body !== null
        ? (response.body as Record<string, unknown>).message ??
          (response.body as Record<string, unknown>).msg ??
          (response.body as Record<string, unknown>).error_description
        : null
    const issues =
      typeof response.body === 'object' && response.body !== null
        ? (response.body as Record<string, unknown>).issues
        : null
    const issueDetail = Array.isArray(issues)
      ? ` ${issues
          .map((issue) =>
            typeof issue === 'object' && issue !== null
              ? `${String((issue as Record<string, unknown>).path)}: ${String(
                  (issue as Record<string, unknown>).message,
                )}`
              : 'invalid issue',
          )
          .join('; ')}`
      : ''
    const detail = typeof failure === 'string' ? `: ${failure}${issueDetail}` : ''
    expect(response.ok, `${what} (status ${response.status}${detail})`).toBe(true)
    return response.body as T
  }

  test.beforeAll(async () => {
    client = backend.client()

    // A cancelled prior run may have left this namespace behind. Delete only
    // the exact harness address before recreating it; auth deletion cascades.
    const prior = await client.findUserByEmail(email)
    if (prior) await client.deleteUser(prior.id)

    user = await client.ensureConfirmedUser(email)
    token = (await client.mintSession(email)).accessToken

    const catalog = must<{ equipment_options: string[] }[]>(
      await client.selectAsService('exercise_catalog', {
        select: 'equipment_options',
      }),
      'reading catalog equipment',
    )
    const equipment = [
      ...new Set(catalog.flatMap((row) => row.equipment_options)),
    ].sort()
    expect(equipment.length, 'the preserved catalog has no equipment').toBeGreaterThan(0)

    const onboarded = must<{ location: { id: string } }>(
      await client.rpcAs(
        'complete_onboarding',
        {
          p_location_name: 'TASK-072 generation fixture',
          p_location_tier: 'full',
          p_equipment: equipment,
          p_experience_level: 'some',
          p_goal_preset: 'strength',
          p_sections: ['warmup', 'primary_lift', 'cooldown'],
          p_avoid_patterns: [],
          p_note: null,
        },
        token,
      ),
      'completing onboarding',
    )
    locationId = onboarded.location.id
  })

  test.afterAll(async () => {
    if (client && user) await client.deleteUser(user.id)
  })

  test('the request goal, not the profile default, controls its sections', async () => {
    const recovery = must<string[]>(
      await client.rpcAs(
        'generation_sections_for_goal',
        { p_user_id: user?.id, p_goal: 'active_recovery' },
        token,
      ),
      'resolving active-recovery sections',
    )
    expect(recovery).toEqual(['warmup', 'mobility', 'cooldown'])

    const strength = must<string[]>(
      await client.rpcAs(
        'generation_sections_for_goal',
        { p_user_id: user?.id, p_goal: 'strength' },
        token,
      ),
      'resolving strength sections',
    )
    expect(strength).toEqual(['warmup', 'primary_lift', 'cooldown'])
  })

  test('a real generation returns Review’s complete acceptance payload', async () => {
    // A full structured workout routinely takes longer than Playwright's
    // generic 30-second test default. Keep the bound explicit and local to the
    // only paid provider call; the surrounding database checks stay fast.
    test.setTimeout(120_000)

    const body = must<{
      requestId: string
      acceptance: Record<string, unknown>
    }>(
      await client.functionAs(
        'generate-workout',
        {
          request_id: requestId,
          goal: 'strength',
          date: '2026-09-27',
          focus: 'full_body',
          requested_intensity: 6,
          requested_duration_mins: 30,
          location_id: locationId,
          notes: 'TASK-072 live verification.',
          deload: false,
        },
        token,
        { 'X-Request-ID': requestId },
      ),
      'generating a workout',
    )

    expect(body.requestId).toBe(requestId)
    expect(body.acceptance).toMatchObject({
      date: '2026-09-27',
      location_id: locationId,
      session_focus: 'full_body',
      goal_preset: 'strength',
      requested_duration_mins: 30,
      requested_intensity: 6,
      is_deload: false,
    })
    expect(body.acceptance.prompt_version).toBeTruthy()
    expect(body.acceptance.contract_version).toBeTruthy()
    expect(body.acceptance.workout).toBeTruthy()
    acceptance = body.acceptance
  })

  test('Start persists that payload atomically and History reconstructs it', async () => {
    expect(acceptance, 'generation did not produce an acceptance payload').not.toBeNull()

    const persisted = must<{
      session: { id: string; goal_preset: string; prompt_version: string }
      sections: unknown[]
    }>(
      await client.rpcAs(
        'persist_session',
        { p_user_id: user?.id, p_session: acceptance },
        token,
      ),
      'persisting the generated workout',
    )

    sessionId = persisted.session.id
    expect(persisted.session.goal_preset).toBe('strength')
    expect(persisted.session.prompt_version).toBe(acceptance?.prompt_version)
    expect(persisted.sections.length).toBeGreaterThan(0)

    const reconstructed = must<{
      reconstruction: string
      session: { id: string; goal_preset: string }
      sections: unknown[]
    }>(
      await client.rpcAs(
        'session_as_generated',
        { p_session_id: sessionId },
        token,
      ),
      'reconstructing the generated session',
    )

    expect(reconstructed.reconstruction).toBe('generated')
    expect(reconstructed.session.id).toBe(sessionId)
    expect(reconstructed.session.goal_preset).toBe('strength')
    expect(reconstructed.sections.length).toBeGreaterThan(0)
  })
})
