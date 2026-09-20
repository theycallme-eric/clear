import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// CORE-05: the document shell carries the language, the default title, and a
// viewport that never blocks zoom. These live in index.html, outside React,
// so assert on the shipped file itself.
const html = readFileSync(
  resolve(import.meta.dirname, '../../index.html'),
  'utf-8',
)

describe('document shell (CORE-05)', () => {
  it('declares the document language on <html>', () => {
    expect(html).toMatch(/<html[^>]*\slang="en"/)
  })

  it('ships a default title for the pre-hydration document', () => {
    expect(html).toMatch(/<title>CLEAR<\/title>/)
  })

  it('uses a viewport that does not block zoom', () => {
    const viewport = html.match(
      /<meta name="viewport" content="([^"]*)"/,
    )?.[1]

    expect(viewport).toBeDefined()
    expect(viewport).toContain('width=device-width')
    expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)/)
    expect(viewport).not.toContain('maximum-scale')
    expect(viewport).not.toContain('minimum-scale')
  })
})
