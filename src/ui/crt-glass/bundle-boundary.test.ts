/**
 * Effects TASK-005 — the CRT Glass renderer's build-output boundary.
 *
 * Two builds are read, because each proves something the other cannot:
 *
 *   1. The real production output in `dist/` (run `npm run build` first). The
 *      field is not mounted yet (TASK-006 owns that), so not one byte of the
 *      renderer or its shaders may ship. Neither may either prototype library.
 *   2. An in-memory build whose entry is the field component, standing in for
 *      the later mount. The renderer and shaders must land in a chunk that the
 *      entry reaches only by dynamic import, never in the entry itself, and
 *      the MIT notice must travel with them.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { build, type Rolldown } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'

const projectDir = resolve(import.meta.dirname, '../../..')
const distAssets = resolve(projectDir, 'dist/assets')

/** Text only the renderer chunk carries. */
const RENDERER_MARKERS = ['uGrainSoftness', 'uVignette', 'WebGL2 is not available']
/** Code either prototype bundle would bring with it (not words in a comment). */
const PROTOTYPE_MARKERS = ['_filterGlobalUniforms', 'getOptimalTexture', 'PIXI.filters', 'GpuProgram.from']

describe('the production build (dist/)', () => {
  it('exists, so this boundary is checked against real output', () => {
    expect(existsSync(distAssets), 'run `npm run build` before this test').toBe(true)
  })

  it('ships no CRT renderer, shader or prototype library while the field is unmounted', () => {
    const scripts = readdirSync(distAssets).filter((name) => name.endsWith('.js'))
    expect(scripts.length).toBeGreaterThan(0)
    for (const name of scripts) {
      const code = readFileSync(resolve(distAssets, name), 'utf8')
      for (const marker of [...RENDERER_MARKERS, ...PROTOTYPE_MARKERS]) {
        expect(code.includes(marker), `${name} contains ${marker}`).toBe(false)
      }
    }
  })
})

describe('a build that mounts the field', () => {
  let chunks: Rolldown.OutputChunk[] = []

  beforeAll(async () => {
    const result = await build({
      root: projectDir,
      configFile: false,
      envFile: false,
      logLevel: 'silent',
      plugins: [react()],
      build: {
        write: false,
        minify: false,
        rollupOptions: {
          input: resolve(import.meta.dirname, 'scanline-field.tsx'),
          preserveEntrySignatures: 'strict',
          external: [/^react(?:-dom)?(?:\/.*)?$/],
        },
      },
    })
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((output) =>
      'output' in output ? output.output : [],
    )
    chunks = outputs.filter((output): output is Rolldown.OutputChunk => output.type === 'chunk')
  }, 60_000)

  it('keeps the renderer and shaders out of the entry chunk', () => {
    const entry = chunks.find((chunk) => chunk.isEntry)!
    expect(entry).toBeDefined()
    for (const marker of RENDERER_MARKERS) expect(entry.code).not.toContain(marker)
    expect(Object.keys(entry.modules).some((id) => /crt-glass[\\/](?:renderer|shaders)\.ts$/.test(id))).toBe(false)
  })

  it('loads them as one lazily imported chunk, with the MIT notice retained', () => {
    const entry = chunks.find((chunk) => chunk.isEntry)!
    const lazy = chunks.filter((chunk) => !chunk.isEntry && RENDERER_MARKERS.every((marker) => chunk.code.includes(marker)))
    expect(lazy).toHaveLength(1)
    expect(entry.dynamicImports).toContain(lazy[0]!.fileName)
    expect(entry.imports).not.toContain(lazy[0]!.fileName)
    expect(lazy[0]!.code).toMatch(/MIT License/)
    expect(lazy[0]!.code).toMatch(/Mathew Groves, Chad Engler/)
  })

  it('brings in no prototype library', () => {
    for (const chunk of chunks) {
      for (const marker of PROTOTYPE_MARKERS) expect(chunk.code).not.toContain(marker)
    }
  })
})
