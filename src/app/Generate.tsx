/**
 * Generate — `/generate` (GEN-04).
 *
 * IA.md §4: atmosphere `quiet`, protected, in from Home, out to Loading →
 * Review. Composition is the export's Form Screen template — a stack inside the
 * shell, the standing Goal as context, the Focus — recommended, or a label plus
 * a wrapping row of chips to choose one — the `IntensitySlider`, the inputs,
 * and one full-width primary action at the bottom — rendered through `Card`, which is how every other
 * CLEAR screen wears that template.
 *
 * The form itself is `state/generation-form.ts`: this file renders a draft and
 * the edits that can be made to it, and decides nothing about them. Four
 * properties are the requirement rather than decoration:
 *
 *   1. **The Goal is the profile's, and is not asked here.** The standing
 *      `goal_preset` is read, shown as context, and changed in Settings. While
 *      the profile is loading there is no form; when the read fails there is an
 *      error with Retry; and a missing or legacy `active_recovery` Goal is a
 *      correction state that routes to Settings. None of the three can send.
 *   2. **The CTA is disabled until there is a Focus.** Nothing else disables
 *      it, and the Focus area says why there is none. A blank time target or a
 *      missing place refuses at submit with a sentence on the field, because a
 *      button that is disabled for an unexplained reason has told the user
 *      nothing.
 *   3. **Nothing is sent that CORE-03 has not parsed.** `requestFrom` is the
 *      only path to `generate`, and a refusal renders on the field the schema
 *      named instead. The screen cannot send a payload the function would have
 *      to reject, and `Generate.test.tsx` holds it to that.
 *   4. **The Focus is history's to recommend, and the screen says only what is
 *      true.** History is read through the shared `useHistoryQuery` and handed
 *      to the shared eligibility rule on the client, before any request. A
 *      recommendation is shown with its reason and its intensity; with nothing
 *      completed, or nothing recent, the four choices are asked for with no
 *      claim about history; a read still in flight is a loading state; and a
 *      read that failed says so, offers Retry, and still lets a Focus be
 *      chosen. A bare Focus in the URL is not a choice the athlete made here,
 *      so the prefill seeds nothing.
 *   5. **What is decided for this workout only is said as that, and lives in
 *      the URL.** `Change focus` reveals the four choices beside a
 *      recommendation, and a chosen one is marked `this workout only` until it
 *      is dismissed; `Recovery session` makes this one draft a Recovery one,
 *      with Power refused in text. Both are the draft's explicit intent
 *      parameters, so a refresh restores them, and neither writes the profile.
 *
 * Pressing Generate hands the screen to the shared Loading host (REQ-004): the
 * Loading screen is the screen for the whole run, success lands on Review with
 * the validated workout, and cancelling puts this form back. What the user
 * composed is held above the host — the Loading screen replaces the form's
 * components, and cancelling must not replace the user's answers with defaults.
 *
 * The standing Goal is part of the wire contract. It scopes candidate retrieval
 * as well as the client-side cascade, and it is read from the loaded profile on
 * every visit, so a Goal changed in Settings is the Goal the next request sends.
 */
import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import {
  AlertCircle,
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
  intentFrom,
  NOTES_MAX_LENGTH,
  POWER_REFUSAL,
  refusalFrom,
  requestFrom,
  resolveGeneration,
  searchWithIntent,
  standingGoalFrom,
  withAnchor,
  withDuration,
  withIntensity,
  withLocation,
  withNotes,
  withOverride,
  withRecovery,
  type DraftRefusal,
  type FocusHistory,
  type GenerationContext,
  type GenerationDraft,
} from '../state/generation-form'
import { useHistoryQuery, type HistoryQuery } from '../state/history-queries'
import type { Location, Profile } from '../state/schemas'
import { reviewHandoff } from '../state/review-handoff'
import { suggestionEligibility } from '../state/session-suggestion'
import { localDayIn } from '../state/streak'
import { useLocationsQuery, useProfileQuery } from '../state/user-queries'
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
import { LoadingView, ViewStateSwitch } from '../ui/view-state'
import { GenerationLoadingHost } from './GenerationLoadingHost'
import { Screen } from './Screen'

type Places = readonly Location[]

/** What the form needs before it can be filled in: the standing Goal and the places. */
interface Loaded {
  /** The loaded profile's `goal_preset`, exactly as stored. */
  readonly goalPreset: GoalPreset | null
  readonly places: Places
}

/**
 * What the user has composed, and what they agreed to while composing it.
 *
 * The deload answer travels with the draft because it is part of the request:
 * a draft clamped by an applied deload, handed back without the directive,
 * would send a light number with nothing saying why.
 */
interface Composition {
  readonly draft: GenerationDraft
  readonly applied: DeloadSuggestion | null
  readonly overridden: boolean
}

type GoalPreset = NonNullable<Profile['goal_preset']>

/**
 * What the history read says about a Focus. The rows in hand go to the shared
 * eligibility rule — the one Home uses — and a failed read is `history-error`,
 * never the first-workout state. A read still in flight is `null`: there is no
 * answer yet, and the screen shows that rather than one of the others.
 */
function focusHistoryFrom(state: HistoryQuery['state']): FocusHistory | null {
  if (state.status === 'loading') return null
  if (state.status === 'error') return { status: 'history-error' }
  return suggestionEligibility(state.data.sessions)
}

/**
 * What `resolveGeneration` is told: the profile's standing Goal as stored, and
 * what history says. While history is unread there is nothing recommended, so
 * the resolver is told so — the Focus stays unresolved and nothing can send.
 */
function contextFrom(
  goalPreset: GoalPreset | null,
  history: FocusHistory | null,
): GenerationContext {
  return {
    goalPreset,
    history: history ?? { status: 'no-completed-history' },
  }
}

/** Where the standing Goal is set and changed. */
export const SETTINGS_ROUTE = '/settings'

/** The route out of the Goal context: the Goal is changed there, not here. */
export const CHANGE_GOAL_LABEL = 'Change in Settings'

/** The correction state, for a profile with no Goal and for a legacy one. */
export const GOAL_CORRECTION_TITLE = 'Set your goal in Settings'
export const MISSING_GOAL_MESSAGE =
  'Generation needs your goal, and none is set. Choose one in Settings first.'
export const LEGACY_GOAL_MESSAGE =
  'Active recovery is no longer a standing goal. Choose a goal in Settings first.'
export const GOAL_CORRECTION_ACTION = 'Open Settings'

/** The Focus area while the history read is in flight. */
export const HISTORY_LOADING_LABEL = 'Reading your history'

/** Why a Focus is asked for before anything has been completed (REQ-005). */
export const FIRST_WORKOUT_MESSAGE =
  'CLEAR needs a starting workout. Choose the focus for this one.'

/** Asked with no claim about history: stale history, or a choice already made. */
export const MANUAL_FOCUS_MESSAGE = 'Choose the focus for this workout.'

/** A failed history read is said as one, and does not block generation (REQ-006). */
export const HISTORY_ERROR_MESSAGE =
  'Your history could not be read. Retry, or choose the focus for this workout.'
export const HISTORY_RETRY_LABEL = 'Retry'

/** The deliberate way off a recommendation, and the way back to it (REQ-007). */
export const CHANGE_FOCUS_LABEL = 'Change focus'
export const OVERRIDE_GROUP_LABEL = 'Focus for this workout'
export const OVERRIDE_SCOPE = 'this workout only'
export const OVERRIDE_CANCEL_LABEL = 'Use the recommended focus'

/** The one-workout Recovery mode, and what it says while it is on (REQ-008). */
export const RECOVERY_LABEL = 'Recovery session'
export const RECOVERY_SCOPE = 'Recovery applies to this workout only.'

export function Generate() {
  const navigate = useNavigate()
  const profile = useProfileQuery()
  const locations = useLocationsQuery()

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

  // The profile is read first because the Goal is its: a form drawn before it
  // answered would be composing on a guessed Goal. The places follow, and their
  // empty case is real rather than theoretical — a user with no place has
  // nothing to send as `location_id`, so this screen sends them to the one that
  // fixes it.
  const profileSettled = profile.state.status === 'ready'
  const goalPreset =
    profile.state.status === 'ready' ? (profile.state.data?.goal_preset ?? null) : null
  const state: ViewState<Loaded> =
    profile.state.status === 'loading'
      ? viewLoading()
      : profile.state.status === 'error'
        ? viewError(profile.state.error)
        : locations.state.status === 'loading'
          ? viewLoading()
          : locations.state.status === 'error'
            ? viewError(locations.state.error)
            : locations.state.data.length === 0
              ? viewEmpty()
              : viewReady({ goalPreset, places: locations.state.data })

  // REQ-002: a profile with no Goal, or with the legacy `active_recovery`, has
  // nothing ordinary generation may send. It is said before the places are
  // read, because no place makes that profile able to generate.
  const needsSettings = profileSettled && standingGoalFrom(goalPreset) === null

  // REQ-009: cancel returns to the draft's own address — the override and
  // Recovery it was sent with, beside whatever else the query string carried —
  // so the form that comes back and a refresh of it resolve the same intent.
  const [searchParams] = useSearchParams()
  const draftSearch =
    composition === null
      ? searchParams.toString()
      : searchWithIntent(searchParams, composition.draft).toString()
  const cancelTo = draftSearch === '' ? GENERATE_PATH : `${GENERATE_PATH}?${draftSearch}`

  // GEN-05's screen has no route of its own: while a run this screen started is
  // in flight — or has failed and is being answered — the shared host makes it
  // the screen, and cancelling puts the form back where the user left it.
  return (
    <GenerationLoadingHost generation={generation} cancelTo={cancelTo}>
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
        {needsSettings ? (
          <EmptyState
            icon={<AlertCircle />}
            title={GOAL_CORRECTION_TITLE}
            message={goalPreset === null ? MISSING_GOAL_MESSAGE : LEGACY_GOAL_MESSAGE}
            actionLabel={GOAL_CORRECTION_ACTION}
            onAction={() => void navigate(SETTINGS_ROUTE)}
          />
        ) : (
          <ViewStateSwitch
            state={state}
            loadingLabel={profileSettled ? 'Reading your places' : 'Reading your profile'}
            errorTitle={
              profileSettled ? 'Your places didn’t load' : 'Your profile didn’t load'
            }
            onRetry={profileSettled ? locations.refetch : profile.refetch}
            empty={
              <EmptyState
                title="No places yet"
                message="Generation composes from the equipment at a place you train, so add one first."
                actionLabel="Add a place"
                onAction={() => void navigate('/settings/locations')}
              />
            }
          >
            {(loaded) => (
              <GenerateForm
                goalPreset={loaded.goalPreset}
                places={loaded.places}
                generation={generation}
                composition={composition}
                onCompose={setComposition}
              />
            )}
          </ViewStateSwitch>
        )}
      </Screen>
    </GenerationLoadingHost>
  )
}

function GenerateForm({
  goalPreset,
  places,
  generation,
  composition,
  onCompose,
}: {
  goalPreset: GoalPreset | null
  places: Places
  generation: GenerationMutation
  composition: Composition | null
  onCompose: (update: (previous: Composition | null) => Composition) => void
}) {
  // REQ-007/REQ-008: the one-workout intent is the URL's, so an untouched form
  // opens on whatever override or Recovery the address carries, and nothing
  // else in the query string — a bare Focus prefill least of all — seeds it.
  const [searchParams, setSearchParams] = useSearchParams()
  const untouched = (): Composition => ({
    draft: initialDraft(defaultLocationId(places), null, intentFrom(searchParams)),
    applied: null,
    overridden: false,
  })
  const { draft, applied, overridden } = composition ?? untouched()

  // REQ-004: the recommendation is derived here, from the shared history read,
  // before any request — no model decides the Goal or the Focus.
  const history = useHistoryQuery()
  const focusHistory = useMemo(() => focusHistoryFrom(history.state), [history.state])
  const context = contextFrom(goalPreset, focusHistory)
  const resolved = resolveGeneration(draft, context)

  // A Focus the athlete chose is theirs and is shown as chosen, whatever the
  // read is doing: a retry that succeeds does not take it back (REQ-006).
  const focusLoading = focusHistory === null && draft.anchor === null
  const recommended =
    resolved.status === 'ready' && resolved.focusSource === 'recommended' ? resolved : null
  // A Focus chosen over a recommendation history still makes. With no
  // recommendation the same choice is the manual one and carries no marker.
  const override =
    resolved.status === 'ready' && resolved.focusSource === 'override' ? resolved : null

  // The choices under `Change focus` open with an override in force — a
  // refreshed one included — and with Recovery, whose refused Power stays seen.
  const focusChoices = useId()
  const [changing, setChanging] = useState(draft.anchor !== null || draft.recovery)
  const expanded = changing || override !== null

  // The draft's intent is written where a refresh will find it. Replaced rather
  // than pushed: an edit to a draft is not a place to go back to.
  const intendedSearch = searchWithIntent(searchParams, draft).toString()
  const search = searchParams.toString()
  useEffect(() => {
    if (intendedSearch !== search) setSearchParams(intendedSearch, { replace: true })
  }, [intendedSearch, search, setSearchParams])

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
  const standingGoal = GENERATION_GOALS.find((goal) => goal.value === goalPreset)

  /** Dismissing the choices takes the override with them (REQ-007). */
  function toggleChanging() {
    if (expanded) setDraft(withOverride(draft, null))
    setChanging(!expanded)
  }

  /** The recommended Focus chosen again is the recommendation, not an override. */
  function chooseOverride(focus: GenerationDraft['anchor']) {
    const isRecommended =
      focusHistory?.status === 'recommended' && focusHistory.focus === focus
    setDraft(withOverride(draft, isRecommended ? null : focus))
  }

  /** §2.3: a Power choice is cleared, not substituted, so the choices are shown. */
  function toggleRecovery() {
    if (!draft.recovery) setChanging(true)
    setDraft(withRecovery(draft, !draft.recovery))
  }

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

        {/* Goal — the profile's standing one, as context. It is changed in
            Settings, never asked per workout (REQ-001). */}
        <div className="clr-stack clr-stack--tight">
          <p style={{ margin: 0 }}>
            Goal: <strong>{standingGoal?.label}</strong>
            {standingGoal?.description === undefined ? '' : ` — ${standingGoal.description}`}
          </p>
          <p style={{ margin: 0 }}>
            <Link to={SETTINGS_ROUTE}>{CHANGE_GOAL_LABEL}</Link>
          </p>
        </div>

        {/* Recovery — the secondary, one-workout mode. The standing Goal above
            is untouched by it, and Power's refusal is said in text (§2.3). */}
        <div className="clr-stack clr-stack--tight">
          <div className="clr-row" style={CHIP_ROW}>
            <Chip selected={draft.recovery} onClick={toggleRecovery}>
              {RECOVERY_LABEL}
            </Chip>
          </div>
          {draft.recovery && (
            <p style={{ margin: 0 }}>
              {RECOVERY_SCOPE} {POWER_REFUSAL}
            </p>
          )}
        </div>

        {/* Focus — recommended from history when history can, asked for when it
            cannot, and never drawn before the read has answered */}
        {focusLoading ? (
          <LoadingView label={HISTORY_LOADING_LABEL} />
        ) : recommended !== null || override !== null ? (
          <div className="clr-stack clr-stack--tight">
            <p style={{ margin: 0 }}>
              Focus:{' '}
              <strong>
                {ANCHORS.find((anchor) => anchor.value === resolved.focus)?.label}
              </strong>
              {override !== null && ` — ${OVERRIDE_SCOPE}`}
            </p>
            {recommended !== null && <p style={{ margin: 0 }}>{recommended.reason}</p>}
            <div className="clr-row" style={CHIP_ROW}>
              <Button
                variant="quiet"
                aria-expanded={expanded}
                aria-controls={expanded ? focusChoices : undefined}
                onClick={toggleChanging}
              >
                {CHANGE_FOCUS_LABEL}
              </Button>
              {override !== null && (
                <Button variant="quiet" onClick={() => chooseOverride(null)}>
                  {OVERRIDE_CANCEL_LABEL}
                </Button>
              )}
            </div>
            {/* The override's choices. Power stays visible under Recovery,
                disabled, with the refusal said beside the Recovery action. */}
            {expanded && (
              <div
                id={focusChoices}
                className="clr-row"
                role="group"
                aria-label={OVERRIDE_GROUP_LABEL}
                style={CHIP_ROW}
              >
                {ANCHORS.map((anchor) => (
                  <Chip
                    key={anchor.value}
                    selected={resolved.focus === anchor.value}
                    disabled={!anchorAllowed(resolved.goal, anchor.value)}
                    onClick={() => chooseOverride(anchor.value)}
                  >
                    {anchor.label}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {focusHistory?.status === 'history-error' && (
              <div className="clr-stack clr-stack--tight">
                <p role="alert" style={{ margin: 0, color: 'var(--text-negative)' }}>
                  {HISTORY_ERROR_MESSAGE}
                </p>
                <div className="clr-row">
                  <Button variant="quiet" onClick={history.refetch}>
                    {HISTORY_RETRY_LABEL}
                  </Button>
                </div>
              </div>
            )}

            {/* §2.3: Recovery offers no Power, and the Recovery action says why */}
            <FormField
              label="Anchor"
              required
              helperText={
                focusHistory?.status === 'no-completed-history'
                  ? FIRST_WORKOUT_MESSAGE
                  : focusHistory?.status === 'history-error'
                    ? undefined
                    : MANUAL_FOCUS_MESSAGE
              }
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
          </>
        )}

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
              ? 'Your goal sets the range.'
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

/** The chip row wraps on a phone rather than overflowing it. */
const CHIP_ROW = { flexWrap: 'wrap', gap: 'var(--spacing-100)' } as const

/** The profile's default place, or the first one — never nothing when one exists. */
function defaultLocationId(locations: readonly Location[]): string | null {
  const preferred = locations.find((location) => location.is_default) ?? locations[0]
  return preferred?.id ?? null
}
