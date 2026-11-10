/**
 * Generate — `/generate` (GEN-04).
 *
 * IA.md §4: atmosphere `full`, protected, in from Home, out to Loading →
 * Review. Composition is the export's Form Screen template — a stack inside the
 * shell, the standing Goal as context, the Focus — recommended, or a label plus
 * a wrapping row of chips to choose one — the `IntensitySlider`, the inputs,
 * and one full-width primary action in the measured pinned footer. 0.14.3
 * contains the form: only the screen title sits on the atmosphere, and one
 * `Card` holds every group, label and field. The deload suggestion is that
 * card's ruled sub-group rather than a second card, the Focus read's loading
 * state is content of it, and the action stays outside it in the footer.
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
 *      the URL.** The Focus value itself is the disclosure that reveals the
 *      four choices beside a recommendation, and a chosen one is marked `this
 *      workout only` until it is dismissed; `Recovery session`, reached inside
 *      those choices as its own toggle, makes this one draft a Recovery one,
 *      with Power refused in text. Both are the draft's explicit intent
 *      parameters, so a refresh restores them, and neither writes the profile.
 *
 * TASK-024 (REQ-024; C51, G16; R06, R10, R11, R21, R23, R25; reconciling UAT
 * #286). Accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * `/gallery/refinements?state=screens`, which draws this file's own
 * `GenerateBack`, `GenerateIntent` and `GenerateContextFields`:
 *
 *   · Goal and Focus lead the one card on one wrapping row, in the shared
 *     `.clr-intent-summary` recipe's larger type (R10.2, R21). The Focus value
 *     is the change control — a keyboard disclosure named by what it shows,
 *     with its expanded state and a chevron cue (R25) — so no detached or
 *     paired `Change focus` action remains (R06, R10.1).
 *   · Recovery is reached inside the focus choices as its own session toggle,
 *     apart from the four mutually exclusive movement-focus values; it never
 *     becomes a fifth focus (R10.1). A first workout opens as a normal session
 *     with Recovery offered unselected and never recommended (R11).
 *   · Place and Notes carry no helper lines (R23); their labels, controls, the
 *     Notes placeholder, errors and the request are unchanged. MINUTES fits its
 *     slot through the public Input `unit` contract (`styles/fields.css`), with
 *     nothing set here (R10.3). The title stays `Generate` and the action
 *     `Generate workout` (R10.4); Back stays the shared framed icon-only
 *     control named for its destination, Home (R10.5, #286).
 *   · #286's data and behaviour contracts are kept as they were: a first
 *     workout asks for one of four Anchors and requires one; a history
 *     recommendation is shown collapsed, its choices behind the Focus control,
 *     and a different choice is for this workout only; the Goal is the stored
 *     standing value; Intensity is always 1–10.
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
import { useNavigate, useSearchParams } from 'react-router-dom'

import {
  AlertCircle,
  ArrowLeft,
  Button,
  ChevronDown,
  ChevronRight,
  Chip,
  EmptyState,
  FormField,
  IconButton,
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
  clampIntensity,
  GENERATE_PATH,
  GENERATION_GOALS,
  initialDraft,
  inputFrom,
  intensityNote,
  intentFrom,
  needsFirstWorkoutGuidance,
  NOTES_MAX_LENGTH,
  POWER_REFUSAL,
  RECOVERY_NOTE,
  refusalFrom,
  REQUESTED_INTENSITY_RANGE,
  requestFrom,
  requestPrefillFrom,
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
  type GenerationResolution,
  type RequestPrefill,
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
import { ActionGroup, ActionRow, PhoneFooter } from '../ui/composition'
import { DeloadBanner } from '../ui/deload-banner'
import { ForegroundEchoFrame } from '../ui/foreground-echo'
import { Select } from '../ui/select'
import { ErrorView, LoadingView } from '../ui/view-state'
// C51: the Goal/Focus summary is the shared refinement recipe, not route CSS.
import '../ui/refinements/tokens.css'
import '../ui/refinements/presentation.css'
import { GenerationLoadingHost } from './GenerationLoadingHost'
import { Screen, type ScreenHeader } from './Screen'

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

/** The correction state, for a profile with no Goal and for a legacy one. */
export const GOAL_CORRECTION_TITLE = 'Set your goal in Settings'
export const MISSING_GOAL_MESSAGE =
  'Generation needs your goal, and none is set. Choose one in Settings first.'
export const LEGACY_GOAL_MESSAGE =
  'Active recovery is no longer a standing goal. Choose a goal in Settings first.'
export const GOAL_CORRECTION_ACTION = 'Open Settings'

/** The Focus area while the history read is in flight. */
export const HISTORY_LOADING_LABEL = 'Reading your history'

/**
 * Why a Focus is asked for before anything has been completed (REQ-005), shown
 * only while it is needed (U26). Stale history and a failed read get no
 * guidance beyond the field's own label: neither is a first workout.
 */
export const FIRST_WORKOUT_MESSAGE = 'First workout: choose a starting focus.'

/** A failed history read is said as one, and does not block generation (REQ-006). */
export const HISTORY_ERROR_MESSAGE =
  'Your history could not be read. Retry, or choose the focus for this workout.'
export const HISTORY_RETRY_LABEL = 'Retry'

/** The page title (R10.4), and the generation action, which keeps its name. */
export const GENERATE_TITLE = 'Generate'
export const GENERATE_ACTION_LABEL = 'Generate workout'

/** R10.5 / #286: the shared framed icon-only Back, named for where it goes. */
export const HOME_BACK_LABEL = 'Home'

/** The summary's two facts (C51). The Focus fact is also its change control. */
export const GOAL_TERM = 'Goal'
export const FOCUS_TERM = 'Focus'

/** The deliberate way off a recommendation, and the way back to it (REQ-007). */
export const OVERRIDE_GROUP_LABEL = 'Focus for this workout'
export const OVERRIDE_SCOPE = 'this workout only'
export const OVERRIDE_CANCEL_LABEL = 'Use the recommended focus'

/** The one-workout Recovery mode, and what it says while it is on (REQ-008). */
export const RECOVERY_LABEL = 'Recovery session'

/**
 * The field copy, kept short (U28). The unit is spelled out, never `min`.
 * Place and Notes carry no helper lines (R23): the label, the control and the
 * Notes placeholder say what each is for.
 */
export const DURATION_LABEL = 'Time available'
export const DURATION_UNIT = 'minutes'
export const NOTES_PLACEHOLDER = 'Tight hamstrings today.'

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
  // REQ-007 / R10.5: Back is the shared framed icon-only housing; its name stays "Home".
  const header: ScreenHeader = {
    actions: <GenerateBack onHome={() => void navigate('/')} />,
  }

  return (
    <GenerationLoadingHost generation={generation} cancelTo={cancelTo}>
      {needsSettings ? (
        <Screen
          title={GENERATE_TITLE}
          header={header}
          pinnedFoot={
            <PhoneFooter>
              <ActionRow>
                <Button
                  variant="primary"
                  onClick={() => void navigate(SETTINGS_ROUTE)}
                >
                  {GOAL_CORRECTION_ACTION}
                </Button>
              </ActionRow>
            </PhoneFooter>
          }
        >
          <ForegroundEchoFrame>
            <EmptyState
              icon={<AlertCircle />}
              title={GOAL_CORRECTION_TITLE}
              message={goalPreset === null ? MISSING_GOAL_MESSAGE : LEGACY_GOAL_MESSAGE}
            />
          </ForegroundEchoFrame>
        </Screen>
      ) : state.status === 'loading' ? (
        <Screen title={GENERATE_TITLE} header={header}>
          <LoadingView
            label={profileSettled ? 'Reading your places' : 'Reading your profile'}
          />
        </Screen>
      ) : state.status === 'error' ? (
        <Screen
          title={GENERATE_TITLE}
          header={header}
          pinnedFoot={
            <PhoneFooter>
              <ActionRow>
                <Button
                  variant="primary"
                  onClick={profileSettled ? locations.refetch : profile.refetch}
                >
                  Retry
                </Button>
              </ActionRow>
            </PhoneFooter>
          }
        >
          <ErrorView
            error={state.error}
            title={profileSettled ? 'Your places didn’t load' : 'Your profile didn’t load'}
          />
        </Screen>
      ) : state.status === 'empty' ? (
        <Screen
          title={GENERATE_TITLE}
          header={header}
          pinnedFoot={
            <PhoneFooter>
              <ActionRow>
                <Button
                  variant="primary"
                  onClick={() => void navigate('/settings/locations')}
                >
                  Add a place
                </Button>
              </ActionRow>
            </PhoneFooter>
          }
        >
          {/* U08: the fact, with Add a place pinned as the way on. */}
          <ForegroundEchoFrame>
            <EmptyState title="No places yet" />
          </ForegroundEchoFrame>
        </Screen>
      ) : (
        <GenerateForm
          header={header}
          goalPreset={state.data.goalPreset}
          places={state.data.places}
          generation={generation}
          composition={composition}
          onCompose={setComposition}
        />
      )}
    </GenerationLoadingHost>
  )
}

function GenerateForm({
  header,
  goalPreset,
  places,
  generation,
  composition,
  onCompose,
}: {
  header: ScreenHeader
  goalPreset: GoalPreset | null
  places: Places
  generation: GenerationMutation
  composition: Composition | null
  onCompose: (update: (previous: Composition | null) => Composition) => void
}) {
  // REQ-007/REQ-008: the one-workout intent is the URL's, so an untouched form
  // opens on whatever override or Recovery the address carries, and nothing
  // else in the query string — a bare Focus prefill least of all — seeds it.
  // U20: Home's next-workout entry also carries the last request's minutes and
  // place, which history cannot re-derive; Goal, Focus and intensity stay the
  // resolver's, so the handoff sends what a direct visit with those would.
  const [searchParams, setSearchParams] = useSearchParams()
  const untouched = (): Composition => ({
    draft: initialDraft(
      defaultLocationId(places),
      null,
      intentFrom(searchParams),
      carriedRequest(searchParams, places),
    ),
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

  // A Focus chosen over a recommendation history still makes.
  const override = focusSourceOf(resolved) === 'override'

  // The choices behind the Focus control open with an override in force — a
  // refreshed one included — and with Recovery, whose refused Power stays seen.
  const focusChoices = useId()
  const [changing, setChanging] = useState(draft.anchor !== null || draft.recovery)
  const expanded = changing || override

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
  const range = REQUESTED_INTENSITY_RANGE
  const intensity = resolved.intensity ?? draft.intensity ?? range.start
  const intensityNoted =
    resolved.goal === null || clampIntensity(resolved.goal, intensity) !== intensity

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

  /** §2.3: a Power choice is cleared, not substituted, so the choices stay shown. */
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
    <>
      <Screen
        title={GENERATE_TITLE}
        header={header}
        pinnedFoot={
          <PhoneFooter>
            <ActionRow>
              <Button
                variant="primary"
                size="lg"
                disabled={!canGenerate(draft, context)}
                onClick={submit}
              >
                {GENERATE_ACTION_LABEL}
              </Button>
            </ActionRow>
          </PhoneFooter>
        }
      >
        {/* The one form card. A refused draft is the card's own state: it
            takes the urgency role, and the sentence is inside it. */}
        <Card role={refusal !== null ? 'urgency' : undefined}>
        <div className="clr-stack">
          {refusal !== null && (
            <p role="alert" style={{ margin: 0, color: 'var(--text-negative)' }}>
              {refusal.message}
            </p>
          )}

        {/* Goal and Focus lead the card, the Focus value its own change
            control with Recovery inside its choices (C51; R10.1, R10.2). */}
        <GenerateIntent
          goalPreset={goalPreset}
          draft={draft}
          resolved={resolved}
          history={focusHistory}
          expanded={expanded}
          choicesId={focusChoices}
          focusError={refusal?.fields.focus}
          onToggleFocus={toggleChanging}
          onChooseOverride={chooseOverride}
          onChooseAnchor={(anchor) => setDraft(withAnchor(draft, anchor))}
          onToggleRecovery={toggleRecovery}
          onRetryHistory={history.refetch}
        />

        {/* Deload — above the intensity selector (IA §4), and only when §4 fired */}
        {suggestion !== null && (
          <DeloadBanner
            suggestion={suggestion}
            applied={applied !== null}
            onApply={applyDeload}
            onDismiss={() => deload.answer('dismissed')}
          />
        )}

        {/* Intensity — one 1–10 choice. The range explanation is gone (B05-02.5);
            the hint stays only where the goal composes the choice as another
            value, or where no goal yet says how it is used (U27). */}
        <div className="clr-stack clr-stack--tight">
          <IntensitySlider
            label="Intensity"
            min={range.min}
            max={range.max}
            step={1}
            value={intensity}
            disabled={resolved.goal === null}
            valueText={`${intensity} of ${range.max}`}
            aria-describedby={intensityNoted ? intensityHint : undefined}
            onChange={chooseIntensity}
          />
          {intensityNoted && (
            <p id={intensityHint}>{intensityNote(resolved.goal, intensity)}</p>
          )}
        </div>

        {/* R23: Place and Notes without helper lines; R10.3: the unit fits
            through the public Input contract. */}
        <GenerateContextFields
          places={places}
          locationId={draft.locationId}
          durationMins={draft.durationMins}
          notes={draft.notes}
          errors={refusal?.fields}
          onLocation={(value) => setDraft(withLocation(draft, value))}
          onDuration={(value) => setDraft(withDuration(draft, value))}
          onNotes={(value) => setDraft(withNotes(draft, value))}
        />
        </div>
        </Card>
      </Screen>

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
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK-024 (C51): the route's own presentation, shared with the accepted
// gallery state `/gallery/refinements?state=screens`
// ─────────────────────────────────────────────────────────────────────────────

/** Where the resolved Focus came from, or null while there is none to show. */
function focusSourceOf(
  resolved: GenerationResolution,
): 'recommended' | 'override' | 'manual' | null {
  return resolved.status === 'ready' ? resolved.focusSource : null
}

/**
 * R10.5 / #286: the shared framed icon-only Back. Its name is its destination;
 * there is no arrow-plus-HOME label beside it.
 */
export function GenerateBack({ onHome }: { onHome?: () => void }) {
  return <IconButton label={HOME_BACK_LABEL} icon={<ArrowLeft size={20} />} onClick={onHome} />
}

export interface GenerateIntentProps {
  /** The loaded profile's `goal_preset`, exactly as stored. */
  readonly goalPreset: GoalPreset | null
  readonly draft: GenerationDraft
  readonly resolved: GenerationResolution
  /** What history says about a Focus; null while the read is in flight. */
  readonly history: FocusHistory | null
  /** Whether the choices behind a shown Focus are open. */
  readonly expanded: boolean
  /** The id the Focus control names as the region it opens. */
  readonly choicesId: string
  /** The refusal sentence for the Focus, when a send was refused. */
  readonly focusError?: string
  readonly onToggleFocus: () => void
  /** A Focus for this workout only, or null to return to the recommendation. */
  readonly onChooseOverride: (focus: GenerationDraft['anchor']) => void
  /** The manual Anchor, where history has nothing to recommend. */
  readonly onChooseAnchor: (anchor: NonNullable<GenerationDraft['anchor']>) => void
  readonly onToggleRecovery: () => void
  readonly onRetryHistory: () => void
}

/**
 * The Goal and Focus summary and the focus interaction (C51; R10.1, R10.2,
 * R21, R25; R11; #286).
 *
 * Goal and Focus share one wrapping row in the shared `.clr-intent-summary`
 * recipe. Where history recommends a Focus — or one was chosen over it for
 * this workout — the Focus value is itself the disclosure: a button named by
 * what it shows, with its expanded state, that opens the four choices and,
 * apart from them, the one-workout Recovery toggle. Recovery is a session
 * mode and the four are movement focuses, so Recovery is never one of them.
 *
 * Where nothing is recommended — a first workout, stale history, a failed
 * read — the four are asked for as the required Anchor field, with Recovery
 * offered beside it unselected: a first workout is a normal session.
 */
export function GenerateIntent({
  goalPreset,
  draft,
  resolved,
  history,
  expanded,
  choicesId,
  focusError,
  onToggleFocus,
  onChooseOverride,
  onChooseAnchor,
  onToggleRecovery,
  onRetryHistory,
}: GenerateIntentProps) {
  const goal = GENERATION_GOALS.find((option) => option.value === goalPreset)?.label
  // A Focus the athlete chose is theirs and is shown as chosen, whatever the
  // read is doing: a retry that succeeds does not take it back (REQ-006).
  const loading = history === null && draft.anchor === null
  const source = focusSourceOf(resolved)
  // With no recommendation a chosen Focus is the manual one and stays a field.
  const shown = source === 'recommended' || source === 'override'
  const focus = ANCHORS.find((anchor) => anchor.value === resolved.focus)?.label

  // Its own toggle, never a fifth focus: Recovery changes the session's Goal
  // for this workout and leaves the movement focus as it is (§2.3, R10.1).
  const recoveryChoice = (
    <div className="clr-row" style={CHIP_ROW} data-generate-recovery="">
      <Chip selected={draft.recovery} onClick={onToggleRecovery}>
        {RECOVERY_LABEL}
      </Chip>
    </div>
  )

  return (
    <div className="clr-stack clr-stack--tight" data-generate-intent="">
      <div className="clr-intent-summary">
        <p className="clr-intent-summary__fact" data-intent-fact="goal">
          {GOAL_TERM}: <strong>{goal}</strong>
        </p>
        {shown && (
          <p className="clr-intent-summary__fact" data-intent-fact="focus">
            <button
              type="button"
              className="clr-intent-summary__action clr-hit"
              aria-expanded={expanded}
              aria-controls={expanded ? choicesId : undefined}
              onClick={onToggleFocus}
            >
              <span>
                {FOCUS_TERM}: <strong>{focus}</strong>
              </span>
              {/* Icons ship aria-hidden; the shape is the state cue (R25). */}
              <span className="clr-intent-summary__cue">
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
            </button>
            {source === 'override' && (
              <span className="clr-intent-summary__scope"> — {OVERRIDE_SCOPE}</span>
            )}
          </p>
        )}
      </div>

      {/* Recovery's meaning is said while it is on, open or closed (U29, §2.3). */}
      {draft.recovery && (
        <p style={{ margin: 0 }}>
          {RECOVERY_NOTE} {POWER_REFUSAL}
        </p>
      )}

      {loading ? (
        <LoadingView label={HISTORY_LOADING_LABEL} />
      ) : shown ? (
        expanded && (
          <div id={choicesId} className="clr-stack clr-stack--tight" data-generate-focus-choices="">
            {source === 'override' && (
              <ActionGroup>
                <Button variant="quiet" onClick={() => onChooseOverride(null)}>
                  {OVERRIDE_CANCEL_LABEL}
                </Button>
              </ActionGroup>
            )}
            {/* The override's choices. Power stays visible under Recovery,
                disabled, with the refusal said in text. */}
            <div className="clr-row" role="group" aria-label={OVERRIDE_GROUP_LABEL} style={CHIP_ROW}>
              {ANCHORS.map((anchor) => (
                <Chip
                  key={anchor.value}
                  selected={resolved.focus === anchor.value}
                  disabled={!anchorAllowed(resolved.goal, anchor.value)}
                  onClick={() => onChooseOverride(anchor.value)}
                >
                  {anchor.label}
                </Chip>
              ))}
            </div>
            {recoveryChoice}
          </div>
        )
      ) : (
        <div className="clr-stack clr-stack--tight" data-generate-focus-choices="">
          {history?.status === 'history-error' && (
            <div className="clr-stack clr-stack--tight">
              <p role="alert" style={{ margin: 0, color: 'var(--text-negative)' }}>
                {HISTORY_ERROR_MESSAGE}
              </p>
              <ActionGroup>
                <Button variant="quiet" onClick={onRetryHistory}>
                  {HISTORY_RETRY_LABEL}
                </Button>
              </ActionGroup>
            </div>
          )}

          {/* §2.3: Recovery offers no Power, and the Recovery note says why */}
          <FormField
            label="Anchor"
            required
            helperText={
              needsFirstWorkoutGuidance(draft, history) ? FIRST_WORKOUT_MESSAGE : undefined
            }
            errorText={focusError}
          >
            <div className="clr-row" role="group" aria-label="Anchor" style={CHIP_ROW}>
              {ANCHORS.map((anchor) => (
                <Chip
                  key={anchor.value}
                  selected={draft.anchor === anchor.value}
                  disabled={!anchorAllowed(resolved.goal, anchor.value)}
                  onClick={() => onChooseAnchor(anchor.value)}
                >
                  {anchor.label}
                </Chip>
              ))}
            </div>
          </FormField>
          {recoveryChoice}
        </div>
      )}
    </div>
  )
}

export interface GenerateContextFieldsProps {
  /** The athlete's places; only their ids and names are drawn. */
  readonly places: ReadonlyArray<Pick<Location, 'id' | 'name'>>
  readonly locationId: string | null
  readonly durationMins: string
  readonly notes: string
  /** Field path → the refusal sentence that field shows beneath itself. */
  readonly errors?: Readonly<Record<string, string>>
  readonly onLocation: (locationId: string) => void
  readonly onDuration: (minutes: string) => void
  readonly onNotes: (notes: string) => void
}

/**
 * Place, Time available and Notes (R23, R10.3). No helper line under Place or
 * Notes; each keeps its label, control, error and — for Notes — placeholder
 * and length limit. The minutes unit is the public Input `unit`, fitted by the
 * shared contract in `styles/fields.css`; nothing here sizes it.
 */
export function GenerateContextFields({
  places,
  locationId,
  durationMins,
  notes,
  errors,
  onLocation,
  onDuration,
  onNotes,
}: GenerateContextFieldsProps) {
  return (
    <>
      <Select
        label="Place"
        value={locationId ?? ''}
        options={places.map((location) => ({
          value: location.id,
          label: location.name,
        }))}
        errorText={errors?.location_id}
        onChange={onLocation}
      />

      <Input
        label={DURATION_LABEL}
        type="number"
        inputMode="numeric"
        min={1}
        value={durationMins}
        unit={DURATION_UNIT}
        errorText={errors?.requested_duration_mins}
        onChange={onDuration}
      />

      <Input
        label="Notes"
        multiline
        rows={3}
        value={notes}
        placeholder={NOTES_PLACEHOLDER}
        errorText={errors?.notes}
        maxLength={NOTES_MAX_LENGTH}
        onChange={onNotes}
      />
    </>
  )
}

/**
 * The chip row wraps on a phone rather than overflowing it, on the same 8px
 * label/control step as every other in-card group (U05).
 */
const CHIP_ROW = { flexWrap: 'wrap', gap: 'var(--spacing-200)' } as const

/** The profile's default place, or the first one — never nothing when one exists. */
function defaultLocationId(locations: readonly Location[]): string | null {
  const preferred = locations.find((location) => location.is_default) ?? locations[0]
  return preferred?.id ?? null
}

/**
 * U20: the request Home carried, with its place kept only while it is still
 * one of the athlete's. A place since removed is no place, so the draft opens
 * on the default rather than on an id nothing can send.
 */
function carriedRequest(search: URLSearchParams, places: Places): RequestPrefill {
  const carried = requestPrefillFrom(search)
  const known = places.some((place) => place.id === carried.locationId)

  return known ? carried : { ...carried, locationId: null }
}
