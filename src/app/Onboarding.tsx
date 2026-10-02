/**
 * Onboarding — `/onboarding` (ONB-01).
 *
 * IA.md §4: atmosphere `full`, guard `authed + not onboarded`, in from the
 * first verified login, out to `/` on the atomic commit. Composition is
 * 0.9.7's direct Form Screen — the shell and its atmosphere are `RootLayout`'s,
 * the header is `Screen`'s single `<h1>`, the question is direct content, and
 * navigation is in the measured pinned footer. The confirmation alone is a
 * framed list because it is a related collection rather than an input panel.
 *
 * Everything about the wizard as data is `state/onboarding.ts`: the five steps,
 * the vocabularies, the reducer and `toAnswers`. This file renders that and owns
 * three things only:
 *
 *   1. **Which step is showing.** A separate index beside the draft, never
 *      inside it, so stepping back cannot discard an answer by construction.
 *   2. **The commit.** One call to `completeOnboarding` with `toAnswers(draft)`
 *      — never a payload assembled here. `complete_onboarding` is one
 *      transaction, so a failure leaves nothing behind and the retry re-sends
 *      the same draft.
 *   3. **The hand-off.** The rows the commit answers with seed the profile and
 *      locations queries before Home is asked for, so the guard reads an
 *      onboarded profile and Generate's defaults are the answers just given.
 *
 * States (IA.md §4): committing (loading), commit failed (error, draft kept,
 * retry), populated (the step). Empty is n/a — a wizard with no answers yet is
 * still a question. A commit the database refuses as unable to generate
 * (REQ-011) is neither a failure nor a new state: it is the confirm step with
 * the step's own validation line saying which answer to change.
 */
import { useReducer, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Button,
  Checkbox,
  ChevronLeft,
  ChevronRight,
  ChoiceGroup,
  Input,
  Progress,
} from '../design-system/index'
import { viabilityFailuresOf } from '../data/viability'
import { useAuth } from '../state/auth-context'
import type { AppError } from '../state/errors'
import {
  blockedReason,
  EMPTY_DRAFT,
  EQUIPMENT,
  EXPERIENCE_LEVELS,
  GOALS,
  labelOf,
  locationName,
  MOVEMENT_PATTERNS,
  ONBOARDING_STEPS,
  onboardingReducer,
  SECTIONS,
  STEP_TITLES,
  stepNumber,
  TIERS,
  toAnswers,
  type OnboardingAction,
  type OnboardingDraft,
  type OnboardingStep,
  type Option,
} from '../state/onboarding'
import { useQueryClient } from '../state/query'
import type { Location } from '../state/schemas'
import { locationsQueryKey, profileQueryKey, useUserData } from '../state/user-queries'
import { CheckboxGroup } from '../ui/checkbox-group'
import { ActionRow, ListFrame, ListRow, PhoneFooter } from '../ui/composition'
import { Heading } from '../ui/Heading'
import { ErrorView, LoadingView } from '../ui/view-state'
import { AUTHENTICATED_HOME } from './guards'
import { Screen } from './Screen'

export const ONBOARDING_TITLE = 'Set up CLEAR'
export const COMMITTING_LABEL = 'Saving your setup'
export const COMMIT_FAILED_TITLE = 'Your setup didn’t save'
/** Plain language for the one fact a failed commit guarantees. */
export const COMMIT_FAILED_MESSAGE =
  'Nothing was stored, and your answers are still here. Try again when you’re ready.'

type Commit =
  | { readonly status: 'idle' }
  | { readonly status: 'committing' }
  | { readonly status: 'failed'; readonly error: AppError }
  /**
   * REQ-011: the commit evaluated the answers and refused them. Not a failure
   * to retry — the same draft is refused again — so it carries the draft it
   * was about, and stops being shown the moment that draft is edited.
   */
  | { readonly status: 'refused'; readonly message: string; readonly draft: OnboardingDraft }

type Direction = 'forward' | 'back'

export function Onboarding() {
  const { user } = useAuth()
  const userData = useUserData()
  const cache = useQueryClient()
  const navigate = useNavigate()

  const [draft, dispatch] = useReducer(onboardingReducer, EMPTY_DRAFT)
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState<Direction>('forward')
  const [commit, setCommit] = useState<Commit>({ status: 'idle' })

  const step = ONBOARDING_STEPS[index] ?? 'confirm'
  const blocked = blockedReason(step, draft)
  const answers = toAnswers(draft)
  // The reducer answers the same object for an edit that changes nothing, so
  // identity is exactly "these are still the answers that were refused".
  const refusal = commit.status === 'refused' && commit.draft === draft ? commit.message : null

  function go(to: number, towards: Direction) {
    setDirection(towards)
    setIndex(Math.min(Math.max(to, 0), ONBOARDING_STEPS.length - 1))
  }

  async function submit() {
    if (answers === null || user === null) return

    setCommit({ status: 'committing' })
    const committed = await userData.completeOnboarding(answers)

    if (!committed.ok) {
      setCommit(
        viabilityFailuresOf(committed.error).length > 0
          ? { status: 'refused', message: committed.error.message, draft }
          : { status: 'failed', error: committed.error },
      )
      return
    }

    // Seeded before navigating: the guard on `/` reads this profile, and a
    // stale not-onboarded one would send the user straight back here.
    const locationsKey = locationsQueryKey(user.id)
    const known = cache.getState<Location[]>(locationsKey)
    const others =
      known.status === 'ready'
        ? known.data.filter((location) => location.id !== committed.value.location.id)
        : []
    cache.setData(locationsKey, [committed.value.location, ...others])
    cache.setData(profileQueryKey(user.id), committed.value.profile)

    void navigate(AUTHENTICATED_HOME, { replace: true })
  }

  if (commit.status === 'committing') {
    return (
      <Screen title={ONBOARDING_TITLE}>
        <LoadingView label={COMMITTING_LABEL} />
      </Screen>
    )
  }

  return (
    <Screen
      title={ONBOARDING_TITLE}
      pinnedFoot={
        <PhoneFooter>
          <ActionRow>
            {step === 'confirm' ? (
              <Button
                disabled={answers === null}
                onClick={() => {
                  void submit()
                }}
              >
                {commit.status === 'failed' ? 'Try again' : 'Finish setup'}
              </Button>
            ) : (
              <Button
                disabled={blocked !== null}
                icon={<ChevronRight size={20} />}
                onClick={() => {
                  go(index + 1, 'forward')
                }}
              >
                {step === 'limitations' && draft.avoidPatterns.length === 0 ? 'Skip' : 'Next'}
              </Button>
            )}
            {index > 0 && (
              <Button
                variant="secondary"
                icon={<ChevronLeft size={20} />}
                onClick={() => {
                  go(index - 1, 'back')
                }}
              >
                Back
              </Button>
            )}
          </ActionRow>
        </PhoneFooter>
      }
    >
      <div className="clr-stack">
        <Progress
          value={stepNumber(step)}
          max={ONBOARDING_STEPS.length}
          segments={ONBOARDING_STEPS.length}
          label={`Step ${stepNumber(step)} of ${ONBOARDING_STEPS.length}`}
        />

        {commit.status === 'failed' && step === 'confirm' && (
          <>
            <ErrorView
              error={commit.error}
              title={COMMIT_FAILED_TITLE}
            />
            <p>{COMMIT_FAILED_MESSAGE}</p>
          </>
        )}

        <div
          // Keyed so each step enters on its own; never a full-screen replay.
          key={step}
          className={direction === 'forward' ? 'route-enter-forward' : 'route-enter-back'}
        >
          <div className="clr-stack">
            <Heading>{STEP_TITLES[step]}</Heading>
            <StepView step={step} draft={draft} dispatch={dispatch} />
            {blocked !== null && <p style={{ margin: 0 }}>{blocked}</p>}
            {refusal !== null && step === 'confirm' && (
              <p role="alert" style={{ margin: 0 }}>
                {refusal}
              </p>
            )}
          </div>
        </div>
      </div>
    </Screen>
  )
}

interface StepProps {
  readonly step: OnboardingStep
  readonly draft: OnboardingDraft
  readonly dispatch: (action: OnboardingAction) => void
}

function StepView({ step, draft, dispatch }: StepProps) {
  switch (step) {
    case 'location':
      return (
        <>
          <ChoiceGroup
            legend="Setup"
            name="tier"
            options={choices(TIERS)}
            value={draft.tier ?? undefined}
            onChange={(next) => {
              const tier = TIERS.find((option) => option.value === single(next))
              if (tier) dispatch({ type: 'tier', value: tier.value })
            }}
          />
          {draft.tier !== null && (
            <CheckboxGroup legend="Equipment">
              {EQUIPMENT.map((item) => (
                <Checkbox
                  key={item.value}
                  label={item.label}
                  checked={draft.equipment.includes(item.value)}
                  onChange={() => {
                    dispatch({ type: 'equipment', value: item.value })
                  }}
                />
              ))}
            </CheckboxGroup>
          )}
        </>
      )
    case 'experience':
      return (
        <ChoiceGroup
          legend="Experience"
          name="experience"
          options={choices(EXPERIENCE_LEVELS)}
          value={draft.experience ?? undefined}
          onChange={(next) => {
            const level = EXPERIENCE_LEVELS.find((option) => option.value === single(next))
            if (level) dispatch({ type: 'experience', value: level.value })
          }}
        />
      )
    case 'goals':
      return (
        <>
          <ChoiceGroup
            legend="Goal"
            name="goal"
            options={choices(GOALS)}
            value={draft.goal ?? undefined}
            onChange={(next) => {
              const goal = GOALS.find((option) => option.value === single(next))
              if (goal) dispatch({ type: 'goal', value: goal.value })
            }}
          />
          {draft.goal !== null && (
            <CheckboxGroup legend="Sections">
              {SECTIONS.map((section) => (
                <Checkbox
                  key={section.value}
                  label={section.label}
                  checked={draft.sections.includes(section.value)}
                  onChange={() => {
                    dispatch({ type: 'section', value: section.value })
                  }}
                />
              ))}
            </CheckboxGroup>
          )}
        </>
      )
    case 'limitations':
      return (
        <>
          <CheckboxGroup legend="Work around">
            {MOVEMENT_PATTERNS.map((pattern) => (
              <Checkbox
                key={pattern.value}
                label={pattern.label}
                checked={draft.avoidPatterns.includes(pattern.value)}
                onChange={() => {
                  dispatch({ type: 'pattern', value: pattern.value })
                }}
              />
            ))}
          </CheckboxGroup>
          <Input
            label="Note · optional"
            name="limitations_note"
            multiline
            rows={3}
            value={draft.note}
            onChange={(value) => {
              dispatch({ type: 'note', value })
            }}
            placeholder="Left shoulder — nothing overhead for a few weeks."
          />
        </>
      )
    case 'confirm':
      return <Summary draft={draft} />
  }
}

/** What will be stored, read back once before it is. */
function Summary({ draft }: { draft: OnboardingDraft }) {
  const rows: [string, string][] = [
    ['Setup', draft.tier === null ? 'Not chosen' : locationName(draft.tier)],
    ['Equipment', listOf(EQUIPMENT, draft.equipment)],
    ['Experience', draft.experience === null ? 'Not chosen' : labelOf(EXPERIENCE_LEVELS, draft.experience)],
    ['Goal', draft.goal === null ? 'Not chosen' : labelOf(GOALS, draft.goal)],
    ['Sections', listOf(SECTIONS, draft.sections)],
    ['Work around', listOf(MOVEMENT_PATTERNS, draft.avoidPatterns)],
  ]

  return (
    <ListFrame as="dl">
      {rows.map(([term, value]) => (
        <ListRow key={term}>
          <dt className="label">{term}</dt>
          <dd>{value}</dd>
        </ListRow>
      ))}
    </ListFrame>
  )
}

function listOf<T extends string>(options: readonly Option<T>[], chosen: readonly T[]): string {
  return chosen.length === 0
    ? 'None'
    : chosen.map((value) => labelOf(options, value)).join(', ')
}

function choices<T extends string>(options: readonly Option<T>[]) {
  return options.map((option) => ({ value: option.value, label: option.label }))
}

/** ChoiceGroup answers a single choice as a string; `multiple` is not used here. */
function single(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? '') : value
}
