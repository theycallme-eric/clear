/**
 * REQ-011, REQ-031 — onboarding cannot save an impossible configuration.
 *
 * `supabase/migrations/20261002000022_onboarding_viability.sql` re-declares
 * `complete_onboarding` with one step ahead of every write: the answers go to
 * `generation_viability` as a proposal, and a proposal it fails is refused
 * with the failing rows. Followed here from where it is refused to where it is
 * read:
 *
 *   1. The migration evaluates before it writes, keeps the earlier commit's
 *      body, and adds nothing else.
 *   2. A non-viable commit leaves no profile completion, location, equipment
 *      or constraint — through the client, and for a request crafted without it.
 *   3. Every tier × Goal preset, unedited, commits.
 *   4. The client answers with the incompatible choice, named.
 *   5. The onboarding screen announces it on the confirm step's existing
 *      validation line and keeps the draft.
 *
 * As everywhere in this lane, no SQL runs: `onboarding-double.ts` is the
 * commit transcribed, and section 1 holds the transcription to the text.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT, migrationFiles } from '../../../scripts/gen-types/schema.mjs'
import { Constants } from '../../data/database.types'
import { createUserDataClient } from '../../data/user-data'
import { NOT_VIABLE_PG_CODE, viabilityFailuresOf } from '../../data/viability'
import { ErrorCode, ok } from '../../state/errors'
import {
  EMPTY_DRAFT,
  EQUIPMENT_BY_TIER,
  GOALS,
  onboardingReducer,
  SECTIONS_BY_GOAL,
  STEP_TITLES,
  TIERS,
  toAnswers,
  type OnboardingAction,
} from '../../state/onboarding'
import { QueryClient } from '../../state/query'
import type { OnboardingAnswers, Profile } from '../../state/schemas'
import { profileQueryKey } from '../../state/user-queries'
import {
  completeOnboarding,
  createOnboardingDouble,
  emptyStore,
  type OnboardingArgs,
  type OnboardingStore,
} from '../onboarding-double'
import { renderApp, signedIn } from '../render'
import {
  createFakeUserDataClient,
  FIXTURE_USER_ID,
  notOnboardedProfile,
} from '../user-data-double'

const MIGRATION = '20261002000022_onboarding_viability.sql'
const ORIGINAL = '20260921000008_complete_onboarding.sql'

const URL_ = 'https://clear.test'
const ANON_KEY = 'anon'
const TOKEN = 'token'

const ENUMS = Constants.public.Enums

/** SQL with comments removed and whitespace collapsed. */
const statementsOf = (file: string) =>
  readFileSync(join(REPO_ROOT, 'supabase/migrations', file), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ')

const statements = statementsOf(MIGRATION)
const original = statementsOf(ORIGINAL)

const DECLARATION = 'create or replace function public.complete_onboarding('
const bodyOf = (sql: string) => sql.slice(sql.indexOf(DECLARATION), sql.indexOf('$$;'))

function harness(initial: OnboardingStore = emptyStore()) {
  const double = createOnboardingDouble({ url: URL_, anonKey: ANON_KEY, users: { [TOKEN]: 'user' } }, initial)
  const client = createUserDataClient({
    auth: {
      getSession: async () =>
        ok({
          accessToken: TOKEN,
          refreshToken: 'refresh',
          expiresAt: Date.now() + 3_600_000,
          user: { id: 'user', email: 'lifter@example.test' },
        }),
    },
    supabase: { url: URL_, anonKey: ANON_KEY, fetch: double.fetch },
  })

  return { double, client }
}

function answersFrom(actions: readonly OnboardingAction[]): OnboardingAnswers {
  const answers = toAnswers(actions.reduce(onboardingReducer, EMPTY_DRAFT))
  if (answers === null) throw new Error('the draft is not a payload')
  return answers
}

/** Minimal equipment cannot perform a carry: the section the tier cannot support. */
const NOT_VIABLE: readonly OnboardingAction[] = [
  { type: 'tier', value: 'minimal' },
  { type: 'experience', value: 'some' },
  { type: 'goal', value: 'strength' },
  { type: 'section', value: 'carries' },
  { type: 'pattern', value: 'conditioning' },
  { type: 'note', value: 'Easy on the lungs' },
]

const argsFrom = (answers: OnboardingAnswers): OnboardingArgs => ({
  p_location_name: answers.location_name,
  p_location_tier: answers.location_tier,
  p_equipment: answers.equipment,
  p_experience_level: answers.experience_level,
  p_goal_preset: answers.goal_preset,
  p_sections: answers.enabled_sections,
  p_avoid_patterns: answers.avoid_patterns,
  p_note: answers.note ?? undefined,
})

describe('the migration — evaluates before it writes', () => {
  const body = bodyOf(statements)

  it('re-declares the commit with the signature it had', () => {
    expect(migrationFiles()).toContain(MIGRATION)
    expect(MIGRATION > '20261001000021_generation_viability.sql').toBe(true)

    expect(statements.match(/create (or replace )?function/gi)).toHaveLength(1)
    const signature = (sql: string) => sql.slice(sql.indexOf(DECLARATION), sql.indexOf('as $$'))
    expect(signature(statements)).toBe(signature(original))
    expect(signature(statements)).toContain('security invoker')
    expect(signature(statements)).toContain("set search_path = ''")
  })

  it('adds nothing else: no table, type, policy, grant or drop', () => {
    for (const forbidden of [
      /create table/i,
      /create type/i,
      /create policy/i,
      /alter /i,
      /\bdrop /i,
      /\bgrant /i,
      /security definer/i,
    ]) {
      expect(statements, String(forbidden)).not.toMatch(forbidden)
    }
  })

  it('puts the answers to generation_viability as the proposal it is about to write', () => {
    const call = body.slice(body.indexOf('from public.generation_viability('), body.indexOf(') as v;'))

    expect(call).toContain('p_goal => p_goal_preset')
    expect(call).toContain('p_enabled_sections => p_sections')
    expect(call).toContain(
      "p_excluded_patterns => coalesce(p_avoid_patterns, '{}'::public.movement_pattern[])",
    )
    // The equipment as the insert below stores it: trimmed, blanks dropped.
    expect(call).toContain(
      "select btrim(item) from unnest(coalesce(p_equipment, '{}'::text[])) as item where btrim(item) <> ''",
    )
    // Onboarding writes no exercise- or equipment-scoped exclusion.
    expect(call).toContain("p_excluded_exercises => '{}'::text[]")
    expect(call).toContain("p_excluded_equipment => '{}'::text[]")
    // The floor is the evaluation's own default, not one chosen here.
    expect(call).not.toContain('p_floor')
  })

  it('refuses any failing row, with the rows as the detail, under its own SQLSTATE', () => {
    expect(body).toContain('if jsonb_array_length(v_failures) > 0 then raise exception')
    expect(body).toContain(`using errcode = '${NOT_VIABLE_PG_CODE}', detail = v_failures::text;`)
    for (const key of [
      'section',
      'failure_class',
      'incompatible_choice',
      'goals',
      'focuses',
      'blocks_proposed_goal',
    ]) {
      expect(body, key).toContain(`'${key}',`)
    }
  })

  it('raises before the first write to any of the four tables', () => {
    const refused = body.indexOf(`errcode = '${NOT_VIABLE_PG_CODE}'`)
    expect(refused).toBeGreaterThan(-1)

    for (const write of [
      'update public.locations',
      'insert into public.locations',
      'delete from public.location_equipment',
      'insert into public.location_equipment',
      'update public.profiles',
      'delete from public.user_constraints',
      'insert into public.user_constraints',
    ]) {
      expect(body.indexOf(write), write).toBeGreaterThan(refused)
      // …and each is written once, so there is no earlier copy to find.
      expect(body.split(write), write).toHaveLength(2)
    }
  })

  it('keeps the earlier commit, statement for statement, on either side of the check', () => {
    const FIRST_WRITE = 'update public.locations'
    const CHECK = 'select coalesce( jsonb_agg('

    expect(body.slice(body.indexOf(FIRST_WRITE))).toBe(
      bodyOf(original).slice(bodyOf(original).indexOf(FIRST_WRITE)),
    )
    // The guards ahead of it — caller, name, sections — are the original's.
    const guards = (sql: string, until: string) => sql.slice(sql.indexOf('begin '), sql.indexOf(until))
    expect(guards(body, CHECK)).toBe(guards(bodyOf(original), FIRST_WRITE))
  })
})

describe('a non-viable commit persists nothing', () => {
  it('leaves the profile incomplete and writes no location, equipment or constraint', async () => {
    const { double, client } = harness()
    const before = double.store()

    const committed = await client.completeOnboarding(answersFrom(NOT_VIABLE))

    expect(committed.ok).toBe(false)
    expect(double.requests()).toEqual([{ method: 'POST', path: '/rpc/complete_onboarding' }])
    expect(double.store()).toEqual(before)
    expect(double.store().profile.onboarded_at).toBeNull()
    expect(double.store().locations).toEqual([])
    expect(double.store().equipment).toEqual({})
    expect(double.store().constraints).toEqual([])
  })

  it('leaves an earlier valid setup exactly as it was', async () => {
    const first = harness()
    await first.client.completeOnboarding(
      answersFrom([
        { type: 'tier', value: 'home' },
        { type: 'experience', value: 'new' },
        { type: 'goal', value: 'balanced' },
        { type: 'pattern', value: 'power' },
      ]),
    )
    const valid = first.double.store()
    expect(valid.profile.onboarded_at).not.toBeNull()

    const { double, client } = harness(valid)
    const committed = await client.completeOnboarding(answersFrom(NOT_VIABLE))

    expect(committed.ok).toBe(false)
    expect(double.store()).toEqual(valid)
  })

  it('refuses a request crafted without the client, by the commit itself', async () => {
    const { double } = harness()
    const before = double.store()

    // Not a payload the screen can produce: no equipment at all, sections the
    // presets never combine. Nothing but the function stands in its way.
    const response = await double.fetch(`${URL_}/rest/v1/rpc/complete_onboarding`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({
        p_location_name: 'Nowhere',
        p_location_tier: 'full',
        p_equipment: ['  ', ''],
        p_experience_level: 'confident',
        p_goal_preset: 'strength',
        p_sections: ['primary_lift'],
      }),
    })
    const problem = (await response.json()) as { code: string; details: string }

    expect(response.status).toBe(400)
    expect(problem.code).toBe(NOT_VIABLE_PG_CODE)
    expect(
      (JSON.parse(problem.details) as { section: string }[]).map((row) => row.section),
    ).toContain('primary_lift')
    expect(double.store()).toEqual(before)
  })

  it('is refused whichever answer made it impossible: equipment or what is worked around', () => {
    const everyPattern = answersFrom([
      { type: 'tier', value: 'full' },
      { type: 'experience', value: 'confident' },
      { type: 'goal', value: 'strength' },
      ...ENUMS.movement_pattern.map(
        (pattern): OnboardingAction => ({ type: 'pattern', value: pattern }),
      ),
    ])
    const outcome = completeOnboarding(emptyStore(), argsFrom(everyPattern))

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.code).toBe(NOT_VIABLE_PG_CODE)
    expect(
      (JSON.parse(outcome.details ?? '[]') as { failure_class: string }[]).map(
        (row) => row.failure_class,
      ),
    ).toContain('athlete_exclusion')
  })
})

describe('every unedited tier × Goal preset completes', () => {
  const presets = TIERS.flatMap((tier) => GOALS.map((goal) => ({ tier: tier.value, goal: goal.value })))

  it('covers every tier and every Goal onboarding offers', () => {
    expect(presets).toHaveLength(ENUMS.equipment_tier.length * (ENUMS.goal_preset.length - 1))
  })

  it.each(presets)('$tier × $goal commits every row', async ({ tier, goal }) => {
    const { double, client } = harness()

    const committed = await client.completeOnboarding(
      answersFrom([
        { type: 'tier', value: tier },
        { type: 'experience', value: 'some' },
        { type: 'goal', value: goal },
      ]),
    )

    expect(committed.ok, committed.ok ? '' : committed.error.message).toBe(true)
    if (!committed.ok) return

    const stored = double.store()
    expect(stored.profile.onboarded_at).not.toBeNull()
    expect(stored.profile.goal_preset).toBe(goal)
    expect(stored.profile.enabled_sections).toEqual(SECTIONS_BY_GOAL[goal])
    expect(stored.locations).toEqual([committed.value.location])
    expect(committed.value.location).toMatchObject({ tier, is_default: true })
    expect(stored.equipment[committed.value.location.id]).toEqual(EQUIPMENT_BY_TIER[tier])
    expect(stored.constraints).toEqual([])
    expect(committed.value.profile).toEqual(stored.profile)
  })
})

describe('the refusal the client answers with', () => {
  it('is a validation failure carrying the failing section, its class and the choice', async () => {
    const { client } = harness()

    const committed = await client.completeOnboarding(answersFrom(NOT_VIABLE))

    expect(committed.ok).toBe(false)
    if (committed.ok) return
    expect(committed.error.code).toBe(ErrorCode.VALIDATION_CONSTRAINT)
    expect(viabilityFailuresOf(committed.error)).toEqual([
      {
        section: 'carries',
        failureClass: 'missing_equipment',
        incompatibleChoice: { kind: 'equipment', equipment: [...EQUIPMENT_BY_TIER.minimal].sort() },
        goals: ENUMS.goal_preset.filter((goal) => goal !== 'active_recovery'),
        focuses: [...ENUMS.session_focus],
        blocksProposedGoal: true,
      },
    ])
  })

  it('names the section and the equipment in plain language', async () => {
    const { client } = harness()

    const committed = await client.completeOnboarding(answersFrom(NOT_VIABLE))

    expect(committed.ok).toBe(false)
    if (committed.ok) return
    expect(committed.error.message).toBe(
      'Nothing in Carries can be done with the equipment you chose ' +
        '(Bodyweight, Resistance bands, Foam roller). ' +
        'Add equipment to your setup, or turn off Carries.',
    )
  })

  it('names what is worked around when that is what emptied the section', async () => {
    const { client } = harness()

    const committed = await client.completeOnboarding(
      answersFrom([
        { type: 'tier', value: 'full' },
        { type: 'experience', value: 'confident' },
        { type: 'goal', value: 'strength' },
        ...ENUMS.movement_pattern.map(
          (pattern): OnboardingAction => ({ type: 'pattern', value: pattern }),
        ),
      ]),
    )

    expect(committed.ok).toBe(false)
    if (committed.ok) return
    expect(committed.error.message).toMatch(/^Working around .+ leaves nothing for .*Primary lift/)
  })

  it('leaves any other refusal as the failure it was', async () => {
    for (const body of [
      { code: '23514', message: 'a location needs a name', details: null },
      { code: NOT_VIABLE_PG_CODE, message: 'refused', details: null },
      { code: NOT_VIABLE_PG_CODE, message: 'refused', details: 'not json' },
      { code: NOT_VIABLE_PG_CODE, message: 'refused', details: '[]' },
      { code: NOT_VIABLE_PG_CODE, message: 'refused', details: '[{"section":"nowhere"}]' },
    ]) {
      const client = createUserDataClient({
        auth: {
          getSession: async () =>
            ok({
              accessToken: TOKEN,
              refreshToken: 'refresh',
              expiresAt: Date.now() + 3_600_000,
              user: { id: 'user', email: 'lifter@example.test' },
            }),
        },
        supabase: {
          url: URL_,
          anonKey: ANON_KEY,
          fetch: async () =>
            new Response(JSON.stringify(body), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }),
        },
      })

      const committed = await client.completeOnboarding(answersFrom(NOT_VIABLE))

      expect(committed.ok).toBe(false)
      if (committed.ok) continue
      expect(committed.error.code).toBe(ErrorCode.VALIDATION_CONSTRAINT)
      expect(viabilityFailuresOf(committed.error), JSON.stringify(body)).toEqual([])
    }
  })
})

describe('the onboarding screen', () => {
  function setup() {
    const { double, client } = harness()
    const userData = createFakeUserDataClient({
      profile: async () => ok(notOnboardedProfile()),
      locations: async () => ok([]),
      completeOnboarding: (answers) => client.completeOnboarding(answers),
    })
    const queryClient = new QueryClient()
    const user = userEvent.setup()
    renderApp(['/onboarding'], signedIn({ userData, queryClient }))

    return { user, userData, queryClient, double }
  }

  const onStep = (step: keyof typeof STEP_TITLES) =>
    screen.findByRole('heading', { level: 2, name: STEP_TITLES[step] })
  const next = () => screen.getByRole('button', { name: /^(Next|Skip)$/ })
  const back = () => screen.getByRole('button', { name: 'Back' })

  it('announces the named choice, stays in onboarding, and keeps every answer', async () => {
    const { user, userData, queryClient, double } = setup()

    await onStep('location')
    await user.click(screen.getByRole('radio', { name: 'Minimal' }))
    await user.click(next())
    await onStep('experience')
    await user.click(screen.getByRole('radio', { name: 'Some experience' }))
    await user.click(next())
    await onStep('goals')
    await user.click(screen.getByRole('radio', { name: 'Strength' }))
    await user.click(screen.getByRole('checkbox', { name: 'Carries' }))
    await user.click(next())
    await onStep('limitations')
    await user.click(screen.getByRole('checkbox', { name: 'Hard conditioning' }))
    await user.type(screen.getByLabelText(/Note/), 'Easy on the lungs')
    await user.click(next())
    await onStep('confirm')

    await user.click(screen.getByRole('button', { name: 'Finish setup' }))

    // Announced: an alert, in the step's own validation line — a paragraph,
    // not the failed-save view and not a new component.
    const alert = await screen.findByRole('alert')
    expect(alert.tagName).toBe('P')
    expect(alert).toHaveTextContent(
      'Nothing in Carries can be done with the equipment you chose ' +
        '(Bodyweight, Resistance bands, Foam roller). ' +
        'Add equipment to your setup, or turn off Carries.',
    )
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.queryByText('Your setup didn’t save')).not.toBeInTheDocument()

    // Still onboarding, still not onboarded, nothing stored.
    expect(screen.getByRole('heading', { level: 2, name: STEP_TITLES.confirm })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finish setup' })).toBeEnabled()
    expect(queryClient.getState<Profile | null>(profileQueryKey(FIXTURE_USER_ID))).toEqual({
      status: 'ready',
      data: notOnboardedProfile(),
    })
    expect(double.store()).toEqual(emptyStore())

    // Every entered value, step by step, back to the first.
    await user.click(back())
    await onStep('limitations')
    expect(screen.getByRole('checkbox', { name: 'Hard conditioning' })).toBeChecked()
    expect(screen.getByLabelText(/Note/)).toHaveValue('Easy on the lungs')
    await user.click(back())
    await onStep('goals')
    expect(screen.getByRole('radio', { name: 'Strength' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Carries' })).toBeChecked()
    await user.click(back())
    await onStep('experience')
    expect(screen.getByRole('radio', { name: 'Some experience' })).toBeChecked()
    await user.click(back())
    await onStep('location')
    expect(screen.getByRole('radio', { name: 'Minimal' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Resistance bands' })).toBeChecked()

    // Unchanged answers are still refused answers: the line is there on return.
    await user.click(next())
    await user.click(next())
    await user.click(next())
    await user.click(next())
    await onStep('confirm')
    expect(screen.getByRole('alert')).toHaveTextContent('turn off Carries')

    // Correct the named choice, and the same draft commits.
    await user.click(back())
    await user.click(back())
    await onStep('goals')
    await user.click(screen.getByRole('checkbox', { name: 'Carries' }))
    await user.click(next())
    await user.click(next())
    await onStep('confirm')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Finish setup' }))

    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(userData.onboardingCalls).toHaveLength(2)
    expect(userData.onboardingCalls[1]).toEqual({
      ...userData.onboardingCalls[0],
      enabled_sections: userData.onboardingCalls[0]?.enabled_sections.filter(
        (section) => section !== 'carries',
      ),
    })
    expect(double.store().profile.onboarded_at).not.toBeNull()
    expect(double.store().constraints).toHaveLength(1)
  })
})
