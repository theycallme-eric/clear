import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  ACTIVE_RECOVERY_INTENSITY_MAX,
  OUTPUT_CONTRACT,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  assemblePrompt,
  buildUserMessage,
  byteLength,
  effectiveIntensity,
  resolveEffectiveRequest,
  serializeCandidate,
  withRetryCorrection,
  type PromptInput,
} from '../../supabase/functions/_shared/prompt.ts'
import { ACTIVE_RECOVERY_SECTIONS } from '../data/candidates'
import { CONTRACT_VERSION } from '../state/schemas'
import {
  CANDIDATE_LIBRARY,
  legacyLibraryBlock,
  legacyLibraryRows,
  legacySystemPrompt,
  promptInput,
  sectionFixture,
} from './generation-prompt-fixtures'

// GEN-02b. The prompt is a specification document that happens to be a string,
// so these tests treat it as one: the system prompt is compared to the spec's
// own fenced block byte for byte, and the user message is compared to the order
// §3 fixes rather than to a snapshot nobody would read again.
//
// The three negatives matter as much as the shape. The prompt must not carry
// the exercise library, must not carry facts Claude is forbidden to return, and
// must not restate a rule the candidate query already enforced — each of those
// is a thing the old prompt did, and each is measurable here.

const repoRoot = resolve(import.meta.dirname, '../..')

const read = (relativePath: string) => readFileSync(resolve(repoRoot, relativePath), 'utf-8')

const SPEC = 'docs/specs/generation/PROMPT_v4.md'

/** The first fenced `text` block of the spec — §2's system prompt. */
function specSystemPrompt(): string {
  const match = read(SPEC).match(/^```text\n([\s\S]*?)\n```$/m)
  if (!match) throw new Error(`${SPEC} no longer contains a fenced system prompt`)

  return match[1]
}

describe('the system prompt against PROMPT_v4.md §2', () => {
  it('is the spec’s own text, byte for byte', () => {
    expect(SYSTEM_PROMPT).toBe(specSystemPrompt())
  })

  it('states the version the spec states', () => {
    expect(read(SPEC)).toContain(`**Prompt version:** \`${PROMPT_VERSION}\``)
    expect(read(SPEC)).toContain(`**Contract version:** \`${CONTRACT_VERSION}\``)
  })

  it('carries composition judgment — the arc, the goal shapes, the structures', () => {
    for (const heading of [
      'PRIORITY',
      'GOAL SHAPES',
      'STRUCTURES',
      'REP AND SET GUIDANCE',
      'LOAD GUIDANCE',
      'SECTION COMPOSITION',
      'HISTORY AND VARIETY',
      'DURATION',
    ]) {
      expect(SYSTEM_PROMPT).toContain(heading)
    }
  })

  it('forbids the facts hydration owns', () => {
    expect(SYSTEM_PROMPT).toContain(
      'do not return exercise\nnames, equipment display strings, coaching cues, regressions, or factual catalog content',
    )
  })

  it('never dumps the exercise library, which is what version 5 means', () => {
    expect(SYSTEM_PROMPT).not.toContain('EXERCISE LIBRARY')
    // The old prompt's own words for the rule the candidate query now makes
    // structurally true. A sentence cannot enforce it; a `WHERE` clause can.
    expect(SYSTEM_PROMPT).not.toMatch(/you MUST only use exercise_id values/i)
  })
})

describe('the active-recovery clamp', () => {
  // The system prompt says "Intensity is already clamped to 1–3" as a statement
  // of fact. It has to be true before assembly, not checked after it.
  it('is applied before the prompt is built', () => {
    const input = promptInput({
      request: resolveEffectiveRequest({
        requestId: 'req_abc123_def456',
        goal: 'active_recovery',
        focus: 'full_body',
        requestedIntensity: 9,
        durationTargetMins: 30,
        enabledSections: ['warmup', 'primary_lift', 'conditioning'],
      }),
    })

    const message = buildUserMessage(input)

    expect(message).toContain('requested_intensity: 9')
    expect(message).toContain(`effective_intensity: ${ACTIVE_RECOVERY_INTENSITY_MAX}`)
  })

  it('leaves an intensity already inside the range alone', () => {
    expect(effectiveIntensity('active_recovery', 2)).toBe(2)
    expect(effectiveIntensity('active_recovery', 3)).toBe(3)
    expect(effectiveIntensity('active_recovery', 10)).toBe(3)
  })

  it('clamps no other goal, because no other goal has a stated range here', () => {
    for (const goal of ['strength', 'hypertrophy', 'conditioning', 'balanced'] as const) {
      expect(effectiveIntensity(goal, 10)).toBe(10)
    }
  })

  it('announces the sections generation actually composed for', () => {
    // `generation_candidates` overrides `enabled_sections` for this goal, so a
    // prompt echoing the profile's toggles would describe a candidate set the
    // caller was never given.
    const request = resolveEffectiveRequest({
      requestId: 'req_abc123_def456',
      goal: 'active_recovery',
      focus: null,
      requestedIntensity: 3,
      durationTargetMins: 30,
      enabledSections: ['warmup', 'primary_lift', 'conditioning'],
    })

    expect(request.effectiveSections).toEqual(ACTIVE_RECOVERY_SECTIONS)
    expect(buildUserMessage(promptInput({ request }))).toContain(
      `enabled_sections: [${ACTIVE_RECOVERY_SECTIONS.join(',')}]`,
    )
  })
})

describe('the user message against PROMPT_v4.md §3', () => {
  const message = buildUserMessage(promptInput())

  it('is assembled in the spec’s stable order', () => {
    const headings = message
      .split('\n')
      .filter((line) =>
        /^(REQUEST|RECENT HISTORY|TRAINING HISTORY|SOFT PREFERENCES|CANDIDATES — |OUTPUT CONTRACT)/.test(
          line,
        ),
      )

    expect(headings).toEqual([
      'REQUEST',
      'RECENT HISTORY',
      'TRAINING HISTORY (labels and confidence only — the app fills every load after generation)',
      'SOFT PREFERENCES',
      'CANDIDATES — warmup',
      'CANDIDATES — primary_lift',
      'CANDIDATES — accessory',
      'OUTPUT CONTRACT',
    ])
  })

  it('states both intensities and the effective duration target', () => {
    expect(message).toContain('goal: strength')
    expect(message).toContain('focus: lower_body')
    expect(message).toContain('requested_intensity: 8')
    expect(message).toContain('effective_intensity: 8')
    expect(message).toContain('effective_duration_target_mins: 45')
  })

  it('summarizes history compactly rather than dumping sessions', () => {
    expect(message).toContain('recent_focuses: upper_body, full_body, lower_body')
    expect(message).toContain('patterns: press(3) pull(2) squat(1)')
    expect(message).toContain('recent_exercise_ids: back-squat, deadlift')
  })

  it('passes soft constraints and notes as ranking signals, never as filters', () => {
    expect(message).toContain('prefer_not: exercise:walking-lunges')
    expect(message).toContain('avoid: movement_pattern:power')
    expect(message).toContain('notes: "left shoulder has been a bit cranky"')
  })

  it('says none rather than printing an empty heading', () => {
    const empty = buildUserMessage(
      promptInput({
        history: { focuses: [], patterns: [], exerciseIds: [] },
        preferences: { constraints: [], notes: null },
      }),
    )

    expect(empty).toContain('RECENT HISTORY\nnone')
    expect(empty).toContain('SOFT PREFERENCES\nnone')
  })

  it('carries the output contract’s enums from the database’s own vocabulary', () => {
    expect(message).toContain(OUTPUT_CONTRACT)
    expect(OUTPUT_CONTRACT).toContain('standard|superset|circuit|emom|amrap|for_time')
    expect(OUTPUT_CONTRACT).toContain('fixed|range|sequence')
    expect(OUTPUT_CONTRACT).toContain('percent_1rm|rir|bodyweight|prior_session|absolute|none')
    expect(OUTPUT_CONTRACT).toContain('estimated_duration_mins')
    expect(OUTPUT_CONTRACT).toContain('diagnostic only, never authoritative')
  })
})

describe('the candidate serializer', () => {
  it('sends what composition needs and nothing hydration owns', () => {
    const line = serializeCandidate(CANDIDATE_LIBRARY['back-squat'])

    expect(line).toBe(
      '  back-squat | patterns:[squat] | role:compound_lift' +
        ' | components:[knee-flexion,hip-flexion,brace,upper-back-tension]' +
        ' | muscles:[core:stabilizer,erectors:stabilizer,glutes:primary,' +
        'hamstrings:synergist,quads:primary]' +
        ' | equipment:[barbell] | can_be_primary',
    )
  })

  it('omits a field the candidate has nothing for', () => {
    // A mobility candidate carries no movement pattern — it is eligible for its
    // role, not its pattern (§3) — and `patterns:[]` says that no better than
    // leaving it out does.
    expect(serializeCandidate(CANDIDATE_LIBRARY['cat-cow'])).not.toContain('patterns:')
    expect(serializeCandidate(CANDIDATE_LIBRARY['glute-bridge'])).not.toContain('can_be_primary')
  })

  it('is deterministic: section order, then exercise id order', () => {
    const forward = buildUserMessage(promptInput())
    const shuffled = buildUserMessage(
      promptInput({
        sections: [
          sectionFixture('accessory', ['walking-lunges', 'glute-bridge', 'bulgarian-split-squat']),
          sectionFixture('primary_lift', ['front-squat', 'deadlift', 'back-squat']),
          sectionFixture('warmup', ['worlds-greatest-stretch', 'cat-cow', '90-90-stretch']),
        ],
      }),
    )

    expect(shuffled).toBe(forward)
  })

  it('records a relaxed section instead of widening quietly', () => {
    const relaxed = buildUserMessage(
      promptInput({
        sections: [{ ...sectionFixture('accessory', ['glute-bridge']), relaxed: true }],
      }),
    )

    expect(relaxed).toContain('CANDIDATES — accessory (pattern predicate relaxed to reach the floor)')
  })
})

describe('what the prompt refuses to contain', () => {
  const message = buildUserMessage(promptInput())

  it('contains no exercise outside the resolved candidate set', () => {
    const resolved = new Set(
      promptInput().sections.flatMap((section) =>
        section.candidates.map((candidate) => candidate.exerciseId),
      ),
    )

    for (const [id, candidate] of Object.entries(CANDIDATE_LIBRARY)) {
      if (resolved.has(id)) continue
      expect(message).not.toContain(candidate.exerciseId)
    }
  })

  it('contains no catalog name, cue, regression or display string', () => {
    for (const candidate of Object.values(CANDIDATE_LIBRARY)) {
      expect(message).not.toContain(candidate.name)
    }
    expect(message).not.toMatch(/coaching_cues|regression|equipment_display/i)
  })

  it('restates no rule the candidate query already enforced', () => {
    // Availability, exclusions and section eligibility are `WHERE` clauses in
    // `generation_candidates`. Repeating them costs input tokens to say
    // something the model could not act against anyway.
    expect(message).not.toMatch(/available equipment/i)
    expect(message).not.toMatch(/you MUST only use/i)
    expect(message).not.toMatch(/excluded/i)
  })
})

describe('the retry addendum against PROMPT_v4.md §4', () => {
  const user = buildUserMessage(promptInput())
  const retry = withRetryCorrection(user, {
    code: 'generation.malformed_prescription',
    detail: 'sections[0].blocks[0].exercises[1].distance_unit: required',
  })

  it('reuses the original prompt and appends only the typed failure', () => {
    expect(retry.startsWith(user)).toBe(true)
    expect(retry.slice(user.length)).toBe(
      '\n\nRETRY CORRECTION\n' +
        'The prior response failed: generation.malformed_prescription.\n' +
        'sections[0].blocks[0].exercises[1].distance_unit: required\n' +
        'Return a complete corrected JSON object. Do not explain the correction.',
    )
  })

  it('never asks the model to patch a partial object', () => {
    expect(retry).toContain('Return a complete corrected JSON object')
    expect(retry).not.toMatch(/fix the|patch|only the field/i)
  })

  it('omits the detail line when there is no specific field to name', () => {
    const bare = withRetryCorrection(user, { code: 'generation.upstream', detail: null })

    expect(bare.slice(user.length)).toBe(
      '\n\nRETRY CORRECTION\n' +
        'The prior response failed: generation.upstream.\n' +
        'Return a complete corrected JSON object. Do not explain the correction.',
    )
  })
})

describe('prompt 5.1.0 measured against the captured v4.0.0 baseline', () => {
  // PROMPT_v4.md §5 asks for the comparison and says the result belongs in the
  // GEN-02b change rather than in the static spec. This is that record, and it
  // is a test rather than a note so it cannot quietly stop being true.
  //
  // The baseline is the previous app's own prompt, read from the read-only
  // evidence under `docs/backend/evidence/` (REQ-008): its verbatim v4.0.0
  // system prompt, plus its library block rendered from the captured catalog
  // for *only* the exercises this request resolved as candidates. That second
  // part is a deliberate lower bound — the old function sent the whole
  // equipment-filtered library, roughly a hundred rows, where this renders the
  // nine that survived eligibility. The real v4 prompt was larger than the
  // number compared against here, so the reduction measured is the smallest
  // one that can be claimed.
  const input: PromptInput = promptInput()
  const assembled = assemblePrompt(input)
  const { measurement } = assembled

  const legacySystemBytes = byteLength(legacySystemPrompt(read))
  const legacyCandidateBytes = byteLength(legacyLibraryBlock(input.sections))
  const legacyLowerBound = legacySystemBytes + legacyCandidateBytes

  it('records the measurement §5 asks for', () => {
    expect(measurement).toEqual({
      promptVersion: '5.1.0',
      contractVersion: CONTRACT_VERSION,
      systemBytes: byteLength(SYSTEM_PROMPT),
      userBytes: byteLength(assembled.user),
      totalBytes: byteLength(SYSTEM_PROMPT) + byteLength(assembled.user),
      sectionCount: 3,
      candidateCount: 9,
      anchoredExerciseCount: 2,
      sessionDirective: 'normal',
    })
  })

  it('is measurably shorter than the old app’s, whole prompt to whole prompt', () => {
    expect(measurement.totalBytes).toBeLessThan(legacyLowerBound)
    // §2 predicted the system prompt alone would drop ~40%, and the library going
    // away is the larger half. The floor was 0.5 at 5.0.0 and is 0.6 at 5.1.0,
    // and the difference is stated rather than quietly relaxed: OVR-02 adds a
    // TRAINING HISTORY block and its directive handling, which the v4 prompt has
    // no equivalent of at all. The comparison is still the same lower bound — the
    // old prompt's nine candidate rows rather than its hundred — so a prompt that
    // carries strictly more instruction is still measurably the smaller one.
    expect(measurement.totalBytes / legacyLowerBound).toBeLessThan(0.6)
  })

  it('drops the system prompt by the ~40% GENERATION_CONTRACT §2 predicted', () => {
    expect(measurement.systemBytes / legacySystemBytes).toBeLessThan(0.65)
  })

  it('spends fewer bytes on a candidate than the library row spent on it', () => {
    // Row for row against the same nine exercises, this is the smaller half of
    // the saving: the name, the sections list and the regression reference are
    // gone, because hydration owns all three. The larger half is scope — nine
    // rows here against the hundred-odd the old function sent — and the whole
    // prompt comparison above is where that shows up.
    const v5 = input.sections.flatMap((section) => section.candidates).map(serializeCandidate)
    const legacy = legacyLibraryRows(input.sections)

    expect(v5).toHaveLength(legacy.length)
    expect(v5.reduce((total, line) => total + byteLength(line), 0)).toBeLessThan(
      legacy.reduce((total, line) => total + byteLength(line), 0),
    )
  })
})

describe('the assembled prompt', () => {
  it('is the system prompt, the user message, and what they measured', () => {
    const assembled = assemblePrompt(promptInput())

    expect(assembled.system).toBe(SYSTEM_PROMPT)
    expect(assembled.user).toBe(buildUserMessage(promptInput()))
    expect(assembled.measurement.promptVersion).toBe(PROMPT_VERSION)
    expect(assembled.measurement.candidateCount).toBe(9)
  })

  it('carries no secret anywhere in it', () => {
    const assembled = assemblePrompt(promptInput())

    expect(`${assembled.system}${assembled.user}`).not.toMatch(/api[_-]?key|sk-ant|authorization/i)
  })
})
