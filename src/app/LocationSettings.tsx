/**
 * SET-02 — `/settings/locations`.
 *
 * Locations and their equipment are edited together because generation reads
 * the same pair together. List mutations publish to the query cache before the
 * request resolves and restore the previous list on failure. Equipment is
 * replaced transactionally by `save_location`, so the next generation sees
 * exactly what this screen last saved.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  AppHeader,
  ArrowLeft,
  Button,
  Check,
  Checkbox,
  ChoiceGroup,
  ClearLogo,
  EmptyState,
  Input,
  Pencil,
  Plus,
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
import { useQueryClient } from '../state/query'
import type { Location, LocationDraft } from '../state/schemas'
import {
  locationEquipmentQueryKey,
  locationsQueryKey,
  useLocationEquipmentQuery,
  useLocationsQuery,
  useUserData,
} from '../state/user-queries'
import { Card } from '../ui/card'
import { Heading } from '../ui/Heading'
import { SaveStatusLine, useInlineSave } from '../ui/inline-save'
import { ConfirmDialog } from '../ui/blocking-dialog'
import { Screen } from './Screen'

type EditorTarget = Location | 'new' | null

export function LocationSettings() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const userData = useUserData()
  const cache = useQueryClient()
  const query = useLocationsQuery()
  const { status, save } = useInlineSave()
  const [editor, setEditor] = useState<EditorTarget>(null)
  const [pendingDelete, setPendingDelete] = useState<Location | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)

  const locations = query.state.status === 'ready' ? query.state.data : []
  const key = user === null ? null : locationsQueryKey(user.id)

  async function makeDefault(location: Location) {
    if (key === null || location.is_default) return
    const previous = locations
    setRefusal(null)
    cache.setData(key, withDefault(previous, location.id))
    await save(
      () => userData.setDefaultLocation(location.id),
      () => cache.setData(key, previous),
    )
  }

  async function remove(location: Location) {
    if (key === null) return
    const reason = deletionRefusal(locations, location.id)
    if (reason !== null) {
      setPendingDelete(null)
      setRefusal(reason)
      return
    }

    const previous = locations
    setPendingDelete(null)
    setRefusal(null)
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
      <Screen title="Places and equipment">
        <div className="clr-stack">
          <p>Generation uses the default place and the equipment saved with it.</p>

          {refusal !== null && <p role="alert">{refusal}</p>}

          {query.state.status === 'loading' && <p role="status">Reading your places…</p>}
          {query.state.status === 'error' && (
            <EmptyState
              title="Your places didn’t load"
              message={query.state.error.message}
              actionLabel="Try again"
              onAction={query.refetch}
            />
          )}
          {query.state.status === 'ready' && (
            <>
              {locations.length === 0 ? (
                <EmptyState
                  title="No places yet"
                  message="Add where you train and what equipment is available there."
                  actionLabel="Add place"
                  onAction={() => setEditor('new')}
                />
              ) : (
                <div className="clr-stack">
                  {locations.map((location) => (
                    <LocationCard
                      key={location.id}
                      location={location}
                      onEdit={() => setEditor(location)}
                      onDefault={() => void makeDefault(location)}
                      onDelete={() => {
                        const reason = deletionRefusal(locations, location.id)
                        if (reason !== null) {
                          setRefusal(reason)
                          return
                        }
                        setPendingDelete(location)
                      }}
                    />
                  ))}
                  <Button
                    variant="secondary"
                    icon={<Plus size={20} />}
                    onClick={() => setEditor('new')}
                  >
                    Add place
                  </Button>
                </div>
              )}

              {editor !== null && (
                <LocationEditor
                  key={editor === 'new' ? 'new' : editor.id}
                  location={editor === 'new' ? null : editor}
                  locations={locations}
                  onClose={() => setEditor(null)}
                />
              )}
            </>
          )}

          <SaveStatusLine status={status} />
        </div>
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

function LocationCard({
  location,
  onEdit,
  onDefault,
  onDelete,
}: {
  location: Location
  onEdit: () => void
  onDefault: () => void
  onDelete: () => void
}) {
  return (
    <Card>
      <div className="clr-stack clr-stack--tight">
        <Heading>{location.name}</Heading>
        <p>
          {tierLabel(location.tier)}
          {location.is_default ? ' · Default for generation' : ''}
        </p>
        <div className="clr-row">
          <Button variant="quiet" icon={<Pencil size={20} />} onClick={onEdit}>
            Edit
          </Button>
          {!location.is_default && (
            <Button variant="secondary" icon={<Check size={20} />} onClick={onDefault}>
              Make default
            </Button>
          )}
          <Button variant="critical" icon={<Trash size={20} />} onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Card>
  )
}

function LocationEditor({
  location,
  locations,
  onClose,
}: {
  location: Location | null
  locations: readonly Location[]
  onClose: () => void
}) {
  const equipmentQuery = useLocationEquipmentQuery(location?.id ?? null)

  if (location !== null && equipmentQuery.state.status === 'loading') {
    return <p role="status">Reading {location.name} equipment…</p>
  }
  if (location !== null && equipmentQuery.state.status === 'error') {
    return (
      <EmptyState
        title="This equipment list didn’t load"
        message={equipmentQuery.state.error.message}
        actionLabel="Try again"
        onAction={equipmentQuery.refetch}
      />
    )
  }

  const equipment =
    location === null || equipmentQuery.state.status !== 'ready'
      ? []
      : equipmentQuery.state.data

  return (
    <LocationEditorForm
      location={location}
      locations={locations}
      initialDraft={draftFor(location, equipment)}
      onClose={onClose}
    />
  )
}

function LocationEditorForm({
  location,
  locations,
  initialDraft,
  onClose,
}: {
  location: Location | null
  locations: readonly Location[]
  initialDraft: LocationDraft
  onClose: () => void
}) {
  const { user } = useAuth()
  const userData = useUserData()
  const cache = useQueryClient()
  const { status, save } = useInlineSave()
  const [draft, setDraft] = useState(initialDraft)
  const [validation, setValidation] = useState<string | null>(null)

  const key = user === null ? null : locationsQueryKey(user.id)

  async function store() {
    if (user === null || key === null) return
    const normalized = { ...draft, name: draft.name.trim() }
    const reason = draftRefusal(normalized, locations)
    if (reason !== null) {
      setValidation(reason)
      return
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
  }

  return (
    <Card>
      <div className="clr-stack">
        <Heading>{location === null ? 'Add place' : `Edit ${location.name}`}</Heading>
        <Input
          label="Name"
          name="location_name"
          value={draft.name}
          onChange={(name) => setDraft((current) => withName(current, name))}
          errorText={validation === BLANK_NAME_REASON ? validation : undefined}
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
        <fieldset className="clr-stack clr-stack--tight">
          <legend className="label">Equipment</legend>
          {equipmentOptions(draft.equipment).map((item) => (
            <Checkbox
              key={item.value}
              label={equipmentLabel(item.value)}
              checked={draft.equipment.includes(item.value)}
              onChange={() => setDraft((current) => withEquipment(current, item.value))}
            />
          ))}
        </fieldset>
        {validation !== null && validation !== BLANK_NAME_REASON && (
          <p role="alert">{validation}</p>
        )}
        <div className="clr-row">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={status === 'saving'} onClick={() => void store()}>
            Save place
          </Button>
        </div>
        <SaveStatusLine status={status} />
      </div>
    </Card>
  )
}
