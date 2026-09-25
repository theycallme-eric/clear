/**
 * SET-02 — the location and equipment rules, as pure functions over the rows
 * `locations` and `location_equipment` hold.
 *
 * `src/app/LocationSettings.tsx` renders this and owns nothing else about it.
 * The split is what makes the requirement's three criteria testable without a
 * browser: the optimistic list transforms below are what "CRUD with optimistic
 * updates and rollback on failure" writes into the cache, `deletionRefusal` is
 * "deleting the default forces reassignment first", and `draftFor` produces the
 * equipment list that becomes the next generation's available set.
 *
 * **The vocabularies are onboarding's.** `TIERS` and `EQUIPMENT` are imported
 * from `./onboarding`, not restated, for the reason IA.md §6 gives: onboarding
 * is strictly first-run, so every answer it collects is edited here instead of
 * being asked again. A second equipment list would make that a claim rather than
 * a fact — the day the catalog gains a machine, the editor would silently offer
 * the old set.
 *
 * **Tier is a label; the list is the answer.** `location_equipment` is the
 * authoritative input to eligibility and `locations.tier` is explicitly not a
 * substitute for it (DATA-01b §5). So choosing a tier here does what the wizard's
 * reducer does — replaces the ticked set with that tier's preset — and the ticks
 * are then editable item by item. What generation reads is always the ticks.
 */
import type { Enums } from '../data/database.types'
import { EQUIPMENT, EQUIPMENT_BY_TIER, TIERS, type Option } from './onboarding'
import type { Location, LocationDraft } from './schemas'

type EquipmentTier = Enums<'equipment_tier'>

/** Re-exported so the screen imports one vocabulary, from one place. */
export { EQUIPMENT, TIERS }

/** Why the default location cannot be deleted while another one exists. */
export const DEFAULT_DELETE_REASON =
  'Workouts are generated from this location. Make another one the default first.'

/** Why two locations cannot share a name (`locations_name_unique_per_user`). */
export const DUPLICATE_NAME_REASON = 'You already have a location with that name.'

/** Why a location cannot be saved without one (`locations_name_not_blank`). */
export const BLANK_NAME_REASON = 'Give this location a name.'

// ─────────────────────────────────────────────────────────────────────────────
// Reading the list
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The list in the order the read answers it — default first, then by name
 * (`UserDataClient.locations`).
 *
 * Sorted here as well, because an optimistic write has to leave the list in the
 * order the next read would: a location that jumped to the top on save and back
 * down on refetch is a control that appears to have done something else.
 */
export function orderedLocations(locations: readonly Location[]): Location[] {
  return [...locations].sort(
    (a, b) =>
      Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name),
  )
}

/** The location generation reads when a request names none, or null. */
export function defaultLocation(locations: readonly Location[]): Location | null {
  return locations.find((location) => location.is_default) ?? null
}

/** A location's tier as a person reads it, from the one list of tiers. */
export function tierLabel(tier: EquipmentTier): string {
  return TIERS.find((option) => option.value === tier)?.label ?? tier
}

/** An equipment id as a person reads it. An id the catalog lost is still shown. */
export function equipmentLabel(id: string): string {
  return EQUIPMENT.find((item) => item.value === id)?.label ?? id
}

/**
 * The equipment offered: the catalog's list, plus anything this location already
 * holds that is not in it.
 *
 * `location_equipment.equipment_id` has no foreign key (DATA-01b §5), so a row
 * can name something `EQUIPMENT` does not. Hiding it would be a control that
 * lies twice — the item would stay in the generation's available set while the
 * screen said the location did not have it, and unticking would be impossible.
 */
export function equipmentOptions(held: readonly string[]): readonly Option<string>[] {
  const unknown = held.filter((id) => !EQUIPMENT.some((item) => item.value === id))

  return [...EQUIPMENT, ...unknown.map((id) => ({ value: id, label: id }))]
}

// ─────────────────────────────────────────────────────────────────────────────
// The editor's draft
// ─────────────────────────────────────────────────────────────────────────────

/** A location being created: an unnamed place at the sparsest tier. */
export const NEW_LOCATION_TIER: EquipmentTier = 'minimal'

/** The draft the editor opens with — a new place, or one that exists. */
export function draftFor(
  location: Location | null,
  equipment: readonly string[],
): LocationDraft {
  if (location === null) {
    return {
      id: null,
      name: '',
      tier: NEW_LOCATION_TIER,
      equipment: [...EQUIPMENT_BY_TIER[NEW_LOCATION_TIER]],
    }
  }

  return {
    id: location.id,
    name: location.name,
    tier: location.tier,
    equipment: orderedEquipment(equipment),
  }
}

/**
 * Choosing a tier, and the equipment set it presets.
 *
 * Re-choosing the tier already held changes nothing — the wizard's rule, for the
 * wizard's reason: otherwise every visit to the editor would silently undo the
 * item-by-item edits the editor exists for.
 */
export function withTier(draft: LocationDraft, tier: EquipmentTier): LocationDraft {
  if (draft.tier === tier) return draft

  return { ...draft, tier, equipment: [...EQUIPMENT_BY_TIER[tier]] }
}

export function withName(draft: LocationDraft, name: string): LocationDraft {
  return { ...draft, name }
}

/** Ticking or unticking one item, in the catalog's order so it reads the same twice. */
export function withEquipment(draft: LocationDraft, id: string): LocationDraft {
  const held = new Set(draft.equipment)
  if (held.has(id)) held.delete(id)
  else held.add(id)

  return { ...draft, equipment: orderedEquipment([...held]) }
}

/** The catalog's order, with anything it does not know kept and put last. */
export function orderedEquipment(equipment: readonly string[]): string[] {
  const held = new Set(equipment)
  const known = EQUIPMENT.map((item) => item.value).filter((id) => held.has(id))
  const unknown = [...held].filter((id) => !EQUIPMENT.some((item) => item.value === id))

  return [...known, ...unknown.sort()]
}

/**
 * Why this draft cannot be saved, or null when it can.
 *
 * Both reasons are constraints the database holds — `locations_name_not_blank`
 * and `locations_name_unique_per_user` — answered here so the user reads a
 * sentence instead of a constraint name, and so a save that would fail is never
 * written into the cache optimistically in the first place.
 */
export function draftRefusal(
  draft: LocationDraft,
  locations: readonly Location[],
): string | null {
  if (draft.name.trim() === '') return BLANK_NAME_REASON

  const taken = locations.some(
    (location) =>
      location.id !== draft.id &&
      location.name.trim().toLowerCase() === draft.name.trim().toLowerCase(),
  )

  return taken ? DUPLICATE_NAME_REASON : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Optimistic list transforms
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The list as it stands once `location` is stored — replacing the row with that
 * id, or adding it.
 *
 * `is_default` is carried from the answer rather than from the draft: a created
 * location is the default exactly when the user had none (`save_location` §1),
 * which is a fact the database decides and the screen must not guess.
 */
export function withLocation(
  locations: readonly Location[],
  location: Location,
): Location[] {
  const known = locations.some((existing) => existing.id === location.id)

  return orderedLocations(
    known
      ? locations.map((existing) => (existing.id === location.id ? location : existing))
      : [...locations, location],
  )
}

/** The list without that location. Its equipment goes with it (cascade). */
export function withoutLocation(
  locations: readonly Location[],
  locationId: string,
): Location[] {
  return orderedLocations(
    locations.filter((location) => location.id !== locationId),
  )
}

/**
 * The list with the default moved — exactly one row `is_default`, which is what
 * the database will hold once `set_default_location` commits, so the optimistic
 * list and the refetched one agree.
 */
export function withDefault(
  locations: readonly Location[],
  locationId: string,
): Location[] {
  return orderedLocations(
    locations.map((location) => ({
      ...location,
      is_default: location.id === locationId,
    })),
  )
}

/**
 * Why this location cannot be deleted, or null when it can.
 *
 * The default is refusable and the reason is the requirement: deleting it forces
 * reassignment first. The last location is not — a user who has no locations has
 * no default because there is nothing to be default, which DATA-01b §4 allows
 * explicitly, and generation then reports an over-constrained request rather
 * than composing from equipment nobody has.
 */
export function deletionRefusal(
  locations: readonly Location[],
  locationId: string,
): string | null {
  const location = locations.find((candidate) => candidate.id === locationId)
  if (location === undefined || !location.is_default) return null

  return locations.length > 1 ? DEFAULT_DELETE_REASON : null
}

/** The places that could take the default from this one, in the list's order. */
export function reassignmentOptions(
  locations: readonly Location[],
  locationId: string,
): Location[] {
  return orderedLocations(locations).filter((location) => location.id !== locationId)
}
