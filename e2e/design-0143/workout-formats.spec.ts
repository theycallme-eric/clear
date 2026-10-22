import type { Page } from '@playwright/test'

import { CONTRACT_VERSION } from '../../src/state/schemas'
import { expect, test } from '../fixtures'
import {
  createAthlete, dayAgo, expectUnscoredBlockResults, must, prescription, trustedBrowserEligible,
  type Athlete, type Catalogued,
} from './disposable-athlete'

/**
 * REQ-016 / TASK-030 — every enabled workout format in one session, walked as
 * one integrated regression: start → each section in order → finish →
 * Summary → save, with nothing entered.
 *
 * This proves the seam between the already-implemented format renderers and
 * the shell's section progression; it does not re-prove any renderer. Each
 * format's own phone spec (`workout-amrap`, `workout-circuit`, `workout-emom`,
 * `workout-ladder`) and its unit tests stay the authority on its behaviour.
 *
 * The session is persisted through the real `persist_session` RPC for a
 * disposable namespaced athlete and started through `start_session`; every
 * model POST is refused in the browser, so nothing here is a generation.
 */

const TITLE = 'TASK-030 all formats'

/** Section type label, the badge the shell draws for its one block, and the block. */
function formats([one, two]: Catalogued[]) {
  const block = (structure: string, overrides: Record<string, unknown> = {}) => ({
    structure_type: structure,
    rounds: structure === 'circuit' ? 2 : null,
    timer_type: structure === 'emom' ? 'per_minute' : ['amrap', 'for_time'].includes(structure) ? 'countdown' : 'none',
    timer_seconds: ['emom', 'amrap', 'for_time'].includes(structure) ? 120 : null,
    round_rest_seconds: ['superset', 'circuit'].includes(structure) ? 10 : null,
    rep_scheme: 'fixed',
    block_notes: null,
    exercises: structure === 'superset'
      ? [prescription(one, { rest_seconds: 0 }), prescription(two, { rest_seconds: null })]
      : structure === 'standard'
        ? [prescription(one, { rest_seconds: 30, load_type: 'rir', load_value: 2 })]
        : [prescription(one, { sets: ['amrap', 'for_time'].includes(structure) ? null : 2 })],
    ...overrides,
  })
  return [
    ['primary_lift', 'Primary lift', 'STANDARD', block('standard')],
    ['accessory', 'Accessory', 'SUPERSET', block('superset')],
    ['conditioning', 'Conditioning', 'CIRCUIT', block('circuit')],
    ['conditioning', 'Conditioning', 'EMOM', block('emom')],
    ['conditioning', 'Conditioning', 'AMRAP', block('amrap')],
    ['conditioning', 'Conditioning', 'FOR TIME', block('for_time')],
    ['conditioning', 'Conditioning', 'LADDER UP', block('for_time', {
      rep_scheme: 'ladder_up',
      exercises: [prescription(one, { target_kind: 'sequence', target_value: null, target_sequence: [2, 4, 6], sets: null })],
    })],
  ] as const
}

function session(athlete: Athlete) {
  const sections = formats(athlete.catalog)
  return {
    date: dayAgo(0), location_id: athlete.locationId, session_focus: 'full_body', goal_preset: 'balanced',
    requested_duration_mins: 30, effective_duration_target_mins: 30, computed_duration_mins: null,
    requested_intensity: 5, effective_intensity: 5, adjustment_reason: null, generation_notes: null,
    prompt_version: 'e2e', contract_version: CONTRACT_VERSION,
    workout: {
      title: TITLE, overview: null, estimated_duration_mins: 30,
      sections: sections.map(([section_type, , , fixture], index) => ({
        section_type, section_title: `Format ${index + 1}`, section_notes: null,
        blocks: [{ ...fixture, exercises: fixture.exercises.map((exercise) => ({
          ...exercise,
          session_function: section_type === 'primary_lift' ? 'primary' : section_type === 'accessory' ? 'accessory' : 'conditioning',
        })) }],
      })),
    },
  }
}

const heading = (page: Page, name: string) =>
  expect(page.locator('main h1')).toHaveAccessibleName(name, { timeout: 30_000 })

test.describe('REQ-016 all formats, one session (TASK-030)', () => {
  test.describe.configure({ retries: 0 })
  test.use({ serviceWorkers: 'block' })
  test.skip(!trustedBrowserEligible, 'Public preview has no privileged test key; not acceptance evidence.')

  test('every format section progresses in order to Finish, Summary and a saved session', async ({
    page, visit, checkA11y,
  }, testInfo) => {
    test.setTimeout(180_000)
    const athlete = await createAthlete(testInfo, 't030f', {
      goal: 'balanced',
      sections: ['warmup', 'primary_lift', 'accessory', 'conditioning', 'cooldown'],
      experience: 'some',
      locationName: 'TASK-030 formats gym',
      note: null,
    })
    try {
      let modelPosts = 0
      await page.route('**/functions/v1/generate-*', (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        modelPosts += 1
        return route.abort('blockedbyclient')
      })
      const stored = await athlete.persist(session(athlete))
      await athlete.start(stored)
      await athlete.signIn(page)

      const sections = formats(athlete.catalog)
      await visit('/workout')
      await heading(page, 'Workout')
      const nav = page.getByRole('navigation', { name: 'Workout sections' })
      for (const [index, [, label, badge]] of sections.entries()) {
        await expect(page.getByRole('heading', { level: 2, name: label, exact: true })).toBeVisible({ timeout: 30_000 })
        await expect(page.getByText(`Section ${index + 1} / ${sections.length}`, { exact: false }).first()).toBeVisible()
        await expect(page.getByRole('list', { name: 'Structures in this section' })).toContainText(badge)
        if (index === 0) await checkA11y()
        if (index < sections.length - 1) {
          await nav.getByRole('button', { name: 'Next section', exact: true }).click()
        }
      }
      await nav.getByRole('button', { name: 'Finish workout', exact: true }).click()

      await heading(page, 'Nice work')
      await expect(page.getByText(`${TITLE}, done.`)).toBeVisible()
      await page.getByRole('button', { name: 'Save and close', exact: true }).click()
      await heading(page, 'Today')

      const [row] = must<Array<{ completed_at: string | null; mood: number | null; sections: { blocks: { id: string; exercises: { logs: unknown[] }[] }[] }[] }>>(
        await athlete.client.selectAsService('workout_sessions', {
          select: 'completed_at,mood,sections:workout_sections(blocks:workout_blocks(id,exercises:workout_exercises(logs:exercise_set_logs(id))))',
          id: `eq.${stored.session.id}`,
        }), 'Stored session read')
      expect(row.completed_at).not.toBeNull()
      expect(row.mood).toBeNull()
      expect(row.sections).toHaveLength(sections.length)
      expect(row.sections.flatMap((s) => s.blocks.flatMap((b) => b.exercises.flatMap((e) => e.logs)))).toEqual([])
      const ids = row.sections.flatMap((s) => s.blocks.map((b) => b.id))
      await expectUnscoredBlockResults(athlete, ids)
      expect(modelPosts).toBe(0)
    } finally {
      await athlete.dispose()
    }
  })
})
