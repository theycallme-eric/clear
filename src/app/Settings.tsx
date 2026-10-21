/**
 * Settings — `/settings` (SET-01).
 *
 * IA.md §4: atmosphere `full`, protected, in from Home, out to Home and the
 * sub-views. Composition is 0.14.3's contained form: the screen `<h1>` is the
 * only text on the atmosphere, and each section — training, limitations,
 * appearance, places, session — is one `Card` holding its own heading, its
 * controls and its save line. Nothing is pinned while the screen is usable,
 * because every change saves itself; the footer carries Retry alone.
 *
 * What this screen is for is one resolved decision (IA.md §6): **onboarding is
 * strictly first-run**. Every question the wizard asks is answered again here
 * instead, which is why the goal presets, the experience levels, the sections
 * and the movement patterns are all imported from `state/onboarding.ts` rather
 * than restated — one vocabulary, asked in two places.
 *
 * Three properties are the requirement rather than decoration:
 *
 *   1. **Every change saves itself.** There is no Save button to forget: a
 *      choice is written the moment it is made, the cache is updated
 *      optimistically so the control answers immediately, and a failed write
 *      puts the previous value back and says so (IA.md §4 — "save failed —
 *      optimistic update rolls back"). What is stored is what the next
 *      generation composes from: `generation_candidates` reads
 *      `profiles.goal_preset` and `enabled_sections`, and the eligibility query
 *      reads the same `user_constraints` rows this screen writes.
 *   2. **A refused toggle says why.** While the goal is `active_recovery` the
 *      generator composes from a fixed section set whatever the profile holds,
 *      and the last enabled section cannot be removed at all
 *      (`profiles_enabled_sections_not_empty`). Both refusals are sentences
 *      next to the control, never a silently ignored tap.
 *   3. **Locations and equipment are not edited here.** SET-02 owns that
 *      screen; a control now would be an affordance that lies, so this card
 *      states where the answer lives and offers only the way there.
 */
import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import {
  AppHeader,
  ArrowLeft,
  Button,
  Checkbox,
  ChoiceGroup,
  ClearLogo,
  EmptyState,
  Input,
  LogOut,
  TextAction,
} from '../design-system/index'
import { useAuth } from '../state/auth-context'
import { constraintsQueryKey, useConstraintsQuery, useUserConstraints } from '../state/constraint-queries'
import type { UserConstraint } from '../data/constraints'
import type { Enums } from '../data/database.types'
import { EXPERIENCE_LEVELS, MOVEMENT_PATTERNS, SECTIONS } from '../state/onboarding'
import { useQueryClient } from '../state/query'
import type { Profile, ProfilePreferences } from '../state/schemas'
import {
  goalCorrection,
  FROM_SETTINGS_STATE,
  goalOptions,
  hasInAppHistory,
  limitationFor,
  LOCKED_SECTIONS_REASON,
  limitationsFrom,
  noteValue,
  preferencesOf,
  sectionRefusal,
  sectionsLocked,
  SETTINGS_BACK_LABEL,
  withExperience,
  withGoal,
  withPreferences,
  withSection,
} from '../state/settings'
import { useAppearance } from '../state/appearance'
import { profileQueryKey, useProfileQuery, useUserData } from '../state/user-queries'
import { CheckboxGroup } from '../ui/checkbox-group'
import {
  viewEmpty,
  viewError,
  viewLoading,
  viewReady,
  type ViewState,
} from '../state/view-state'
import { AppearancePicker } from '../ui/appearance-picker'
import { Card } from '../ui/card'
import { ActionRow, PhoneFooter } from '../ui/composition'
import { SaveStatusLine, useInlineSave } from '../ui/inline-save'
import { ErrorView, LoadingView, ViewStateSwitch } from '../ui/view-state'
import { Screen } from './Screen'
import { ANONYMOUS_HOME, AUTHENTICATED_HOME, ONBOARDING_ROUTE } from './guards'

/** The longest limitations note `user_constraints.note` is asked to hold. */
export const NOTE_MAX_LENGTH = 2000

/** U08: with no profile there is one fact and one way on — set up. */
export const SETTINGS_EMPTY_TITLE = 'No profile yet'
export const SETTINGS_EMPTY_ACTION = 'Set up your profile'

export function Settings() {
  const query = useProfileQuery()
  const navigate = useNavigate()
  const location = useLocation()

  // E05: Back is back when an in-app screen is behind this one. Opened by URL
  // or as the installed PWA's first screen there is none, so Home replaces
  // Settings rather than Back leaving the app or doing nothing.
  const goBack = () => {
    if (hasInAppHistory(location.key, window.history.state)) void navigate(-1)
    else void navigate(AUTHENTICATED_HOME, { replace: true })
  }

  // The fourth state is this view's own judgement. A profile row is what every
  // control here edits, so "there is no row" is not a settings screen — and it
  // cannot arrive through the guard, which sends an un-onboarded visitor to set
  // up their account instead. Rendered rather than assumed away.
  const state: ViewState<Profile> =
    query.state.status === 'loading'
      ? viewLoading()
      : query.state.status === 'error'
        ? viewError(query.state.error)
        : query.state.data === null
          ? viewEmpty()
          : viewReady(query.state.data)

  return (
    <>
      <AppHeader
        actions={
          <Button variant="quiet" icon={<ArrowLeft size={20} />} onClick={goBack}>
            {SETTINGS_BACK_LABEL}
          </Button>
        }
      >
        <ClearLogo size="md" />
      </AppHeader>
      <Screen
        title="Settings"
        pinnedFoot={
          state.status === 'error' ? (
            <PhoneFooter>
              <ActionRow>
                <Button variant="primary" onClick={query.refetch}>
                  Retry
                </Button>
              </ActionRow>
            </PhoneFooter>
          ) : state.status === 'empty' ? (
            <PhoneFooter>
              <ActionRow>
                <Button variant="primary" onClick={() => void navigate(ONBOARDING_ROUTE)}>
                  {SETTINGS_EMPTY_ACTION}
                </Button>
              </ActionRow>
            </PhoneFooter>
          ) : undefined
        }
      >
        {state.status === 'loading' ? (
          <LoadingView label="Reading your settings" />
        ) : state.status === 'error' ? (
          <ErrorView error={state.error} title="Your settings didn’t load" />
        ) : state.status === 'empty' ? (
          <EmptyState title={SETTINGS_EMPTY_TITLE} />
        ) : (
          <div className="clr-stack">
            <PreferencesSection profile={state.data} />
            <LimitationsSection />
            <AppearanceSection />
            <TrainingPlacesSection />
            <SessionSection />
          </div>
        )}
      </Screen>
    </>
  )
}

/**
 * One settings section: a landmark named by the heading its card holds. The
 * card's heading slot is the real heading at the screen's outline level, so
 * the id rides on its text rather than on a second element.
 */
function SettingsCard({
  id,
  heading,
  children,
}: {
  id: string
  heading: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id}>
      <Card heading={<span id={id}>{heading}</span>}>
        <div className="clr-stack">{children}</div>
      </Card>
    </section>
  )
}

// Saving is shared, not copied: `src/ui/inline-save.tsx` owns the busy state,
// the settled state and the failure toast for both settings screens, and each
// caller owns the cache entry it writes optimistically and rolls back.

// ─────────────────────────────────────────────────────────────────────────────
// Preferences
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Goal, experience and sections — the three columns of `profiles` a person
 * answered during onboarding, editable one tap at a time.
 */
function PreferencesSection({ profile }: { profile: Profile }) {
  const { user } = useAuth()
  const userData = useUserData()
  const cache = useQueryClient()
  const { status, save } = useInlineSave()
  const [refusal, setRefusal] = useState<string | null>(null)

  const preferences = preferencesOf(profile)
  const locked = sectionsLocked(preferences.goal_preset)
  const correction = goalCorrection(preferences.goal_preset)

  async function store(next: ProfilePreferences) {
    if (user === null || next === preferences) return

    const key = profileQueryKey(user.id)
    setRefusal(null)
    // Optimistic: the control answers now, because a preference that waits for
    // a round trip before it moves reads as a control that did not work.
    cache.setData(key, withPreferences(profile, next))

    await save(
      () => userData.updatePreferences(user.id, next),
      () => {
        cache.setData(key, profile)
      },
    )
  }

  return (
    <SettingsCard id="settings-training" heading="Training">
      <ChoiceGroup
        legend="Goal"
        options={goalOptions().map((goal) => ({
          value: goal.value,
          label: goal.label,
        }))}
        // A goal that needs correcting is not one of the options, so nothing
        // is shown as chosen and the sentence below says what to do.
        value={correction === null ? (preferences.goal_preset ?? undefined) : undefined}
        onChange={(next) => {
          const goal = single(next) as Enums<'goal_preset'>
          void store(withGoal(preferences, goal))
        }}
      />
      {correction !== null && <p style={{ margin: 0 }}>{correction}</p>}

      <ChoiceGroup
        legend="Experience"
        options={EXPERIENCE_LEVELS.map((level) => ({
          value: level.value,
          label: level.label,
        }))}
        value={preferences.experience_level ?? undefined}
        onChange={(next) => {
          void store(
            withExperience(preferences, single(next) as Enums<'experience_level'>),
          )
        }}
      />

      <CheckboxGroup legend="Sections">
        {locked && <p style={{ margin: 0 }}>{LOCKED_SECTIONS_REASON}</p>}
        {SECTIONS.map((section) => (
          <Checkbox
            key={section.value}
            label={section.label}
            checked={preferences.enabled_sections.includes(section.value)}
            // Disabled rather than silently ineffective: while the goal fixes
            // the set, the control says so above and cannot be moved.
            disabled={locked}
            onChange={() => {
              const reason = sectionRefusal(preferences, section.value)
              if (reason !== null) {
                setRefusal(reason)
                return
              }
              void store(withSection(preferences, section.value))
            }}
          />
        ))}
        {refusal !== null && (
          <p role="alert" style={{ margin: 0 }}>
            {refusal}
          </p>
        )}
      </CheckboxGroup>

      <SaveStatusLine status={status} />
    </SettingsCard>
  )
}

/** ChoiceGroup answers a single choice as a string; `multiple` is not used here. */
function single(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? '') : value
}

// ─────────────────────────────────────────────────────────────────────────────
// Limitations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What to work around, as DATA-05 stores it: one persistent `exclude` row per
 * movement pattern, and one note carried across them — the same rows
 * `complete_onboarding` wrote, edited rather than re-collected.
 *
 * Its own query and its own four states: a constraints read that failed must
 * not cost the user their preferences card, and an empty set is not a failure —
 * it is the ordinary answer, and the editor is still the content.
 */
function LimitationsSection() {
  const query = useConstraintsQuery()

  const state: ViewState<readonly UserConstraint[]> =
    query.state.status === 'loading'
      ? viewLoading()
      : query.state.status === 'error'
        ? viewError(query.state.error)
        : query.state.data.length === 0
          ? viewEmpty()
          : viewReady(query.state.data)

  return (
    <SettingsCard id="settings-limitations" heading="Limitations">
      <ViewStateSwitch
        state={state}
        loadingLabel="Reading your limitations"
        errorTitle="Your limitations didn’t load"
        onRetry={query.refetch}
        // Nothing recorded is a state of this editor, not a screen instead of
        // it: the same controls, with nothing ticked and a line saying so.
        empty={<LimitationsEditor constraints={[]} />}
      >
        {(constraints) => <LimitationsEditor constraints={constraints} />}
      </ViewStateSwitch>
    </SettingsCard>
  )
}

function LimitationsEditor({
  constraints,
}: {
  constraints: readonly UserConstraint[]
}) {
  const { user } = useAuth()
  const client = useUserConstraints()
  const cache = useQueryClient()
  const { status, save } = useInlineSave()
  const limitations = limitationsFrom(constraints)
  const [note, setNote] = useState(limitations.note)
  const [tooLong, setTooLong] = useState(false)

  const key = user === null ? null : constraintsQueryKey(user.id)
  const rollback = () => {
    if (key !== null) cache.setData(key, constraints)
  }

  async function togglePattern(pattern: Enums<'movement_pattern'>) {
    if (user === null || key === null) return

    const existing = limitationFor(constraints, pattern)

    if (existing !== null) {
      cache.setData(
        key,
        constraints.filter((constraint) => constraint.id !== existing.id),
      )
      await save(() => client.remove(existing.id), rollback)
      return
    }

    const added = {
      userId: user.id,
      // `exclude` is the only action a user-facing control may set: the other
      // two persist and travel as context, and nothing filters on them yet
      // (DATA-05, `USER_SETTABLE_ACTIONS`).
      action: 'exclude' as const,
      target: { scope: 'movement_pattern' as const, pattern },
      appliesTo: { persistence: 'persistent' as const },
      // The note is one sentence across the set, so a pattern added later
      // carries what the others already say.
      note: noteValue(note),
    }

    await save(async () => {
      const stored = await client.add(added)
      if (stored.ok) cache.setData(key, [...constraints, stored.value])
      return stored
    }, rollback)
  }

  async function storeNote() {
    if (user === null || key === null) return
    if (note.trim() === limitations.note.trim()) return

    if (note.length > NOTE_MAX_LENGTH) {
      setTooLong(true)
      return
    }
    setTooLong(false)

    const written = noteValue(note)
    cache.setData(
      key,
      constraints.map((constraint) =>
        constraint.target.scope === 'movement_pattern' &&
        constraint.appliesTo.persistence === 'persistent'
          ? { ...constraint, note: written }
          : constraint,
      ),
    )
    await save(() => client.setPatternNote(user.id, written), rollback)
  }

  return (
    <div className="clr-stack">
      {constraints.length === 0 && (
        <p style={{ margin: 0 }}>
          Nothing recorded. Tick anything a workout should work around.
        </p>
      )}

      <CheckboxGroup legend="Work around">
        {MOVEMENT_PATTERNS.map((pattern) => (
          <Checkbox
            key={pattern.value}
            label={pattern.label}
            checked={limitations.patterns.includes(pattern.value)}
            onChange={() => {
              void togglePattern(pattern.value)
            }}
          />
        ))}
      </CheckboxGroup>

      <Input
        label="Note · optional"
        name="limitations_note"
        multiline
        rows={3}
        value={note}
        onChange={setNote}
        // Saved when the field is left rather than on every keystroke: free
        // text is one edit, not one edit per character.
        onBlur={() => {
          void storeNote()
        }}
        placeholder="Left shoulder — nothing overhead for a few weeks."
        helperText="Context only. The ticks above are what exclude movements."
        errorText={
          tooLong ? `Keep the note to ${NOTE_MAX_LENGTH} characters.` : undefined
        }
      />

      <SaveStatusLine status={status} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Appearance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The skin, which is this device's rather than the profile's: `skin.js` stores
 * it and `useAppearance` wraps that, so this row owns no save and no rollback.
 * Every option — the system one and each skin in `SKINS` — comes from the
 * picker's derived list; none is named here. The favicon follows `data-skin`
 * through `startFaviconSync`, so choosing here moves it with nothing to call.
 */
function AppearanceSection() {
  const [appearance, choose] = useAppearance()

  return (
    <SettingsCard id="settings-appearance" heading="Appearance">
      <AppearancePicker legend="Skin" value={appearance} onChange={choose} />
    </SettingsCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The cards this screen does not edit in
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where you train, and what is there. SET-02's sub-views own the editing, so
 * this card says where the answer lives and offers the way there as the quiet
 * action it is — an editing control here would be an affordance that lies.
 */
function TrainingPlacesSection() {
  const navigate = useNavigate()

  return (
    // U08: the heading is the statement; the action is the way there.
    <SettingsCard id="settings-places" heading="Places and equipment">
      <TextAction onClick={() => void navigate('/settings/locations', { state: FROM_SETTINGS_STATE })}>
        Manage places
      </TextAction>
    </SettingsCard>
  )
}

function SessionSection() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  return (
    <SettingsCard id="settings-session" heading="Session">
      <p style={{ margin: 0 }}>Signing out clears this device’s copy of your data.</p>
      <ActionRow>
        <Button
          variant="secondary"
          loading={signingOut}
          icon={<LogOut size={20} />}
          onClick={() => {
            void (async () => {
              setSigningOut(true)
              // The cache is emptied by the provider whether or not the
              // revocation call succeeded (AUTH-01), so this leaves for
              // Welcome either way rather than stranding a signed-out visitor
              // on a screen that has nothing left to show.
              await signOut()
              void navigate(ANONYMOUS_HOME, { replace: true })
            })()
          }}
        >
          Sign out
        </Button>
      </ActionRow>
    </SettingsCard>
  )
}
