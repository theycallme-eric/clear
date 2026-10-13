/**
 * SET-02 — `/settings/locations`.
 *
 * Locations and their equipment are edited together because generation reads
 * the same pair together. List mutations publish to the query cache before the
 * request resolves and restore the previous list on failure. Equipment is
 * replaced transactionally by `save_location`, so the next generation sees
 * exactly what this screen last saved.
 *
 * Composition is 0.14.3's contained form: the screen `<h1>` is the only text
 * on the atmosphere. Each place is one `Card` — its name as the heading, its
 * tier beside it, its default marker, refusal and save line inside. The editor
 * is one more card holding the fields, and what is done with them is pinned:
 * Add place for the list, Save place and Cancel for the editor, Retry for a
 * failed read.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  AlertCircle,
  AppHeader,
  ArrowLeft,
  Button,
  Check,
  Checkbox,
  ChoiceGroup,
  ClearLogo,
  EmptyState,
  Input,
  Plus,
  TextAction,
  Trash,
} from '../design-system/index'
import { useAuth } from '../state/auth-context'
import {
  BLANK_NAME_REASON,
  deletionRefusal,
  draftFor,
  draftRefusal,
  equipmentLabel,
  equipmentOptions,
  tierLabel,
  TIERS,
  withDefault,
  withEquipment,
  withLocation,
  withName,
  withoutLocation,
  withTier,
} from '../state/locations'
import { useQueryClient, type QueryResult } from '../state/query'
import type { Location, LocationDraft } from '../state/schemas'
import {
  locationEquipmentQueryKey,
  locationsQueryKey,
  useLocationEquipmentQuery,
  useLocationsQuery,
  useUserData,
} from '../state/user-queries'
import { ConfirmDialog } from '../ui/blocking-dialog'
import { Card, CardActions } from '../ui/card'
import { CheckboxGroup } from '../ui/checkbox-group'
import { ActionRow, PhoneFooter } from '../ui/composition'
import { useInvalidFocus } from '../ui/formFocus'
import { SaveStatusLine, useInlineSave, type SaveStatus } from '../ui/inline-save'
import { useArrivalStagger } from '../ui/motion'
import { ErrorView, LoadingView } from '../ui/view-state'
import { Screen } from './Screen'

type EditorTarget = Location | 'new' | null

/** A sentence about one place, shown in that place's card. */
interface Refusal {
  readonly locationId: string
  readonly reason: string
}

const EDITOR_FORM_ID = 'location-editor'
const EDITOR_HEADING_ID = 'location-editor-heading'

export function LocationSettings() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const userData = useUserData()
  const cache = useQueryClient()
  const query = useLocationsQuery()
  const { status, save } = useInlineSave()
  const [editor, setEditor] = useState<EditorTarget>(null)
  const [editorSaving, setEditorSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Location | null>(null)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  // The list's one save line belongs to the card whose action started it.
  const [savedBy, setSavedBy] = useState<string | null>(null)

  const editing = editor === null || editor === 'new' ? null : editor
  const equipmentQuery = useLocationEquipmentQuery(editing?.id ?? null)

  const locations = query.state.status === 'ready' ? query.state.data : []
  const key = user === null ? null : locationsQueryKey(user.id)
  // A place being edited has nothing to save until its equipment has been read.
  const editorReady =
    editor === 'new' || (editing !== null && equipmentQuery.state.status === 'ready')

  function open(target: Location | 'new') {
    setEditorSaving(false)
    setEditor(target)
  }

  function refuseDeletion(location: Location): boolean {
    const reason = deletionRefusal(locations, location.id)
    if (reason === null) return false
    setPendingDelete(null)
    setRefusal({ locationId: location.id, reason })
    return true
  }

  async function makeDefault(location: Location) {
    if (key === null || location.is_default) return
    const previous = locations
    setRefusal(null)
    setSavedBy(location.id)
    cache.setData(key, withDefault(previous, location.id))
    await save(
      () => userData.setDefaultLocation(location.id),
      () => cache.setData(key, previous),
    )
  }

  async function remove(location: Location) {
    if (key === null) return
    if (refuseDeletion(location)) return

    const previous = locations
    setPendingDelete(null)
    setRefusal(null)
    setSavedBy(location.id)
    cache.setData(key, withoutLocation(previous, location.id))
    await save(
      () => userData.deleteLocation(location.id),
      () => cache.setData(key, previous),
    )
  }

  return (
    <>
      <AppHeader
        actions={
          <Button
            variant="quiet"
            icon={<ArrowLeft size={20} />}
            onClick={() => void navigate('/settings')}
          >
            Settings
          </Button>
        }
      >
        <ClearLogo size="md" />
      </AppHeader>
      <Screen
        title="Places and equipment"
        pinnedFoot={
          query.state.status === 'error' ? (
            <PhoneFooter>
              <ActionRow>
                <Button variant="primary" onClick={query.refetch}>
                  Retry
                </Button>
              </ActionRow>
            </PhoneFooter>
          ) : query.state.status !== 'ready' ? undefined : editor === null ? (
            <PhoneFooter>
              <ActionRow>
                <Button
                  variant="primary"
                  icon={<Plus size={20} />}
                  onClick={() => open('new')}
                >
                  Add place
                </Button>
              </ActionRow>
            </PhoneFooter>
          ) : (
            <PhoneFooter>
              <ActionRow>
                {editorReady && (
                  <Button
                    type="submit"
                    form={EDITOR_FORM_ID}
                    variant="primary"
                    loading={editorSaving}
                  >
                    Save place
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setEditor(null)}>
                  Cancel
                </Button>
              </ActionRow>
            </PhoneFooter>
          )
        }
      >
        {query.state.status === 'loading' ? (
          <LoadingView label="Reading your places" />
        ) : query.state.status === 'error' ? (
          <ErrorView error={query.state.error} title="Your places didn’t load" />
        ) : (
          <div className="clr-stack">
            {locations.length === 0 ? (
              <EmptyState
                title="No places yet"
                message="Add where you train and what equipment is available there."
              />
            ) : (
              <LocationList>
                {locations.map((location) => (
                  <LocationCard
                    key={location.id}
                    location={location}
                    refusal={refusal?.locationId === location.id ? refusal.reason : null}
                    status={savedBy === location.id ? status : 'idle'}
                    onEdit={() => open(location)}
                    onDefault={() => void makeDefault(location)}
                    onDelete={() => {
                      if (!refuseDeletion(location)) setPendingDelete(location)
                    }}
                  />
                ))}
              </LocationList>
            )}

            {editor !== null && (
              <LocationEditor
                key={editor === 'new' ? 'new' : editor.id}
                location={editing}
                locations={locations}
                equipment={equipmentQuery}
                onSaving={setEditorSaving}
                onClose={() => setEditor(null)}
              />
            )}
          </div>
        )}
      </Screen>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this place?"
        confirmLabel="Delete"
        critical
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete !== null) void remove(pendingDelete)
        }}
      >
        {pendingDelete === null
          ? null
          : `${pendingDelete.name} and its equipment list will be removed.`}
      </ConfirmDialog>
    </>
  )
}

/** A refusal in the card it is about: a glyph and the sentence, never colour alone. */
function RefusalLine({ children }: { children: string }) {
  return (
    <div role="alert" className="clr-row">
      <span aria-hidden="true" style={{ color: 'var(--icon-toast-negative)', display: 'flex' }}>
        <AlertCircle />
      </span>
      <span>{children}</span>
    </div>
  )
}

/** The places, arriving as one set: 40ms apart, once. A place added later simply appears. */
function LocationList({ children }: { children: ReactNode }) {
  const { className, ...arrival } = useArrivalStagger()

  return (
    <div {...arrival} className={['clr-stack', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  )
}

function LocationCard({
  location,
  refusal,
  status,
  onEdit,
  onDefault,
  onDelete,
}: {
  location: Location
  refusal: string | null
  status: SaveStatus
  onEdit: () => void
  onDefault: () => void
  onDelete: () => void
}) {
  return (
    <Card heading={location.name} meta={tierLabel(location.tier)}>
      <div className="clr-stack">
        {location.is_default && (
          <div className="clr-stack clr-stack--tight">
            <p className="clr-row" style={{ margin: 0 }}>
              <Check size={20} aria-hidden="true" />
              Default for generation
            </p>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              Generation uses this place and the equipment saved with it.
            </p>
          </div>
        )}
        {refusal !== null && <RefusalLine>{refusal}</RefusalLine>}
        {/* Named outright: the drawn chevron would otherwise join the name. */}
        <TextAction aria-label="Edit" onClick={onEdit}>
          Edit
        </TextAction>
        {/* Framed, but neither is the card's main action: the row would promote
            a critical button, and the confirmation is what carries severity. */}
        <CardActions>
          {!location.is_default && (
            <Button variant="secondary" icon={<Check size={20} />} onClick={onDefault}>
              Make default
            </Button>
          )}
          <Button variant="secondary" icon={<Trash size={20} />} onClick={onDelete}>
            Delete
          </Button>
        </CardActions>
        {status !== 'idle' && <SaveStatusLine status={status} />}
      </div>
    </Card>
  )
}

/**
 * The editor's card. It is the same card while a place's equipment is read,
 * when that read fails and once the fields are there, so nothing nests and the
 * heading never moves.
 */
function LocationEditor({
  location,
  locations,
  equipment,
  onSaving,
  onClose,
}: {
  location: Location | null
  locations: readonly Location[]
  equipment: QueryResult<string[]>
  onSaving: (saving: boolean) => void
  onClose: () => void
}) {
  const section = useRef<HTMLElement>(null)

  // The editor opens below the list, which can be longer than the screen, so
  // focus goes with it: to the region while a place's equipment is read, and
  // to the name of a new place (the form's own effect).
  const isNew = location === null
  useEffect(() => {
    if (!isNew) section.current?.focus()
  }, [isNew])

  return (
    <section ref={section} tabIndex={-1} aria-labelledby={EDITOR_HEADING_ID}>
      <Card
        heading={
          <span id={EDITOR_HEADING_ID}>
            {location === null ? 'Add place' : `Edit ${location.name}`}
          </span>
        }
      >
        {location !== null && equipment.state.status === 'loading' ? (
          <LoadingView label={`Reading ${location.name} equipment…`} />
        ) : location !== null && equipment.state.status === 'error' ? (
          <ErrorView
            error={equipment.state.error}
            title="This equipment list didn’t load"
            onRetry={equipment.refetch}
          />
        ) : (
          <LocationEditorForm
            location={location}
            locations={locations}
            initialDraft={draftFor(
              location,
              location === null || equipment.state.status !== 'ready'
                ? []
                : equipment.state.data,
            )}
            onSaving={onSaving}
            onClose={onClose}
          />
        )}
      </Card>
    </section>
  )
}

function LocationEditorForm({
  location,
  locations,
  initialDraft,
  onSaving,
  onClose,
}: {
  location: Location | null
  locations: readonly Location[]
  initialDraft: LocationDraft
  onSaving: (saving: boolean) => void
  onClose: () => void
}) {
  const { user } = useAuth()
  const userData = useUserData()
  const cache = useQueryClient()
  const { status, save } = useInlineSave()
  const onSubmit = useInvalidFocus()
  const nameField = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState(initialDraft)
  const [validation, setValidation] = useState<string | null>(null)

  const key = user === null ? null : locationsQueryKey(user.id)
  const isNew = location === null

  // A new place cannot be saved without a name, so that is where it starts.
  useEffect(() => {
    if (isNew) nameField.current?.focus()
  }, [isNew])

  /** Answers whether the draft was accepted for writing; a refusal marks its field. */
  async function store(): Promise<boolean> {
    if (user === null || key === null) return true
    const normalized = { ...draft, name: draft.name.trim() }
    const reason = draftRefusal(normalized, locations)
    if (reason !== null) {
      setValidation(reason)
      return false
    }

    setValidation(null)
    const previous = [...locations]
    const temporaryId = location?.id ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const optimistic: Location = location === null
      ? {
          id: temporaryId,
          user_id: user.id,
          created_at: now,
          updated_at: now,
          name: normalized.name,
          tier: normalized.tier,
          is_default: previous.length === 0,
        }
      : {
          ...location,
          name: normalized.name,
          tier: normalized.tier,
          updated_at: now,
        }

    cache.setData(key, withLocation(previous, optimistic))
    onSaving(true)
    await save(
      async () => {
        const result = await userData.saveLocation(normalized)
        if (result.ok) {
          cache.setData(key, withLocation(previous, result.value.location))
          cache.setData(
            locationEquipmentQueryKey(result.value.location.id),
            result.value.equipment,
          )
          onClose()
        }
        return result
      },
      () => cache.setData(key, previous),
    )
    onSaving(false)
    return true
  }

  return (
    <form id={EDITOR_FORM_ID} className="clr-stack" onSubmit={onSubmit(store)} noValidate>
      <Input
        label="Name"
        name="location_name"
        value={draft.name}
        onChange={(name) => setDraft((current) => withName(current, name))}
        errorText={validation === BLANK_NAME_REASON ? validation : undefined}
        inputRef={nameField}
      />
      <ChoiceGroup
        legend="Equipment tier"
        options={TIERS.map((tier) => ({ value: tier.value, label: tier.label }))}
        value={draft.tier}
        onChange={(next) => {
          const value = Array.isArray(next) ? next[0] : next
          if (value !== undefined) {
            setDraft((current) => withTier(current, value as LocationDraft['tier']))
          }
        }}
      />
      <CheckboxGroup legend="Equipment">
        {equipmentOptions(draft.equipment).map((item) => (
          <Checkbox
            key={item.value}
            label={equipmentLabel(item.value)}
            checked={draft.equipment.includes(item.value)}
            onChange={() => setDraft((current) => withEquipment(current, item.value))}
          />
        ))}
      </CheckboxGroup>
      {validation !== null && validation !== BLANK_NAME_REASON && (
        <RefusalLine>{validation}</RefusalLine>
      )}
      <SaveStatusLine status={status} />
    </form>
  )
}
