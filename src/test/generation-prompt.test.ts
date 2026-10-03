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
import {
  ACTIVE_RECOVERY_SECTIONS,
  SESSION_FOCUSES,
  createCandidatesClient,
  type Candidate,
  type SectionType,
  type SessionFocus,
} from '../data/candidates'
import { CONTRACT_VERSION } from '../state/schemas'
import { FOCUS_PATTERNS } from '../state/session-suggestion'
import { createCandidatesDouble } from './candidates-double'
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

  it('restores a main-work theme without turning coaching purposes into mandatory sections', () => {
    expect(SYSTEM_PROMPT).toContain('coherent theme from chosen main work and focus: ramp → main work → support → descent')
    expect(SYSTEM_PROMPT).toContain('These are purposes, not required sections.')
    expect(SYSTEM_PROMPT).toContain('focal/supporting, contrasting/balancing,\nprep/recovery or general conditioning')
    expect(SYSTEM_PROMPT).toContain("Encode their job and theme link with the schema's\nsession_function and anchor_relationship values.")
    expect(SYSTEM_PROMPT).toContain("Prepare the main work's candidate components; protect rehearsal before heat-building.")
    expect(SYSTEM_PROMPT).toContain('targets muscles actually worked')
    expect(SYSTEM_PROMPT).toContain('its amount fits the available time')
    expect(SYSTEM_PROMPT).toContain('Timed blocks enable a clock; never timer_type=none')
    expect(SYSTEM_PROMPT).toContain('not random novelty')
    expect(SYSTEM_PROMPT).not.toContain('40–50%')
    expect(SYSTEM_PROMPT).not.toContain('50–60%')
    expect(SYSTEM_PROMPT).not.toMatch(/^- [a-z_]+: warmup →/m)
  })

  it('balances supplied patterns softly without inventing history or forbidding useful repeated lifts', () => {
    expect(SYSTEM_PROMPT).toContain('Respect the chosen focus.')
    expect(SYSTEM_PROMPT).toContain('balance squat/hinge within lower-body work')
    expect(SYSTEM_PROMPT).toContain('press/pull within upper-body work, with complementary accessories')
    expect(SYSTEM_PROMPT).toContain('Useful lifts may repeat across\ndays; do not force novelty or infer absent history.')
  })

  it('puts superset shared rest where execution reads it rather than on ignored members', () => {
    expect(SYSTEM_PROMPT).toContain('shared rest only in round_rest_seconds, member rest_seconds 0/null')
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

describe('available parts and time-aware composition instructions', () => {
  const mirror = JSON.parse(read('src/test/generation-reliability/owner-mirror.json')) as {
    goal: PromptInput['request']['goal']
    enabledSections: SectionType[]
    equipment: string[]
  }

  async function resolvedPrompt(
    goal: PromptInput['request']['goal'],
    focus: SessionFocus,
    durationTargetMins: number,
  ) {
    const url = 'https://project.supabase.co'
    const anonKey = 'anon-key'
    const accessToken = 'user-token'
    const userId = 'user-1'
    const client = createCandidatesClient({
      url,
      anonKey,
      accessToken,
      fetch: createCandidatesDouble({
        url,
        anonKey,
        users: { [accessToken]: userId },
        profiles: {
          [userId]: {
            goalPreset: goal,
            enabledSections: mirror.enabledSections,
            locations: [{ id: 'location-home', isDefault: true, equipment: mirror.equipment }],
          },
        },
      }).fetch,
    })
    const candidates = await client.retrieve({ userId, focus })
    if (!candidates.ok) throw new Error(`retrieval failed: ${candidates.error.code}`)

    const request = resolveEffectiveRequest({
      requestId: 'req_section_prompt',
      goal,
      focus,
      requestedIntensity: goal === 'active_recovery' ? 9 : 6,
      durationTargetMins,
      enabledSections: mirror.enabledSections,
    })
    return {
      request,
      assembled: assemblePrompt(promptInput({
        request,
        sections: [...candidates.value].reverse(),
        preferences: { constraints: [], notes: null },
      })),
    }
  }

  const candidateHeadings = (user: string) =>
    user.split('\n')
      .filter((line) => line.startsWith('CANDIDATES — '))
      .map((line) => line.replace(' (pattern predicate relaxed to reach the floor)', ''))

  // Independent goal/time inputs, not arcs parsed from the prompt or fabricated
  // model workouts. These prove what composition is asked, not what it produces.
  for (const { goal, focus, character } of [
    { goal: 'strength', focus: 'upper_body', character: 'primary compound work dominates; accessories support it' },
    { goal: 'hypertrophy', focus: 'upper_body', character: 'related muscle work from different angles' },
    { goal: 'conditioning', focus: 'full_body', character: 'conditioning is the main work' },
    { goal: 'balanced', focus: 'upper_body', character: 'coherent strength plus conditioning when time permits, not a checklist' },
    { goal: 'active_recovery', focus: 'full_body', character: 'gentle mobility and recovery flow only' },
  ] as const) {
    it.each([15, 60, 90])(`${goal} carries a %i-minute target and available choices without a required output count`, async (minutes) => {
      const { request, assembled } = await resolvedPrompt(goal, focus, minutes)

      expect(assembled.user).toContain(`goal: ${goal}\nfocus: ${focus}`)
      expect(assembled.user).toContain(`effective_duration_target_mins: ${minutes}`)
      expect(assembled.user).toContain(`enabled_sections: [${request.effectiveSections.join(',')}]`)
      expect(candidateHeadings(assembled.user)).toEqual(
        request.effectiveSections.map((section) => `CANDIDATES — ${section}`),
      )
      expect(assembled.user).toContain('SOFT PREFERENCES\nnone')
      expect(assembled.system).toContain('Goals set character, not mandatory arcs or shares')
      expect(assembled.system).toContain(`${goal}: ${character}`)
      expect(assembled.system).toContain('Choose a useful subset of enabled_sections;\nnever a disabled section.')
      expect(assembled.system).toContain('Short sessions prioritize\ngoal-relevant main work')
      expect(assembled.system).toContain('conditioning for conditioning, gentle mobility for active_recovery')
      expect(assembled.system).toContain('coherent warmup prep and adequate rest')
      expect(assembled.system).toContain('omit optional parts before rushing work')
      expect(assembled.system).toContain('With more time\nadd useful volume, accessories or mobility, not filler')
      expect(assembled.system).toContain('Explain omissions or adjustments plainly in\noverview or section_notes')
      expect(assembled.system).toContain('selected sections follow candidate-group order')
      expect(assembled.system).not.toContain('section order matches the goal shape')
      expect(assembled.system).not.toContain('never omit a section')
      expect(assembled.system).not.toContain('Include every resolved enabled_sections entry')
    })
  }

  it('keeps customized available parts without prescribing an eight-part workout', async () => {
    const { request, assembled } = await resolvedPrompt(mirror.goal, 'upper_body', 15)

    expect(request.effectiveSections).toEqual(mirror.enabledSections)
    expect(candidateHeadings(assembled.user)).toContain('CANDIDATES — mobility')
    expect(candidateHeadings(assembled.user)).toContain('CANDIDATES — skill_power')
  })

  it('still limits active recovery availability and intensity before assembly', async () => {
    const { request, assembled } = await resolvedPrompt('active_recovery', 'full_body', 15)

    expect(request.effectiveSections).toEqual(ACTIVE_RECOVERY_SECTIONS)
    expect(request.effectiveIntensity).toBe(ACTIVE_RECOVERY_INTENSITY_MAX)
    expect(assembled.user).toContain(`enabled_sections: [${ACTIVE_RECOVERY_SECTIONS.join(',')}]`)
    expect(candidateHeadings(assembled.user)).toEqual(
      ACTIVE_RECOVERY_SECTIONS.map((section) => `CANDIDATES — ${section}`),
    )
    expect(assembled.system).toContain('active_recovery: gentle mobility and recovery flow only.')
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

  it.each(['new', 'some', 'confident'] as const)('carries saved experience %s only when supplied', (experience) => {
    expect(buildUserMessage(promptInput({ experience }))).toContain(`focus: lower_body\nexperience: ${experience}\nrequested_intensity: 8`)
  })

  it('does not invent experience for an unknown or older caller', () => {
    expect(message).not.toMatch(/^experience:/m)
    expect(buildUserMessage(promptInput({ experience: null }))).toBe(message)
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

describe('prompt 5.1.1 measured against the captured v4.0.0 baseline', () => {
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
      promptVersion: PROMPT_VERSION,
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

describe('the Goal/Focus recovery against the prompt it inherited', () => {
  // REQ-012. The recovery restores an explicit Goal and Focus to the request; it
  // is not allowed to pay for that in prompt. The REQUEST block already states
  // both, so the only honest size for the recovery's fixture prompt is the size
  // it had before the recovery began.
  //
  // The baseline is the fixture's `totalBytes` at prompt 5.1.0, measured on
  // `main` before any recovery change to `prompt.ts`. The tolerance is 256 bytes
  // — about 2% of the fixture, and roughly three lines of prompt prose. That
  // is room to reword a line or rename a REQUEST field without touching this
  // number, and not room for a new section, a second statement of Goal or Focus,
  // or a paragraph of instruction: the smallest of those costs more than it.
  const PRE_RECOVERY_TOTAL_BYTES = 12_340
  const RECOVERY_TOLERANCE_BYTES = 256

  const assembled = assemblePrompt(promptInput())
  const userLines = assembled.user.split('\n')

  it.each([undefined, 'confident'] as const)('does not materially grow the fixture prompt with experience %s', (experience) => {
    const measured = assemblePrompt(promptInput({ experience })).measurement
    expect(measured.totalBytes).toBeLessThanOrEqual(
      PRE_RECOVERY_TOTAL_BYTES + RECOVERY_TOLERANCE_BYTES,
    )
  })

  it('states the goal and the focus once each, in the user message', () => {
    expect(userLines.filter((line) => /^\s*goal:/.test(line))).toEqual(['goal: strength'])
    expect(userLines.filter((line) => /^\s*focus:/.test(line))).toEqual(['focus: lower_body'])
    // Once as a line is not enough if the value is restated in prose elsewhere.
    // `recent_focuses` is history, not the request, and is the one other place
    // a focus value may legitimately appear.
    const restated = userLines.filter(
      (line) => line.includes('lower_body') && !line.startsWith('recent_focuses:'),
    )
    expect(restated).toEqual(['focus: lower_body'])
  })

  it('keeps the request’s goal and focus out of the system prompt', () => {
    // GOAL SHAPES describes every goal, so a goal's name is in the system prompt
    // as vocabulary. What must not be there is the request: no `goal:` or
    // `focus:` line, no focus value at all, and nothing that changes when the
    // request does.
    expect(assembled.system).not.toMatch(/^\s*(goal|focus):/m)
    for (const focus of SESSION_FOCUSES) expect(assembled.system).not.toContain(focus)

    const other = assemblePrompt(
      promptInput({
        request: resolveEffectiveRequest({
          requestId: 'req_abc123_def456',
          goal: 'hypertrophy',
          focus: 'upper_body',
          requestedIntensity: 8,
          durationTargetMins: 45,
          enabledSections: ['warmup', 'primary_lift', 'accessory', 'core', 'cooldown'],
        }),
      }),
    )

    expect(other.system).toBe(assembled.system)
    expect(other.user).toContain('goal: hypertrophy\nfocus: upper_body')
  })
})

describe('what Focus does to the candidates that can reach the model', () => {
  // REQ-013. Focus is not a word in the prompt that the model is asked to
  // honour; it is a predicate applied before the prompt exists. These run the
  // retrieval — the migration's rules, transcribed in src/test/candidates-double
  // — over the committed seed for the same user, location and sections, changing
  // only the focus, and compare what comes back.
  const URL_ = 'https://project.supabase.co'
  const ANON_KEY = 'anon-key'
  const TOKEN = 'user-token'
  const USER = 'user-1'

  const client = createCandidatesClient({
    url: URL_,
    anonKey: ANON_KEY,
    accessToken: TOKEN,
    fetch: createCandidatesDouble({
      url: URL_,
      anonKey: ANON_KEY,
      users: { [TOKEN]: USER },
      profiles: {
        [USER]: {
          goalPreset: 'strength',
          enabledSections: ['warmup', 'primary_lift', 'accessory', 'core', 'cooldown'],
          locations: [
            {
              id: 'location-home',
              isDefault: true,
              equipment: ['bodyweight', 'barbell', 'dumbbells', 'kettlebells', 'pullup_bar'],
            },
          ],
        },
      },
    }).fetch,
  })

  /** The primaries one focus admits, from a section the floor did not widen. */
  const primaries = async (focus: SessionFocus): Promise<Candidate[]> => {
    const result = await client.retrieve({ userId: USER, focus })
    if (!result.ok) throw new Error(`retrieval failed: ${result.error.code}`)

    const section = result.value.find((candidate) => candidate.section === 'primary_lift')
    if (!section) throw new Error(`${focus} resolved no primary_lift section`)
    // A relaxed section has dropped the focus predicate, and would prove nothing.
    expect(section.relaxed).toBe(false)

    return section.candidates.filter((candidate) => candidate.canBePrimary)
  }

  const ids = (candidates: readonly Candidate[]) =>
    candidates.map((candidate) => candidate.exerciseId)

  it('admits different primaries for lower_body and upper_body', async () => {
    const lower = ids(await primaries('lower_body'))
    const upper = ids(await primaries('upper_body'))

    expect(lower).not.toEqual(upper)
    // Each side has primaries the other never sees, and they are most of it.
    const lowerOnly = lower.filter((id) => !upper.includes(id))
    const upperOnly = upper.filter((id) => !lower.includes(id))
    const shared = lower.filter((id) => upper.includes(id))

    expect(lowerOnly.length).toBeGreaterThan(shared.length)
    expect(upperOnly.length).toBeGreaterThan(shared.length)
  })

  it('excludes from each what the other admits', async () => {
    const lower = await primaries('lower_body')
    const upper = await primaries('upper_body')

    // Named rather than counted: the lifts a reader would expect to see move.
    expect(ids(lower)).toContain('back-squat')
    expect(ids(upper)).not.toContain('back-squat')
    expect(ids(upper)).toContain('bench-press')
    expect(ids(lower)).not.toContain('bench-press')
  })

  it('admits a primary only for a pattern its focus maps to', async () => {
    const lower = await primaries('lower_body')
    const upper = await primaries('upper_body')
    const admittedBy = (focus: SessionFocus) => (candidate: Candidate) =>
      candidate.patterns.some((pattern) => FOCUS_PATTERNS[focus].includes(pattern))

    expect(lower.every(admittedBy('lower_body'))).toBe(true)
    expect(upper.every(admittedBy('upper_body'))).toBe(true)

    // The overlap is not a leak. A lift both focuses admit is one the catalog
    // gives a pattern from each — a barbell row is a pull held in a hinge — and
    // an upper-body-only primary never reaches a lower_body request, or back.
    const upperIds = ids(upper)
    const lowerIds = ids(lower)

    for (const candidate of lower) {
      expect(upperIds.includes(candidate.exerciseId)).toBe(admittedBy('upper_body')(candidate))
    }
    for (const candidate of upper) {
      expect(lowerIds.includes(candidate.exerciseId)).toBe(admittedBy('lower_body')(candidate))
    }
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
