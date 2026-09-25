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
 *
 * **What this screen deliberately does not do.** The goal the user picks here
 * shapes the intensity range and the anchors offered (v3 delta §2.2–2.3), and
 * it is *not* on the wire: `generationRequestSchema` is CORE-03's strict object
 * and carries focus, intensity, duration, location and notes — no goal field.
 * Adding one is a contract change, which is not this requirement's to make, so
 * the goal stays a client-side cascade until the schema carries it. That gap is
 * recorded in `docs/journal/2026-09-25.md`.
 */
import { useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
import { clampedIntensity, confirmsHardIntensity } from '../state/deload'
import { useDeloadBanner } from '../state/deload-queries'
import { generateRequestId, isErr } from '../state/errors'
import { useGeneration, type GenerationMutation } from '../state/generation'
import {
  ANCHORS,
  anchorAllowed,
  canGenerate,
  GENERATION_GOALS,
  initialDraft,
  inputFrom,
  intensityRange,
  NOTES_MAX_LENGTH,
  POWER_REFUSAL,
  refusalFrom,
  requestFrom,
  withAnchor,
  withDuration,
  withGoal,
  withIntensity,
  withLocation,
  withNotes,
  type DraftRefusal,
  type GenerationDraft,
} from '../state/generation-form'
import type { Location } from '../state/schemas'
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
import { Screen } from './Screen'

/** What the form needs before it can be filled in: the places and their default. */
type Places = readonly Location[]

export function Generate() {
  const navigate = useNavigate()
  const locations = useLocationsQuery()

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

  return (
    <>
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
          {(places) => <GenerateForm places={places} />}
        </ViewStateSwitch>
      </Screen>
    </>
  )
}

function GenerateForm({ places }: { places: Places }) {
  const generation = useGeneration()
  const [draft, setDraft] = useState<GenerationDraft>(() =>
    initialDraft(defaultLocationId(places)),
  )
  const [refusal, setRefusal] = useState<DraftRefusal | null>(null)

  // OVR-04. The user's own day draws the boundary every trigger is counted in,
  // so the zone is read once here rather than inside a rule (SES-01c's rule).
  const today = useMemo(
    () => localDayIn(Intl.DateTimeFormat().resolvedOptions().timeZone)(new Date()),
    [],
  )
  const deload = useDeloadBanner(today)
  const [applied, setApplied] = useState(false)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [overridden, setOverridden] = useState(false)

  const intensityHint = useId()
  const range = intensityRange(draft.goal)
  const chosenGoal = GENERATION_GOALS.find((goal) => goal.value === draft.goal)
  const pending = generation.state.status === 'pending'

  /**
   * §4's Apply: the intensity is clamped and the directive rides on the request.
   * Nothing else changes, and nothing changed before the user pressed it — the
   * requirement's first sentence is that this is never automatic.
   */
  function applyDeload() {
    setApplied(true)
    deload.answer('applied')
    setDraft(withIntensity(draft, clampedIntensity(draft.intensity ?? range.start)))
  }

  /**
   * §4: a hard intensity on a flagged day confirms **once**, then does what was
   * asked. `overridden` is what makes it once: the user has answered, and an app
   * that asked again at submit would be arguing rather than confirming.
   */
  function chooseIntensity(value: number) {
    if (!overridden && confirmsHardIntensity(value, deload.suggestion !== null)) {
      setConfirming(value)
      return
    }
    setDraft(withIntensity(draft, value))
  }

  function submit() {
    const request = requestFrom(draft, generateRequestId(), applied)

    // The one path to the client, and it is a total function: a refused draft
    // becomes sentences on the fields that caused it and nothing is sent.
    if (isErr(request)) {
      setRefusal(refusalFrom(request.error))
      return
    }

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
                selected={draft.goal === goal.value}
                onClick={() => setDraft(withGoal(draft, goal.value))}
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
          helperText={draft.goal === 'active_recovery' ? POWER_REFUSAL : undefined}
          errorText={refusal?.fields.focus}
        >
          <div className="clr-row" role="group" aria-label="Anchor" style={CHIP_ROW}>
            {ANCHORS.map((anchor) => (
              <Chip
                key={anchor.value}
                selected={draft.anchor === anchor.value}
                disabled={!anchorAllowed(draft.goal, anchor.value)}
                onClick={() => setDraft(withAnchor(draft, anchor.value))}
              >
                {anchor.label}
              </Chip>
            ))}
          </div>
        </FormField>

        {/* Deload — above the intensity selector (IA §4), and only when §4 fired */}
        {deload.suggestion !== null && (
          <DeloadBanner
            suggestion={deload.suggestion}
            applied={applied}
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
            value={draft.intensity ?? range.start}
            disabled={draft.goal === null}
            valueText={`${draft.intensity ?? range.start} of ${range.max}`}
            aria-describedby={intensityHint}
            onChange={chooseIntensity}
          />
          <p id={intensityHint}>
            {draft.goal === null
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
          disabled={!canGenerate(draft) || pending}
          loading={pending}
          onClick={submit}
        >
          Generate workout
        </Button>

        <GenerationStatus generation={generation} />
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
                setOverridden(true)
                setApplied(false)
                if (value !== null) setDraft(withIntensity(draft, value))
              }}
            >
              Go hard anyway
            </Button>
          </>
        }
      >
        <p>
          {deload.suggestion?.reason} Intensity {confirming} is a hard session on a day
          the app flagged. You know things it doesn’t — this is the only time it asks.
        </p>
      </AppDialog>
    </Card>
  )
}

/**
 * What the call itself is doing, beneath the action that started it.
 *
 * Deliberately small: GEN-05 owns the loading screen this hands off to, and a
 * second one invented here would be the thing it replaces. Until then the
 * states are said plainly — in flight, refused with the reason and the request
 * id, or finished with a workout the screen that shows it does not exist yet.
 */
function GenerationStatus({ generation }: { generation: GenerationMutation }) {
  const state = generation.state

  switch (state.status) {
    case 'idle':
      return null
    case 'pending':
      return (
        <div className="clr-stack clr-stack--tight">
          <p role="status">Composing your session…</p>
          <Button variant="quiet" onClick={generation.cancel}>
            Cancel
          </Button>
        </div>
      )
    case 'error':
      return (
        <div className="clr-stack clr-stack--tight" role="alert">
          <p style={{ color: 'var(--text-negative)' }}>{state.error.message}</p>
          <p style={{ fontFamily: 'var(--font-data)' }}>{state.error.requestId}</p>
          {state.error.retryable && (
            <Button variant="secondary" onClick={generation.retry}>
              Try again
            </Button>
          )}
        </div>
      )
    case 'success':
      return (
        <p role="status">
          Your workout is ready. The screen that shows it is being rebuilt.
        </p>
      )
  }
}

/** The chip rows wrap on a phone: five goals never fit one line (§2.1). */
const CHIP_ROW = { flexWrap: 'wrap', gap: 'var(--spacing-100)' } as const

/** The profile's default place, or the first one — never nothing when one exists. */
function defaultLocationId(locations: readonly Location[]): string | null {
  const preferred = locations.find((location) => location.is_default) ?? locations[0]
  return preferred?.id ?? null
}
