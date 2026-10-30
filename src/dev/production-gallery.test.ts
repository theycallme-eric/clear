/**
 * LIB-001: a real production build contains the public library while keeping
 * account startup and test infrastructure out of its static dependency graph.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { build } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'

import { publicSpecimenFiles } from '../../scripts/gallery/specimen-assets'
import { PUBLIC_SPECIMEN_BASE, VENDOR_DIR } from './specimen-url'

const ROOT = resolve(import.meta.dirname, '../..')
const emitted = new Map<string, Buffer>()
const chunks = new Map<string, {
  imports: string[]
  modules: string[]
  facade: string | null
  isEntry: boolean
}>()

beforeAll(async () => {
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    const result = await build({
      root: ROOT,
      configFile: resolve(ROOT, 'vite.config.ts'),
      mode: 'production',
      logLevel: 'silent',
      build: { write: false },
    })
    const outputs = Array.isArray(result) ? result : [result]
    for (const output of outputs) {
      if (!('output' in output)) throw new Error('Expected actual build output')
      for (const file of output.output) {
        if (file.type === 'chunk') {
          emitted.set(file.fileName, Buffer.from(file.code))
          chunks.set(file.fileName, {
            imports: file.imports,
            modules: Object.keys(file.modules),
            facade: file.facadeModuleId,
            isEntry: file.isEntry,
          })
        } else {
          emitted.set(file.fileName, typeof file.source === 'string'
            ? Buffer.from(file.source) : Buffer.from(file.source))
        }
      }
    }
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
}, 180_000)

function staticModules(start: string): string[] {
  const visited = new Set<string>()
  const modules = new Set<string>()
  const pending = [start]
  while (pending.length > 0) {
    const file = pending.pop()!
    if (visited.has(file)) continue
    visited.add(file)
    const chunk = chunks.get(file)
    for (const module of chunk?.modules ?? []) modules.add(module)
    pending.push(...(chunk?.imports ?? []))
  }
  return [...modules]
}

function entry(suffix: string): string {
  // Vite's document entry facade is index.html; main.tsx is in its module set.
  const found = [...chunks].find(([, chunk]) => chunk.facade?.endsWith(suffix)
    || (chunk.isEntry && chunk.modules.some((module) => module.endsWith(suffix))))
  if (!found) throw new Error('Missing actual build chunk: ' + suffix)
  return found[0]
}

describe('public gallery production contract', () => {
  it('emits the app and distinct product/library entries', () => {
    expect(emitted.has('index.html')).toBe(true)
    expect(entry('/src/main.tsx')).toBeTruthy()
    expect(entry('/src/app/AppRuntime.tsx')).toBeTruthy()
    expect(entry('/src/gallery/PublicGalleryApp.tsx')).toBeTruthy()
  })

  it('keeps account clients and BootGate outside the shared entry and library graph', () => {
    for (const start of [entry('/src/main.tsx'), entry('/src/gallery/PublicGalleryApp.tsx')]) {
      const modules = staticModules(start)
      expect(modules.some((module) => module.endsWith('/src/app/auth-client.ts'))).toBe(false)
      expect(modules.some((module) => module.endsWith('/src/app/BootSequence.tsx'))).toBe(false)
      expect(modules.some((module) => module.includes('/src/test/'))).toBe(false)
    }
    expect(staticModules(entry('/src/app/AppRuntime.tsx'))
      .some((module) => module.endsWith('/src/app/auth-client.ts'))).toBe(true)
  })

  it('uses the same canonical gallery register without loading its examples in the product', () => {
    expect(staticModules(entry('/src/gallery/PublicGalleryApp.tsx'))
      .some((module) => module.endsWith('/src/dev/gallery-registry.tsx'))).toBe(true)
    expect(staticModules(entry('/src/app/AppRuntime.tsx'))
      .some((module) => module.endsWith('/src/dev/gallery-registry.tsx'))).toBe(false)
  })

  it('emits every upstream document and its actual dependencies byte-identically', () => {
    const files = publicSpecimenFiles(ROOT)
    expect(files.filter((file) => file.endsWith('.html'))).toHaveLength(43)
    expect(files).toContain('_ds_bundle.js')
    expect(files).toContain('styles.css')
    for (const file of files) {
      expect(emitted.get(PUBLIC_SPECIMEN_BASE.slice(1) + file), file)
        .toEqual(readFileSync(resolve(ROOT, VENDOR_DIR, file)))
    }
    expect([...emitted.keys()].filter((file) => file.startsWith(PUBLIC_SPECIMEN_BASE.slice(1))))
      .toHaveLength(files.length)
    expect(files.some((file) => /(^|\/)(_source|uploads|templates)(\/|$)/.test(file))).toBe(false)
  })

  it('pins reference URLs to the actual imported package version', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, VENDOR_DIR, 'package.json'), 'utf8'))
    expect(PUBLIC_SPECIMEN_BASE).toBe('/gallery-reference/' + pkg.version + '/')
  })
})
