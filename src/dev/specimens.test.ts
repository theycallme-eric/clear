/**
 * "The export's 43 preview/component review pages served **unmodified**" — both halves, proved
 * against the vendored tree rather than against a list.
 *
 * The catalogue half checks that the glob reaches every specimen file the export
 * ships and reads each descriptor as written. The serving half drives the dev
 * middleware directly and compares what it writes with the bytes on disk, which
 * is what "unmodified" means and what a running dev server could only
 * demonstrate less precisely.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveSpecimenRequest } from './specimen-server'
import { SPECIMEN_BASE, VENDOR_DIR } from './specimen-url'
import {
  DESCRIBED_SPECIMENS,
  parseDescriptor,
  SPECIMEN_GROUPS,
  SPECIMENS,
  UNDESCRIBED_GROUP,
} from './specimens'

const ROOT = resolve(import.meta.dirname, '../..')
const VENDOR_ROOT = resolve(ROOT, VENDOR_DIR)

/** Every specimen file in the vendored export, read from disk, not from a list. */
function specimenFilesOnDisk(): string[] {
  const files: string[] = []

  for (const entry of readdirSync(resolve(VENDOR_ROOT, 'preview'))) {
    if (entry.endsWith('.html')) files.push(`preview/${entry}`)
  }
  for (const entry of readdirSync(resolve(VENDOR_ROOT, 'components'), {
    withFileTypes: true,
  })) {
    if (entry.isDirectory()) files.push(`components/${entry.name}/card.html`)
  }

  return files.sort()
}

describe('the specimen catalogue', () => {
  it('reaches every specimen file the export ships', () => {
    expect(SPECIMENS.map((specimen) => specimen.file)).toEqual(
      specimenFilesOnDisk(),
    )
  })

  it('finds a descriptor on every marked 0.14.3 review page', () => {
    // The count is derived, not asserted into existence: every file carrying a
    // `@dsCard` comment, which is all 43 review pages the 0.14.3 export ships.
    const marked = specimenFilesOnDisk().filter((file) =>
      readFileSync(resolve(VENDOR_ROOT, file), 'utf-8').includes('@dsCard'),
    )

    expect(DESCRIBED_SPECIMENS).toHaveLength(marked.length)
    expect(DESCRIBED_SPECIMENS).toHaveLength(43)
    expect(SPECIMENS).toHaveLength(43)
  })

  it('reads a descriptor exactly as the export wrote it', () => {
    const skins = SPECIMENS.find(
      (specimen) => specimen.file === 'preview/skins.html',
    )

    expect(skins?.descriptor?.group).toBe('Foundation')
    expect(skins?.descriptor?.name).toBe('Skins')
    expect(skins?.descriptor?.subtitle).toContain('Four identities, one system')
    expect(skins?.width).toBe(700)
    expect(skins?.height).toBe(420)
    expect(skins?.url).toBe(`${SPECIMEN_BASE}preview/skins.html`)
  })

  it('unescapes a quoted phrase inside a subtitle', () => {
    const mono = parseDescriptor(
      readFileSync(resolve(VENDOR_ROOT, 'preview/mono-skin.html'), 'utf-8'),
    )

    expect(mono?.subtitle).toContain('"the accessible skin"')
  })

  it('does not invent undescribed previews when every shipped page has a descriptor', () => {
    const undescribed = SPECIMENS.filter(
      (specimen) => specimen.descriptor === null,
    )

    expect(undescribed.map((specimen) => specimen.file)).toEqual([])
    expect(undescribed.map((specimen) => specimen.name)).toEqual([])
    expect(SPECIMEN_GROUPS.map((group) => group.group)).not.toContain(UNDESCRIBED_GROUP)
  })

  it('groups every card under exactly one heading', () => {
    const grouped = SPECIMEN_GROUPS.flatMap((group) => group.specimens)

    expect(grouped).toHaveLength(SPECIMENS.length)
    expect(new Set(SPECIMEN_GROUPS.map((group) => group.group)).size).toBe(
      SPECIMEN_GROUPS.length,
    )
  })
})

describe('the specimen middleware', () => {
  it('serves a specimen card byte for byte', () => {
    const request = resolveSpecimenRequest(
      `${SPECIMEN_BASE}preview/skins.html`,
      ROOT,
    )

    expect(request?.contentType).toBe('text/html; charset=utf-8')
    expect(readFileSync(request!.path)).toEqual(
      readFileSync(resolve(VENDOR_ROOT, 'preview/skins.html')),
    )
  })

  it('answers a card’s own relative references', () => {
    // `preview/skins.html` links `../styles.css`; a component card loads
    // `../../_ds_bundle.js`. Both must come back as themselves, with the type
    // the browser needs, or the card renders unstyled or inert.
    const styles = resolveSpecimenRequest(`${SPECIMEN_BASE}styles.css`, ROOT)
    const bundle = resolveSpecimenRequest(
      `${SPECIMEN_BASE}_ds_bundle.js`,
      ROOT,
    )
    const layer = resolveSpecimenRequest(
      `${SPECIMEN_BASE}css/foundation.css`,
      ROOT,
    )

    expect(styles?.contentType).toBe('text/css; charset=utf-8')
    expect(bundle?.contentType).toBe('text/javascript; charset=utf-8')
    expect(layer?.contentType).toBe('text/css; charset=utf-8')
    expect(readFileSync(styles!.path, 'utf-8')).toBe(
      readFileSync(resolve(VENDOR_ROOT, 'styles.css'), 'utf-8'),
    )
  })

  it('serves every catalogued card', () => {
    for (const specimen of SPECIMENS) {
      const request = resolveSpecimenRequest(specimen.url, ROOT)
      expect(request, specimen.file).not.toBeNull()
      expect(request?.path).toBe(resolve(VENDOR_ROOT, specimen.file))
    }
  })

  it('ignores a query string, as a browser cache-buster would add', () => {
    expect(
      resolveSpecimenRequest(`${SPECIMEN_BASE}preview/skins.html?v=2`, ROOT)?.path,
    ).toBe(resolve(VENDOR_ROOT, 'preview/skins.html'))
  })

  it('serves the export and nothing else', () => {
    // Traversal, encoded traversal, a file type no specimen references, and any
    // URL outside the prefix: all fall through to Vite rather than being read.
    for (const url of [
      `${SPECIMEN_BASE}../../package.json`,
      `${SPECIMEN_BASE}..%2F..%2Fpackage.json`,
      `${SPECIMEN_BASE}../app/router.tsx`,
      `${SPECIMEN_BASE}README.md`,
      `${SPECIMEN_BASE}`,
      '/src/design-system/preview/skins.html',
      '/dev/gallery/ds',
    ]) {
      expect(resolveSpecimenRequest(url, ROOT), url).toBeNull()
    }
  })
})
