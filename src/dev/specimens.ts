/**
 * DS-07 — the export's specimen cards, catalogued rather than recreated.
 *
 * REQ-029 is explicit: *serve them; do not recreate them*. So nothing here
 * renders a specimen. Each card is read as raw text for the one thing the
 * gallery needs in order to frame it — the `@dsCard` descriptor the export
 * writes as the card's second line — and the file itself is then handed to the
 * browser byte-for-byte by the dev middleware in `specimen-server.ts` and
 * displayed in an iframe at its declared viewport.
 *
 * Reading the raw text is not importing a component internal: the cards are
 * mandatory *visual references* (ATOMIC.md §1), never production modules, and
 * the whole of `src/dev/` is excluded from production bundles.
 *
 * Discovery is a glob over the vendored tree, so the next export's cards are
 * whatever the next export ships. Of the 40 specimen files it carries, 38 —
 * the count REQ-029 names — declare a `@dsCard` descriptor; the two that do
 * not (`preview/component-buttons.html`, `preview/component-cards.html`) are
 * superseded by the per-component cards and are still served, under the group
 * below, so the gallery hides nothing the export ships.
 */
import { SPECIMEN_BASE } from './specimen-url'

/** Group heading for a specimen file the export left undescribed. */
export const UNDESCRIBED_GROUP = 'Undescribed previews'

/** Frame size for an undescribed card, which declares no viewport of its own. */
export const DEFAULT_VIEWPORT = { width: 700, height: 360 } as const

/** The `@dsCard` descriptor the export writes into each specimen's second line. */
export interface SpecimenDescriptor {
  /** The export's own grouping: Foundation, Colors, Components, … */
  group: string
  name: string
  subtitle: string | null
  /** Declared frame size, from `viewport="700x360"`. */
  width: number
  height: number
}

export interface Specimen {
  /** Path inside the vendored export, e.g. `preview/skins.html`. */
  file: string
  /** URL the iframe loads; the dev middleware serves the file unmodified. */
  url: string
  /** Null when the export shipped the card without a descriptor. */
  descriptor: SpecimenDescriptor | null
  /** Heading the card sits under. */
  group: string
  /** Display name: the descriptor's, else the file's own stem. */
  name: string
  width: number
  height: number
}

const DESCRIPTOR_COMMENT = /<!--\s*@dsCard\s+([\s\S]*?)-->/
// Attribute values are double-quoted and may contain escaped quotes, as
// `subtitle="… not \"the accessible skin\" …"` does.
const ATTRIBUTE = /([A-Za-z]+)="((?:[^"\\]|\\.)*)"/g
const VIEWPORT = /^(\d+)x(\d+)$/

function unescapeValue(value: string): string {
  return value.replace(/\\(.)/g, '$1')
}

/** Reads the descriptor out of a specimen's raw markup, or null if it has none. */
export function parseDescriptor(html: string): SpecimenDescriptor | null {
  const comment = DESCRIPTOR_COMMENT.exec(html)
  if (comment === null) return null

  const attributes = new Map<string, string>()
  for (const [, key, value] of comment[1].matchAll(ATTRIBUTE)) {
    attributes.set(key, unescapeValue(value))
  }

  const name = attributes.get('name')
  const group = attributes.get('group')
  if (name === undefined || group === undefined) return null

  const viewport = VIEWPORT.exec(attributes.get('viewport') ?? '')

  return {
    group,
    name,
    subtitle: attributes.get('subtitle') ?? null,
    width: viewport === null ? DEFAULT_VIEWPORT.width : Number(viewport[1]),
    height: viewport === null ? DEFAULT_VIEWPORT.height : Number(viewport[2]),
  }
}

/** `preview/skins.html` → `Skins`, for a card the export left undescribed. */
function nameFromFile(file: string): string {
  const stem = file.split('/').at(-1)?.replace(/\.html$/, '') ?? file
  const base = stem === 'card' ? (file.split('/').at(-2) ?? stem) : stem
  return base
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** Builds one catalogue entry. Exported for the coverage test's own arithmetic. */
export function describeSpecimen(file: string, html: string): Specimen {
  const descriptor = parseDescriptor(html)

  return {
    file,
    url: SPECIMEN_BASE + file,
    descriptor,
    group: descriptor?.group ?? UNDESCRIBED_GROUP,
    name: descriptor?.name ?? nameFromFile(file),
    width: descriptor?.width ?? DEFAULT_VIEWPORT.width,
    height: descriptor?.height ?? DEFAULT_VIEWPORT.height,
  }
}

const VENDOR_PREFIX = '../design-system/'

// Raw text, eagerly: the whole specimen surface is ~200KB, this module only
// ever loads inside the dev-only gallery chunk, and a descriptor that is read
// at module scope cannot go stale against the file it came from.
const RAW_SPECIMENS: Record<string, string> = {
  ...import.meta.glob('../design-system/preview/*.html', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  ...import.meta.glob('../design-system/components/*/card.html', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
}

/** Every specimen card the vendored export ships, in a stable order. */
export const SPECIMENS: readonly Specimen[] = Object.entries(RAW_SPECIMENS)
  .map(([key, html]) => describeSpecimen(key.replace(VENDOR_PREFIX, ''), html))
  .sort((a, b) => a.file.localeCompare(b.file))

/** The export's own groups, in first-appearance order, each with its cards. */
export const SPECIMEN_GROUPS: readonly {
  group: string
  specimens: readonly Specimen[]
}[] = (() => {
  const byGroup = new Map<string, Specimen[]>()
  for (const specimen of SPECIMENS) {
    const bucket = byGroup.get(specimen.group)
    if (bucket === undefined) byGroup.set(specimen.group, [specimen])
    else bucket.push(specimen)
  }
  // The undescribed previews sit last: they are what the export superseded.
  return [...byGroup]
    .map(([group, specimens]) => ({ group, specimens }))
    .sort((a, b) => Number(a.group === UNDESCRIBED_GROUP) - Number(b.group === UNDESCRIBED_GROUP))
})()

/** Cards carrying a descriptor — the 38 REQ-029 counts. */
export const DESCRIBED_SPECIMENS: readonly Specimen[] = SPECIMENS.filter(
  (specimen) => specimen.descriptor !== null,
)
