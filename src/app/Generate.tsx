/**
 * Generate — `/generate` (GEN-04).
 *
 * IA.md §4: atmosphere `quiet`, protected, in from Home, out to Loading →
 * Review. Composition is the export's Form Screen template — a stack inside the
 * shell, a label plus a wrapping row of chips per selector, the
 * `IntensitySlider`, the inputs, and one full-width primary action at the
 * bottom — rendered through `Card`, which is how every other CLEAR screen wears
 * that template.
 *
 * The form itself is `state/generation-form.ts`: this file renders a draft and
 * the four edits that can be made to it, and decides nothing about them. Two
 * properties are the requirement rather than decoration:
 *
 *   1. **The CTA is disabled until goal and anchor are both chosen.** Nothing
 *      else disables it. A blank time target or a missing place refuses at
 *      submit with a sentence on the field, because a button that is disabled
 *      for an unexplained reason has told the user nothing.
 *   2. **Nothing is sent that CORE-03 has not parsed.** `requestFrom` is the
 *      only path to `generate`, and a refusal renders on the field the schema
 *      named instead. The screen cannot send a payload the function would have
 *      to reject, and `Generate.test.tsx` holds it to that.
 *   3. **A prefill fills in the anchor and the intensity, and says so.** HOME-03
 *      opens this screen with its suggestion in the query string; `prefillFrom`
 *      parses it, `initialDraft` seeds the draft with it, and a notice states
 *      that two fields were not chosen here. The goal is still unset, so a
 *      prefilled form is still one answer short of generating — the suggestion
 *      is read off history, and history does not know what today is for.
 *
 * Pressing Generate hands the screen to the shared Loading host (REQ-004): the
 * Loading screen is the screen for the whole run, success lands on Review with
 * the validated workout, and cancelling puts this form back. What the user
 * composed is held above the host — the Loading screen replaces the form's
 * components, and cancelling must not replace the user's answers with defaults.
 *
 * The goal the user picks is part of the wire contract. It scopes candidate
 * retrieval as well as the client-side cascade, so the workout cannot be
 * composed for a stale profile default after the user chose something else.
 */
import { useEffect, useId, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import {
  AppHeader,
  ArrowLeft,
  Button,
  Chip,
  ClearLogo,
  EmptyState,
  FormField,
  Input,
  IntensitySlider,
} from '../design-system/index'
import {
  clampedIntensity,
  confirmsHardIntensity,
  type DeloadSuggestion,
} from '../state/deload'
import { useDeloadBanner } from '../state/deload-queries'
import { generateRequestId, isErr } from '../state/errors'
import { useGeneration, type GenerationMutation } from '../state/generation'
import {
  ANCHORS,
  anchorAllowed,
  canGenerate,
  GENERATE_PATH,
  GENERATION_GOALS,
  initialDraft,
  inputFrom,
  intensityRange,
  NOTES_MAX_LENGTH,
  POWER_REFUSAL,
  prefillFrom,
  refusalFrom,
  requestFrom,
  resolveGeneration,
  withAnchor,
  withDuration,
  withIntensity,
  withLocation,
  withNotes,
  withRecovery,
  type DraftRefusal,
  type GenerationContext,
  type GenerationDraft,
  type GenerationPrefill,
} from '../state/generation-form'
import type { Location } from '../state/schemas'
import { reviewHandoff } from '../state/review-handoff'
import { localDayIn } from '../state/streak'
import { useLocationsQuery } from '../state/user-queries'
import {
  viewError,
  viewEmpty,
  viewLoading,
  viewReady,
  type ViewState,
} from '../state/view-state'
import { AppDialog } from '../ui/app-dialog'
import { Card } from '../ui/card'
import { DeloadBanner } from '../ui/deload-banner'
import { Select } from '../ui/select'
import { ViewStateSwitch } from '../ui/view-state'
import { GenerationLoadingHost } from './GenerationLoadingHost'
import { Screen } from './Screen'

/** What the form needs before it can be filled in: the places and their default. */
type Places = readonly Location[]

/**
 * What the user has composed, and what they agreed to while composing it.
 *
 * The deload answer travels with the draft because it is part of the request:
 * a draft clamped by an applied deload, handed back without the directive,
 * would send a light number with nothing saying why.
 */
interface Composition {
  readonly draft: GenerationDraft
  /** The goal chip chosen on this screen, standing in for the profile's Goal. */
  readonly goal: GoalPreset | null
  readonly applied: DeloadSuggestion | null
  readonly overridden: boolean
}

type GoalPreset = (typeof GENERATION_GOALS)[number]['value']

/**
 * What `resolveGeneration` is told while this screen still asks the Goal
 * itself: the chosen chip as the standing Goal, and no history, so the anchor
 * stays the user's to choose. Recovery is the draft's one-workout mode rather
 * than a standing Goal, so its chip resolves over a stand-in that is never sent.
 */
function contextFrom(goal: GoalPreset | null): GenerationContext {
  return {
    goalPreset: goal === 'active_recovery' ? 'balanced' : goal,
    history: { status: 'no-completed-history' },
  }
}

/** Said once, where a suggestion filled the anchor and the intensity in. */
export const PREFILL_NOTICE =
  'Prefilled from today’s suggestion. Change anything before you generate.'

export function Generate() {
  const navigate = useNavigate()
  const locations = useLocationsQuery()
  const [params] = useSearchParams()

  // HOME-03's hand-off, and the only thing this screen takes from outside: the
  // suggested anchor and intensity, parsed rather than trusted. A URL with no
  // usable prefill — including the plain `/generate` the Generate button opens
  // after the suggestion was dismissed — is a screen on its defaults.
  const prefill = prefillFrom(params)

  // The run and the composition both live above the host: the Loading screen
  // replaces everything below it, and the form it hands back on cancel is the
  // one the user left. Null is "untouched" — the form's own defaults.
  const generation = useGeneration()
  const [composition, setComposition] = useState<Composition | null>(null)

  // The hand-off. The mutation's success state is the only place the validated
  // workout exists, and Review is the route the IA sends it to.
  useEffect(() => {
    if (generation.state.status !== 'success') return
    void navigate('/review', {
      state: reviewHandoff(generation.state.acceptance),
    })
  }, [generation.state, navigate])

  // The places are the screen's data, and the profile deliberately is not: the
  // goal has no default to read from it (§2.1), the guard already answers
  // whether this account finished onboarding, and a query nothing renders would
  // be a loading state with no reason to exist. The empty case here is real
  // rather than theoretical — a user with no place has nothing to send as
  // `location_id`, so this screen sends them to the one that fixes it.
  const state: ViewState<Places> =
    locations.state.status === 'loading'
      ? viewLoading()
      : locations.state.status === 'error'
        ? viewError(locations.state.error)
        : locations.state.data.length === 0
          ? viewEmpty()
          : viewReady(locations.state.data)

  // GEN-05's screen has no route of its own: while a run this screen started is
  // in flight — or has failed and is being answered — the shared host makes it
  // the screen, and cancelling puts the form back where the user left it.
  return (
    <GenerationLoadingHost generation={generation} cancelTo={GENERATE_PATH}>
      <AppHeader
        actions={
          <Button
            variant="quiet"
            icon={<ArrowLeft size={20} />}
            onClick={() => void navigate('/')}
          >
            Home
          </Button>
        }
      >
        <ClearLogo size="md" />
      </AppHeader>
      <Screen title="Generate workout">
        <ViewStateSwitch
          state={state}
          loadingLabel="Reading your places"
          errorTitle="Your places didn’t load"
          onRetry={locations.refetch}
          empty={
            <EmptyState
              title="No places yet"
              message="Generation composes from the equipment at a place you train, so add one first."
              actionLabel="Add a place"
              onAction={() => void navigate('/settings/locations')}
            />
          }
        >
          {(places) => (
            <GenerateForm
              places={places}
              prefill={prefill}
              generation={generation}
              composition={composition}
              onCompose={setComposition}
            />
          )}
        </ViewStateSwitch>
      </Screen>
    </GenerationLoadingHost>
  )
}

function GenerateForm({
  places,
  prefill,
  generation,
  composition,
  onCompose,
}: {
  places: Places
  prefill: GenerationPrefill | null
  generation: GenerationMutation
  composition: Composition | null
  onCompose: (update: (previous: Composition | null) => Composition) => void
}) {
  const untouched = (): Composition => ({
    draft: initialDraft(defaultLocationId(places), prefill),
    goal: null,
    applied: null,
    overridden: false,
  })
  const { draft, goal: chosen, applied, overridden } = composition ?? untouched()
  const context = contextFrom(chosen)
  const resolved = resolveGeneration(draft, context)

  /** One edit to what the user composed, laid over whatever is already held. */
  function compose(change: Partial<Composition>) {
    onCompose((previous) => ({ ...(previous ?? untouched()), ...change }))
  }
  function setDraft(next: GenerationDraft) {
    compose({ draft: next })
  }

  const [refusal, setRefusal] = useState<DraftRefusal | null>(null)

  // OVR-04. The user's own day draws the boundary every trigger is counted in,
  // so the zone is read once here rather than inside a rule (SES-01c's rule).
  const today = useMemo(
    () => localDayIn(Intl.DateTimeFormat().resolvedOptions().timeZone)(new Date()),
    [],
  )
  const deload = useDeloadBanner(today)
  /*
   * `applied` is the suggestion the user applied, held in the composition
   * rather than read back from `deload`: recording an applied deload is what
   * *suppresses* the suggestion (§4's window starts the moment it is accepted),
   * so the hook rightly stops offering one and this screen would otherwise
   * forget, mid-compose, what the user just agreed to. Null is "not applied",
   * and it is also what Apply sends.
   */
  const [confirming, setConfirming] = useState<number | null>(null)

  // What the banner states, and what makes today a flagged day: an applied
  // deload is still the reason this session is light.
  const suggestion = applied ?? deload.suggestion

  const intensityHint = useId()
  const range = intensityRange(resolved.goal)
  const intensity = resolved.intensity ?? draft.intensity ?? range.start
  const chosenGoal = GENERATION_GOALS.find((goal) => goal.value === resolved.goal)

  /**
   * §4's Apply: the intensity is clamped and the directive rides on the request.
   * Nothing else changes, and nothing changed before the user pressed it — the
   * requirement's first sentence is that this is never automatic.
   */
  function applyDeload() {
    if (deload.suggestion === null) return
    compose({
      applied: deload.suggestion,
      draft: withIntensity(draft, clampedIntensity(intensity)),
    })
    deload.answer('applied')
  }

  /**
   * §4: a hard intensity on a flagged day confirms **once**, then does what was
   * asked. `overridden` is what makes it once: the user has answered, and an app
   * that asked again at submit would be arguing rather than confirming.
   */
  function chooseIntensity(value: number) {
    if (!overridden && confirmsHardIntensity(value, suggestion !== null)) {
      setConfirming(value)
      return
    }
    setDraft(withIntensity(draft, value))
  }

  function submit() {
    const request = requestFrom(
      draft,
      context,
      generateRequestId(),
      applied !== null,
      today,
    )

    // The one path to the client, and it is a total function: a refused draft
    // becomes sentences on the fields that caused it and nothing is sent.
    if (isErr(request)) {
      setRefusal(refusalFrom(request.error))
      return
    }

    // The host takes the screen from here. A second press cannot reach a form
    // that is no longer rendered, and GEN-03's in-flight guard refuses one
    // landing in the same tick.
    setRefusal(null)
    generation.generate(inputFrom(request.value))
  }

  return (
    <Card>
      <div className="clr-stack">
        {refusal !== null && (
          <p role="alert" style={{ color: 'var(--text-negative)' }}>
            {refusal.message}
          </p>
        )}

        {/* HOME-03: a prefilled form says so. A field filled in by something
            other than the user, silently, is a field they did not choose. */}
        {prefill !== null && (
          <p role="status" style={{ margin: 0 }}>
            {PREFILL_NOTICE}
          </p>
        )}

        {/* Goal — first on the page, and with no default (v3 delta §2.1) */}
        <FormField
          label="Goal"
          required
          helperText={chosenGoal?.description ?? 'What is today for? It sets the intensity range.'}
        >
          <div className="clr-row" role="group" aria-label="Goal" style={CHIP_ROW}>
            {GENERATION_GOALS.map((goal) => (
              <Chip
                key={goal.value}
                selected={resolved.goal === goal.value}
                onClick={() =>
                  compose({
                    goal: goal.value,
                    draft: withRecovery(draft, goal.value === 'active_recovery'),
                  })
                }
              >
                {goal.label}
              </Chip>
            ))}
          </div>
        </FormField>

        {/* Anchor — §2.3: Recovery offers no Power, and says why */}
        <FormField
          label="Anchor"
          required
          helperText={resolved.goal === 'active_recovery' ? POWER_REFUSAL : undefined}
          errorText={refusal?.fields.focus}
        >
          <div className="clr-row" role="group" aria-label="Anchor" style={CHIP_ROW}>
            {ANCHORS.map((anchor) => (
              <Chip
                key={anchor.value}
                selected={draft.anchor === anchor.value}
                disabled={!anchorAllowed(resolved.goal, anchor.value)}
                onClick={() => setDraft(withAnchor(draft, anchor.value))}
              >
                {anchor.label}
              </Chip>
            ))}
          </div>
        </FormField>

        {/* Deload — above the intensity selector (IA §4), and only when §4 fired */}
        {suggestion !== null && (
          <DeloadBanner
            suggestion={suggestion}
            applied={applied !== null}
            onApply={applyDeload}
            onDismiss={() => deload.answer('dismissed')}
          />
        )}

        {/* Intensity — the range is the goal's, and the readout says so */}
        <div className="clr-stack clr-stack--tight">
          <IntensitySlider
            label="Intensity"
            min={range.min}
            max={range.max}
            step={1}
            value={intensity}
            disabled={resolved.goal === null}
            valueText={`${intensity} of ${range.max}`}
            aria-describedby={intensityHint}
            onChange={chooseIntensity}
          />
          <p id={intensityHint}>
            {resolved.goal === null
              ? 'Choose a goal first — it sets the range.'
              : `${chosenGoal?.label} runs ${range.min} to ${range.max}.`}
          </p>
        </div>

        <Select
          label="Place"
          value={draft.locationId ?? ''}
          options={places.map((location) => ({
            value: location.id,
            label: location.name,
          }))}
          helperText="Generation composes from the equipment saved with this place."
          errorText={refusal?.fields.location_id}
          onChange={(value) => setDraft(withLocation(draft, value))}
        />

        <Input
          label="Time available"
          type="number"
          inputMode="numeric"
          min={1}
          value={draft.durationMins}
          helperText="Minutes."
          errorText={refusal?.fields.requested_duration_mins}
          onChange={(value) => setDraft(withDuration(draft, value))}
        />

        <Input
          label="Notes"
          multiline
          rows={3}
          value={draft.notes}
          placeholder="Bad left shoulder from years ago. Overhead press feels sketchy sometimes."
          helperText="Optional. Context for today — something to work around every session belongs in Settings."
          errorText={refusal?.fields.notes}
          maxLength={NOTES_MAX_LENGTH}
          onChange={(value) => setDraft(withNotes(draft, value))}
        />

        <Button
          variant="primary"
          size="lg"
          style={{ width: '100%' }}
          disabled={!canGenerate(draft, context)}
          onClick={submit}
        >
          Generate workout
        </Button>
      </div>

      {/* §4: confirm once, then honour it. The user knows things the app doesn't. */}
      <AppDialog
        open={confirming !== null}
        title="Train hard today?"
        onClose={() => setConfirming(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Keep it easier
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const value = confirming
                setConfirming(null)
                // Going hard withdraws the deload rather than sending a light
                // session at a heavy number, and §4's answer to it is to log
                // the override and stop asking — not to keep making the case.
                compose({
                  overridden: true,
                  applied: null,
                  ...(value !== null && { draft: withIntensity(draft, value) }),
                })
                deload.answer('dismissed')
              }}
            >
              Go hard anyway
            </Button>
          </>
        }
      >
        <p>
          {suggestion?.reason} Intensity {confirming} is a hard session on a day the app
          flagged. You know things it doesn’t — this is the only time it asks.
        </p>
      </AppDialog>
    </Card>
  )
}

/** The chip rows wrap on a phone: five goals never fit one line (§2.1). */
const CHIP_ROW = { flexWrap: 'wrap', gap: 'var(--spacing-100)' } as const

/** The profile's default place, or the first one — never nothing when one exists. */
function defaultLocationId(locations: readonly Location[]): string | null {
  const preferred = locations.find((location) => location.is_default) ?? locations[0]
  return preferred?.id ?? null
}
