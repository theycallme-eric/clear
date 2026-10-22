import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  assertTask035ReleaseCase,
  buildTask035ReleaseObservations,
  TASK035_PROOF_CASE_ID,
  writeTask035ReleaseObservations,
} from '../../../e2e/support/task035-release-case'
import { generationRequestSchema, sessionAcceptanceSchema } from '../../state/schemas'
import { makeGenerationOutput, makeLadderTimingBlock, makeSessionAcceptance, makeWorkoutBlock } from '../factories'

const COMMIT = 'a'.repeat(40)
const REQUEST_ID = 'req_task035_release'

function fixture() {
  const request = generationRequestSchema.parse({
    request_id: REQUEST_ID,
    goal: 'active_recovery', focus: 'full_body', date: '2026-10-22',
    requested_intensity: 9, requested_duration_mins: 15,
    location_id: 'd0000001-0000-4000-8000-000000000000', notes: null,
  })
  const acceptance = sessionAcceptanceSchema.parse(makeSessionAcceptance({
    goal_preset: 'active_recovery', session_focus: 'full_body',
    requested_intensity: 9, effective_intensity: 3,
    requested_duration_mins: 15, effective_duration_target_mins: 15,
    prompt_version: '5.3.0', contract_version: '4.2.0',
    workout: makeGenerationOutput({
      sections: [
        { section_type: 'warmup', section_title: 'Prepare', section_notes: null, blocks: [makeWorkoutBlock()] },
        { section_type: 'cooldown', section_title: 'Settle', section_notes: null, blocks: [makeLadderTimingBlock('capped_window')] },
      ],
    }),
  }))
  const stored = [{
    goal_preset: acceptance.goal_preset,
    session_focus: acceptance.session_focus,
    requested_duration_mins: acceptance.requested_duration_mins,
    effective_duration_target_mins: acceptance.effective_duration_target_mins,
    requested_intensity: acceptance.requested_intensity,
    effective_intensity: acceptance.effective_intensity,
    prompt_version: acceptance.prompt_version,
    contract_version: acceptance.contract_version,
    overview: acceptance.workout.overview,
    sections: acceptance.workout.sections.map((section) => ({
      section_notes: section.section_notes,
      blocks: section.blocks.map((block) => ({ ladder_timing: block.ladder_timing ?? null })),
    })),
  }]
  return {
    commit: COMMIT, requestId: REQUEST_ID, request, acceptance, stored,
    display: {
      overviewSuppressed: true, sectionNotesSuppressed: true,
      intensity: '3 of 10', goal: 'Active recovery', focus: 'Full body', duration: '15 min',
    },
  }
}

describe('Task035 concrete protected release case (offline assertions only)', () => {
  it('keeps requested 9 distinct from effective 3 and validates exact accepted versions/null introductions', () => {
    const input = fixture()
    const checked = assertTask035ReleaseCase(input.request, input.acceptance)
    expect(checked.request).toEqual({
      goal: 'active_recovery', focus: 'full_body', requestedDurationMins: 15, requestedIntensity: 9,
    })
    expect(checked.accepted).toEqual({
      goal: 'active_recovery', focus: 'full_body', requestedDurationMins: 15, effectiveDurationMins: 15,
      requestedIntensity: 9, effectiveIntensity: 3, overview: null, sectionNotes: [null, null],
    })
    expect(checked.promptVersion).toBe('5.3.0')
    expect(checked.contractVersion).toBe('4.2.0')
  })

  it.each([
    ['goal', 'balanced'], ['focus', 'upper_body'], ['requested_duration_mins', 45], ['requested_intensity', 3],
  ] as const)('rejects changed actual request %s', (key, value) => {
    const input = fixture()
    Object.assign(input.request, { [key]: value })
    expect(() => buildTask035ReleaseObservations(input)).toThrow('Task035 release case:')
  })

  it.each([
    ['goal_preset', 'balanced'], ['session_focus', 'upper_body'],
    ['requested_duration_mins', 45], ['effective_duration_target_mins', 10],
    ['requested_intensity', 3], ['effective_intensity', 9],
    ['prompt_version', '5.2.0'], ['contract_version', '4.1.0'],
  ] as const)('rejects changed actual acceptance %s', (key, value) => {
    const input = fixture()
    Object.assign(input.acceptance, { [key]: value })
    expect(() => buildTask035ReleaseObservations(input)).toThrow('Task035 release case:')
  })

  it('requires accepted nulls, not merely absent DOM prose', () => {
    const overview = fixture()
    overview.acceptance.workout.overview = 'SENSITIVE INTRODUCTION'
    expect(() => buildTask035ReleaseObservations(overview)).toThrow('accepted overview differs')
    const section = fixture()
    section.acceptance.workout.sections[1].section_notes = 'SENSITIVE SECTION'
    expect(() => buildTask035ReleaseObservations(section)).toThrow('accepted section notes differs')
    section.acceptance.workout.sections = []
    expect(() => buildTask035ReleaseObservations(section)).toThrow('no accepted section')
  })

  it.each([
    ['overviewSuppressed', false], ['sectionNotesSuppressed', false], ['intensity', '9 of 10'],
    ['goal', 'Balanced'], ['focus', 'Upper body'], ['duration', '45 min'],
  ] as const)('rejects incomplete or different actual display %s', (key, value) => {
    const input = fixture()
    Object.assign(input.display, { [key]: value })
    expect(() => buildTask035ReleaseObservations(input)).toThrow('Task035 release case:')
  })

  it.each([
    ['goal_preset', 'balanced'], ['session_focus', 'upper_body'],
    ['requested_duration_mins', 45], ['effective_duration_target_mins', 10],
    ['requested_intensity', 3], ['effective_intensity', 9],
    ['prompt_version', '5.2.0'], ['contract_version', '4.1.0'], ['overview', 'SENSITIVE STORED INTRO'],
  ] as const)('rejects changed actual stored %s', (key, value) => {
    const input = fixture()
    Object.assign(input.stored[0], { [key]: value })
    expect(() => buildTask035ReleaseObservations(input)).toThrow('Task035 release case:')
  })

  it('requires exactly one persisted session and complete ordered sections/blocks', () => {
    for (const alter of [
      (input: ReturnType<typeof fixture>) => { input.stored = [] },
      (input: ReturnType<typeof fixture>) => { input.stored.push(structuredClone(input.stored[0])) },
      (input: ReturnType<typeof fixture>) => { input.stored[0].sections.pop() },
      (input: ReturnType<typeof fixture>) => { input.stored[0].sections[0].blocks = [] },
      (input: ReturnType<typeof fixture>) => { input.stored[0].sections[0].section_notes = 'SENSITIVE' },
    ]) {
      const input = fixture()
      alter(input)
      expect(() => buildTask035ReleaseObservations(input)).toThrow('Task035 release case:')
    }
  })

  it('checks real ladder_timing projection, including null, without a missing-column fallback', () => {
    const input = fixture()
    expect(buildTask035ReleaseObservations(input).persisted.ladderTimingMatches).toBe(true)
    Reflect.deleteProperty(input.stored[0].sections[0].blocks[0], 'ladder_timing')
    expect(() => buildTask035ReleaseObservations(input)).toThrow('stored ladder timing differs or is absent')
    const mismatch = fixture()
    mismatch.stored[0].sections[1].blocks[0].ladder_timing = null
    expect(() => buildTask035ReleaseObservations(mismatch)).toThrow('stored ladder timing differs or is absent')
  })

  it('emits only closed actual observations, never raw request/acceptance/account fields', () => {
    const input = fixture()
    input.request.notes = 'PRIVATE ATHLETE NOTE'
    Object.assign(input.stored[0], { user_id: 'PRIVATE USER', accessToken: 'PRIVATE TOKEN' })
    const observation = buildTask035ReleaseObservations(input)
    expect(Object.keys(observation).sort()).toEqual([
      'accepted', 'commit', 'contractVersion', 'display', 'persisted', 'promptVersion',
      'proofCaseId', 'request', 'requestId', 'version',
    ])
    expect(observation.proofCaseId).toBe(TASK035_PROOF_CASE_ID)
    expect(observation.persisted).toEqual({
      sessionCount: 1, requestedIntensity: 9, effectiveIntensity: 3,
      promptVersion: '5.3.0', contractVersion: '4.2.0',
      overview: null, sectionNotes: [null, null], ladderTimingMatches: true,
    })
    expect(JSON.stringify(observation)).not.toMatch(/PRIVATE|location_id|workout|accessToken|user_id/)
  })

  it('refuses invalid/mismatched identities and immutable evidence overwrite', () => {
    for (const override of [{ commit: '../unsafe' }, { requestId: '' }, { requestId: 'req_other_request' }]) {
      expect(() => buildTask035ReleaseObservations({ ...fixture(), ...override })).toThrow('Task035 release case:')
    }
    const root = mkdtempSync(join(tmpdir(), 'clear-task035-offline-'))
    try {
      const observation = buildTask035ReleaseObservations(fixture())
      const path = writeTask035ReleaseObservations(root, observation)
      expect(path).toBe(resolve(root, 'release-evidence', COMMIT, 'task035-release-observations.json'))
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(observation)
      expect(() => writeTask035ReleaseObservations(root, observation)).toThrow()
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(observation)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('wires the new assertions into the existing complete single-generation walk', () => {
    const spec = readFileSync(resolve('e2e/core-loop.spec.ts'), 'utf8')
    expect(spec).toContain('assertTask035ReleaseCase(sent, body.acceptance)')
    expect(spec).toContain("await expect(intensity).toHaveValue('9')")
    expect(spec).toContain('round_rest_seconds,rep_scheme,block_notes,ladder_timing,')
    expect(spec).toContain('ladder_timing: block.ladder_timing ?? null')
    expect(spec.indexOf('task035Observations = buildTask035ReleaseObservations('))
      .toBeGreaterThan(spec.indexOf("'the disposable canary has no athlete notes'"))
    const after = spec.slice(spec.indexOf('test.afterEach('), spec.indexOf("test('walks"))
    expect(after).toContain("if (testInfo.status === 'passed')")
    expect(after).toContain('if (!task035Observations) throw')
    expect(after).toContain('writeTask035ReleaseObservations(process.cwd(), task035Observations)')
    expect(spec).not.toContain('JSON.stringify(payload)')
  })
})
