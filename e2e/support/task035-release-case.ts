import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import type { GenerationRequest, SessionAcceptance } from '../../src/state/schemas'

export const TASK035_PROOF_CASE_ID = 'task035-recovery-intensity-9-mobile-v1'
export const TASK035_PROMPT_VERSION = '5.3.0'
export const TASK035_CONTRACT_VERSION = '4.2.0'

function exact<T extends string | number | null | boolean>(actual: unknown, expected: T, field: string): T {
  if (actual !== expected) throw new Error(`Task035 release case: ${field} differs.`)
  return expected
}

/** Deliberately generic failures: never print a request, response or stored row. */
export function assertTask035ReleaseCase(request: GenerationRequest, acceptance: SessionAcceptance) {
  const requested = {
    goal: exact(request.goal, 'active_recovery', 'request goal'),
    focus: exact(request.focus, 'full_body', 'request anchor'),
    requestedDurationMins: exact(request.requested_duration_mins, 15, 'request duration'),
    requestedIntensity: exact(request.requested_intensity, 9, 'request intensity'),
  }
  const accepted = {
    goal: exact(acceptance.goal_preset, 'active_recovery', 'accepted goal'),
    focus: exact(acceptance.session_focus, 'full_body', 'accepted anchor'),
    requestedDurationMins: exact(acceptance.requested_duration_mins, 15, 'accepted requested duration'),
    effectiveDurationMins: exact(acceptance.effective_duration_target_mins, 15, 'accepted effective duration'),
    requestedIntensity: exact(acceptance.requested_intensity, 9, 'accepted requested intensity'),
    effectiveIntensity: exact(acceptance.effective_intensity, 3, 'accepted effective intensity'),
    overview: exact(acceptance.workout.overview, null, 'accepted overview'),
    sectionNotes: acceptance.workout.sections.map((section) => exact(section.section_notes, null, 'accepted section notes')),
  }
  if (accepted.sectionNotes.length === 0) throw new Error('Task035 release case: no accepted section.')
  return {
    promptVersion: exact(acceptance.prompt_version, TASK035_PROMPT_VERSION, 'accepted prompt version'),
    contractVersion: exact(acceptance.contract_version, TASK035_CONTRACT_VERSION, 'accepted contract version'),
    request: requested,
    accepted,
  }
}

export interface Task035StoredSession {
  goal_preset: unknown
  session_focus: unknown
  requested_duration_mins: unknown
  effective_duration_target_mins: unknown
  requested_intensity: unknown
  effective_intensity: unknown
  prompt_version: unknown
  contract_version: unknown
  overview: unknown
  sections: { section_notes: unknown; blocks: { ladder_timing?: unknown }[] }[]
}

export interface Task035DisplayObservation {
  overviewSuppressed: boolean
  sectionNotesSuppressed: boolean
  intensity: string
  goal: string
  focus: string
  duration: string
}

/** Only closed, asserted derivations leave this helper; never raw workout/user data. */
export function buildTask035ReleaseObservations(input: {
  commit: string
  requestId: string
  request: GenerationRequest
  acceptance: SessionAcceptance
  display: Task035DisplayObservation
  stored: readonly Task035StoredSession[]
}) {
  if (!/^[a-f0-9]{40}$/.test(input.commit) || !/^req_[0-9a-z]+_[0-9a-z]+$/.test(input.requestId)) {
    throw new Error('Task035 release case: invalid commit or request identity.')
  }
  exact(input.request.request_id, input.requestId, 'request correlation')
  const checked = assertTask035ReleaseCase(input.request, input.acceptance)
  if (input.stored.length !== 1) throw new Error('Task035 release case: expected one stored session.')
  const stored = input.stored[0]
  exact(stored.goal_preset, checked.accepted.goal, 'stored goal')
  exact(stored.session_focus, checked.accepted.focus, 'stored anchor')
  exact(stored.requested_duration_mins, checked.accepted.requestedDurationMins, 'stored requested duration')
  exact(stored.effective_duration_target_mins, checked.accepted.effectiveDurationMins, 'stored effective duration')
  exact(stored.overview, null, 'stored overview')
  if (stored.sections.length !== input.acceptance.workout.sections.length) {
    throw new Error('Task035 release case: stored section count differs.')
  }
  const sectionNotes = stored.sections.map((section, index) => {
    const accepted = input.acceptance.workout.sections[index]
    if (section.blocks.length !== accepted.blocks.length || section.blocks.length === 0) {
      throw new Error('Task035 release case: stored block count differs.')
    }
    for (const [blockIndex, block] of section.blocks.entries()) {
      // A missing column is not null evidence. The real SELECT must include it.
      if (!Object.hasOwn(block, 'ladder_timing') ||
          !isDeepStrictEqual(block.ladder_timing, accepted.blocks[blockIndex].ladder_timing ?? null)) {
        throw new Error('Task035 release case: stored ladder timing differs or is absent.')
      }
    }
    return exact(section.section_notes, null, 'stored section notes')
  })
  return {
    version: 1 as const,
    proofCaseId: TASK035_PROOF_CASE_ID,
    commit: input.commit,
    requestId: input.requestId,
    ...checked,
    display: {
      overviewSuppressed: exact(input.display.overviewSuppressed, true, 'overview DOM suppression'),
      sectionNotesSuppressed: exact(input.display.sectionNotesSuppressed, true, 'section-note DOM suppression'),
      intensity: exact(input.display.intensity, '3 of 10', 'displayed intensity'),
      goal: exact(input.display.goal, 'Active recovery', 'displayed goal'),
      focus: exact(input.display.focus, 'Full body', 'displayed anchor'),
      duration: exact(input.display.duration, '15 min', 'displayed duration'),
    },
    persisted: {
      sessionCount: 1 as const,
      requestedIntensity: exact(stored.requested_intensity, 9, 'stored requested intensity'),
      effectiveIntensity: exact(stored.effective_intensity, 3, 'stored effective intensity'),
      promptVersion: exact(stored.prompt_version, TASK035_PROMPT_VERSION, 'stored prompt version'),
      contractVersion: exact(stored.contract_version, TASK035_CONTRACT_VERSION, 'stored contract version'),
      overview: null,
      sectionNotes,
      ladderTimingMatches: true as const,
    },
  }
}

export type Task035ReleaseObservations = ReturnType<typeof buildTask035ReleaseObservations>

export function writeTask035ReleaseObservations(root: string, observations: Task035ReleaseObservations): string {
  if (!/^[a-f0-9]{40}$/.test(observations.commit)) throw new Error('Task035 release case: invalid evidence commit.')
  const directory = resolve(root, 'release-evidence', observations.commit)
  mkdirSync(directory, { recursive: true })
  const path = resolve(directory, 'task035-release-observations.json')
  // A later invocation cannot silently replace retained proof or failure evidence.
  writeFileSync(path, `${JSON.stringify(observations, null, 2)}\n`, { flag: 'wx' })
  return path
}
