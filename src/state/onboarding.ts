/**
 * ONB-01 — the onboarding wizard as data and one pure reducer.
 *
 * `src/app/Onboarding.tsx` renders this and owns nothing else about it. The
 * split is what makes two of the requirement's acceptance criteria testable
 * without a browser: "back-navigation preserves entered values" is a property
 * of a draft that lives above the step rather than inside it, and "every
 * preference lands correctly" is `toAnswers` — one function from the draft to
 * the payload `complete_onboarding` receives.
 *
 * Three things the vocabularies below are, and one thing they are not.
 *
 *   * **Equipment ids are the catalog's.** DATA-01a models equipment as the
 *     text ids inside `exercise_definitions.equipment_options`, and
 *     `location_equipment.equipment_id` has no foreign key to check them, so
 *     an id invented here would silently make no exercise eligible. Every id
 *     in `EQUIPMENT` appears in `supabase/seed/010_exercise_definitions.sql`,
 *     and `onboarding.test.ts` reads that file to prove it.
 *   * **Sections and patterns are the enums.** They come from `Constants`
 *     rather than a second list, so a migration that adds a section makes this
 *     module fail to compile rather than quietly omit it.
 *   * **Goals are four of the five.** `active_recovery` is a way to train
 *     today, not a thing to set up as a default — the previous application
 *     filtered it out of onboarding for the same reason, and GEN-02a's
 *     `generation_sections` overrides the profile's toggles for it anyway.
 *
 * What it is not is a mirror of the December wireframe's literal fields. That
 * document predates the rebuilt schema: it stores equipment as a text array,
 * limitations as prose on `profiles`, and a "Quick & effective" goal migration
 * 00020 removed. Each of those has a rebuilt home — `location_equipment`,
 * `user_constraints`, and the four surviving presets — and this module targets
 * the schema rather than the drawing.
 */
import { Constants } from '../data/database.types'
import type {
  Database,
} from '../data/database.types'
import type { OnboardingAnswers } from './schemas'

type EquipmentTier = Database['public']['Enums']['equipment_tier']
type ExperienceLevel = Database['public']['Enums']['experience_level']
type GoalPreset = Database['public']['Enums']['goal_preset']
type SectionType = Database['public']['Enums']['section_type']
type MovementPattern = Database['public']['Enums']['movement_pattern']

// ─────────────────────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────────────────────

/** The five steps, in order. The wizard's whole route is this array. */
export const ONBOARDING_STEPS = [
  'location',
  'experience',
  'goals',
  'limitations',
  'confirm',
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/** Every step's own heading — the question, asked once. */
export const STEP_TITLES: Record<OnboardingStep, string> = {
  location: 'What’s your gym setup?',
  experience: 'How familiar are you with the gym?',
  goals: 'What are you going for?',
  limitations: 'Anything we should work around?',
  confirm: 'Here’s your setup',
}

export function stepNumber(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step) + 1
}

// ─────────────────────────────────────────────────────────────────────────────
// Vocabularies
// ─────────────────────────────────────────────────────────────────────────────

export interface Option<T extends string> {
  readonly value: T
  readonly label: string
  readonly description?: string
}

/** Catalog equipment ids, with the name a person would use for them. */
export const EQUIPMENT: readonly Option<string>[] = [
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'resistance_bands', label: 'Resistance bands' },
  { value: 'foam_roller', label: 'Foam roller' },
  { value: 'dumbbells', label: 'Dumbbells' },
  { value: 'kettlebells', label: 'Kettlebells' },
  { value: 'pullup_bar', label: 'Pull-up bar' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'box', label: 'Plyo box' },
  { value: 'cable_machine', label: 'Cable machine' },
  { value: 'rowing_machine', label: 'Rowing machine' },
  { value: 'assault_bike', label: 'Assault bike' },
  { value: 'battle_ropes', label: 'Battle ropes' },
  { value: 'assisted_pullup_dip', label: 'Assisted pull-up / dip' },
  { value: 'leg_press', label: 'Leg press' },
  { value: 'leg_curl_extension', label: 'Leg curl / extension' },
  { value: 'hack_squat', label: 'Hack squat' },
] as const

/**
 * What each tier starts you with. Cumulative on purpose — a fuller gym has
 * everything a sparser one has — so the accordion is an edit to a sensible
 * answer rather than a list to build from nothing.
 */
const MINIMAL = ['bodyweight', 'resistance_bands', 'foam_roller'] as const
const HOME = [...MINIMAL, 'dumbbells', 'kettlebells', 'pullup_bar'] as const
const BUILDING = [...HOME, 'barbell', 'box', 'cable_machine', 'rowing_machine'] as const
const FULL = [
  ...BUILDING,
  'assault_bike',
  'battle_ropes',
  'assisted_pullup_dip',
  'leg_press',
  'leg_curl_extension',
  'hack_squat',
] as const

export const EQUIPMENT_BY_TIER: Record<EquipmentTier, readonly string[]> = {
  minimal: MINIMAL,
  home: HOME,
  building: BUILDING,
  full: FULL,
}

export const TIERS: readonly Option<EquipmentTier>[] = [
  { value: 'minimal', label: 'Minimal', description: 'Bodyweight, bands, a roller' },
  { value: 'home', label: 'Home gym', description: 'Dumbbells, kettlebells, a bar to hang from' },
  { value: 'building', label: 'Building gym', description: 'Barbell, cables, a rower' },
  { value: 'full', label: 'Full gym', description: 'Commercial floor — machines and all' },
] as const

export const EXPERIENCE_LEVELS: readonly Option<ExperienceLevel>[] = [
  {
    value: 'new',
    label: 'New to this',
    description: 'Still learning the movements. More guidance is helpful.',
  },
  {
    value: 'some',
    label: 'Some experience',
    description: 'Know the basics. Comfortable with common exercises.',
  },
  {
    value: 'confident',
    label: 'Confident',
    description: 'Just tell me what to do. I’ll figure it out.',
  },
] as const

export const GOALS: readonly Option<GoalPreset>[] = [
  { value: 'strength', label: 'Strength', description: 'Heavy lifts, longer rest' },
  { value: 'hypertrophy', label: 'Hypertrophy', description: 'Volume and time under tension' },
  { value: 'conditioning', label: 'Conditioning', description: 'Circuits, shorter rest' },
  { value: 'balanced', label: 'Balanced', description: 'A little of everything' },
] as const

/** Which sections a preset turns on. The accordion edits the result. */
export const SECTIONS_BY_GOAL: Record<GoalPreset, readonly SectionType[]> = {
  strength: ['warmup', 'primary_lift', 'accessory', 'core', 'cooldown'],
  hypertrophy: ['warmup', 'primary_lift', 'accessory', 'core', 'cooldown'],
  conditioning: ['warmup', 'conditioning', 'core', 'cooldown'],
  balanced: [
    'warmup',
    'mobility',
    'primary_lift',
    'accessory',
    'core',
    'conditioning',
    'cooldown',
  ],
  // Not offered by this screen (see the header); present so the record stays
  // total over the enum rather than partial over the four that are.
  active_recovery: ['warmup', 'mobility', 'cooldown'],
}

const SECTION_COPY: Record<SectionType, Option<SectionType>> = {
  warmup: {
    value: 'warmup',
    label: 'Warm-up',
    description: 'Light movement to get your body ready',
  },
  mobility: {
    value: 'mobility',
    label: 'Mobility',
    description: 'Focused flexibility and range of motion work',
  },
  primary_lift: {
    value: 'primary_lift',
    label: 'Primary lift',
    description: 'The main heavy movement — squats, deadlifts, presses',
  },
  accessory: {
    value: 'accessory',
    label: 'Accessory',
    description: 'Supporting work for the primary lift',
  },
  skill_power: {
    value: 'skill_power',
    label: 'Skill / power',
    description: 'Explosive movements — jumps, throws, Olympic lifts',
  },
  carries: {
    value: 'carries',
    label: 'Carries',
    description: 'Loaded carries — farmer’s walks, suitcase carry',
  },
  core: {
    value: 'core',
    label: 'Core',
    description: 'Rotational and stability work for your midsection',
  },
  stability_balance: {
    value: 'stability_balance',
    label: 'Stability / balance',
    description: 'Single-leg work, proprioception focus',
  },
  conditioning: {
    value: 'conditioning',
    label: 'Conditioning',
    description: 'Cardio, circuits, or higher-intensity finishers',
  },
  cooldown: {
    value: 'cooldown',
    label: 'Cooldown',
    description: 'Stretching and recovery to end the session',
  },
}

/** Every section the enum has, in the enum's order. */
export const SECTIONS: readonly Option<SectionType>[] =
  Constants.public.Enums.section_type.map((section) => SECTION_COPY[section])

const PATTERN_LABELS: Record<MovementPattern, string> = {
  squat: 'Squatting',
  hinge: 'Hinging — deadlifts, swings',
  press: 'Pressing',
  pull: 'Pulling',
  power: 'Explosive work — jumps, throws',
  unilateral: 'Single-leg and single-arm work',
  conditioning: 'Hard conditioning',
}

export const MOVEMENT_PATTERNS: readonly Option<MovementPattern>[] =
  Constants.public.Enums.movement_pattern.map((pattern) => ({
    value: pattern,
    label: PATTERN_LABELS[pattern],
  }))

// ─────────────────────────────────────────────────────────────────────────────
// The draft
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything the user has entered, at any point in the wizard.
 *
 * It is one flat object rather than a value per step, and that is the whole of
 * "back-navigation preserves entered values": the step index is a separate
 * piece of state that nothing here reads, so moving between steps cannot
 * discard anything by construction.
 */
export interface OnboardingDraft {
  readonly tier: EquipmentTier | null
  readonly equipment: readonly string[]
  readonly experience: ExperienceLevel | null
  readonly goal: GoalPreset | null
  readonly sections: readonly SectionType[]
  readonly avoidPatterns: readonly MovementPattern[]
  readonly note: string
}

/** Nothing answered. Every step starts as a question, not as a default. */
export const EMPTY_DRAFT: OnboardingDraft = {
  tier: null,
  equipment: [],
  experience: null,
  goal: null,
  sections: [],
  avoidPatterns: [],
  note: '',
}

export type OnboardingAction =
  | { readonly type: 'tier'; readonly value: EquipmentTier }
  | { readonly type: 'equipment'; readonly value: string }
  | { readonly type: 'experience'; readonly value: ExperienceLevel }
  | { readonly type: 'goal'; readonly value: GoalPreset }
  | { readonly type: 'section'; readonly value: SectionType }
  | { readonly type: 'pattern'; readonly value: MovementPattern }
  | { readonly type: 'note'; readonly value: string }

function toggle<T>(list: readonly T[], value: T): readonly T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

/** Keeps a toggled set in its vocabulary's order, so it reads the same twice. */
function ordered<T>(vocabulary: readonly T[], chosen: readonly T[]): readonly T[] {
  return vocabulary.filter((item) => chosen.includes(item))
}

/**
 * The reducer. Two rules are worth stating because they are the difference
 * between a preset and a trap:
 *
 *   * Picking a tier or a goal **replaces** the set it presets — that is what
 *     the wireframe means by "populates equipment toggles".
 *   * Picking the one already picked replaces nothing. Otherwise every return
 *     visit to step 1 would silently undo the edits the accordion was for, and
 *     "back-navigation preserves entered values" would be false for exactly
 *     the users who used it.
 */
export function onboardingReducer(
  draft: OnboardingDraft,
  action: OnboardingAction,
): OnboardingDraft {
  switch (action.type) {
    case 'tier':
      if (draft.tier === action.value) return draft
      return {
        ...draft,
        tier: action.value,
        equipment: EQUIPMENT_BY_TIER[action.value],
      }
    case 'equipment':
      return {
        ...draft,
        equipment: ordered(
          EQUIPMENT.map((item) => item.value),
          toggle(draft.equipment, action.value),
        ),
      }
    case 'experience':
      return { ...draft, experience: action.value }
    case 'goal':
      if (draft.goal === action.value) return draft
      return { ...draft, goal: action.value, sections: SECTIONS_BY_GOAL[action.value] }
    case 'section':
      return {
        ...draft,
        sections: ordered(
          Constants.public.Enums.section_type,
          toggle(draft.sections, action.value),
        ),
      }
    case 'pattern':
      return {
        ...draft,
        avoidPatterns: ordered(
          Constants.public.Enums.movement_pattern,
          toggle(draft.avoidPatterns, action.value),
        ),
      }
    case 'note':
      return { ...draft, note: action.value }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// What a step needs, and what the whole thing produces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Why a step cannot be left yet, or null when it can.
 *
 * A sentence rather than a boolean: a disabled Next with no reason attached is
 * a dead control, and the screen puts this text where the control is.
 */
export function blockedReason(step: OnboardingStep, draft: OnboardingDraft): string | null {
  switch (step) {
    case 'location':
      return draft.tier === null ? 'Choose the setup closest to yours.' : null
    case 'experience':
      return draft.experience === null ? 'Choose the description that fits you.' : null
    case 'goals':
      if (draft.goal === null) return 'Choose what you’re training for.'
      // `profiles_enabled_sections_not_empty`. Unticking every section is the
      // one edit the accordion allows that the database will not hold.
      return draft.sections.length === 0 ? 'A workout needs at least one section.' : null
    // Limitations are optional — this is the step the wireframe gives a skip.
    case 'limitations':
    case 'confirm':
      return null
  }
}

export function canAdvance(step: OnboardingStep, draft: OnboardingDraft): boolean {
  return blockedReason(step, draft) === null
}

/** The default location's name. Derived, because the wizard never asks. */
export function locationName(tier: EquipmentTier): string {
  return TIERS.find((option) => option.value === tier)?.label ?? tier
}

export function labelOf<T extends string>(
  options: readonly Option<T>[],
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value
}

/**
 * The draft as the payload `complete_onboarding` receives, or `null` when it
 * is not one yet.
 *
 * Null rather than a thrown error or a half-filled payload: the screen only
 * reaches the commit through `canAdvance` on every step before it, so a null
 * here means the wizard was driven somewhere it cannot be driven by hand, and
 * the button that would have sent it is disabled instead.
 */
export function toAnswers(draft: OnboardingDraft): OnboardingAnswers | null {
  if (draft.tier === null || draft.experience === null || draft.goal === null) return null
  if (draft.sections.length === 0) return null

  const note = draft.note.trim()

  return {
    location_name: locationName(draft.tier),
    location_tier: draft.tier,
    equipment: [...draft.equipment],
    experience_level: draft.experience,
    goal_preset: draft.goal,
    enabled_sections: [...draft.sections],
    avoid_patterns: [...draft.avoidPatterns],
    // A note with nothing to attach it to is not context, it is a stray row's
    // worth of text. DATA-05 only stores it on a constraint.
    note: note === '' || draft.avoidPatterns.length === 0 ? null : note,
  }
}
