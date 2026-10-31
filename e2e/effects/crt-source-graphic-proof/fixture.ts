/**
 * TASK-201 (clear-effects-2026-10-30-live-source-proof) — the one fixture
 * module every CRT number in this proof comes from.
 *
 * Nothing numeric is restated here. The CRT settings are read from
 * `$CLEAR_EFFECTS_CURRENT_SETTINGS` (SHA-256 checked); the shader's own
 * constants are parsed out of the preserved `glass-effect.mjs` fragment and the
 * CRTFilter fragment inside `vendor/filters.js`; the still phase and seed come
 * from the preserved `motion-clock.mjs`; the host loop's frame cap and clamp
 * come from the preserved `study.mjs`. Every file is read in place, read-only,
 * from `$CLEAR_EFFECTS_REFERENCE_DIR/crt-glass-motion/`. Nothing is copied into
 * the repository and nothing is installed. A missing input or a fragment that no
 * longer has the expected shape throws with the exact name of what is missing:
 * the spec fails, it never skips.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { parseEnvFile } from '../../../scripts/dev-preflight/env.mjs'

export const REFERENCE_ENV = 'CLEAR_EFFECTS_REFERENCE_DIR'
export const SETTINGS_ENV = 'CLEAR_EFFECTS_CURRENT_SETTINGS'
/** PRE-202: the exact current-session export. An identity, not a CRT number. */
export const SETTINGS_SHA256 = '3169d4608c8babe17a20670bd59f53e3110c7ce917641786d33c2713943ca033'
/** The same git-ignored, non-secret path files the existing effects specs read. */
const ENV_FILES = ['.env.runner.local', '.env.audit.local', '.env.local'] as const
const CHECKPOINT = 'crt-glass-motion'

export const REFERENCE_FILES = {
  glassEffect: 'glass-effect.mjs',
  motionClock: 'motion-clock.mjs',
  pixi: 'vendor/pixi.min.js',
  filters: 'vendor/filters.js',
  specimen: 'assets/echo-clean.jpg',
  study: 'study.mjs',
} as const
export type ReferenceKey = keyof typeof REFERENCE_FILES

/** The settings keys the preserved pass and clock read. All must be present. */
const NUMBERS = [
  'curvature', 'lineWidth', 'lineContrast', 'edgeBlur', 'edgeWidth', 'vignetting', 'vignettingAlpha',
  'vignettingBlur', 'noise', 'noiseSize', 'grainSoftness', 'cycleSeconds', 'grainRate',
] as const
const FLAGS = ['animate', 'grainAnimate', 'colorProtect', 'verticalLine'] as const

export type CrtSettings = Record<(typeof NUMBERS)[number], number> & Record<(typeof FLAGS)[number], boolean>

export interface ShaderSource {
  /** Everything before `void main(){` in the preserved fragment: uniforms, `sampleAt`, `grainRandom`, `grainAt`. */
  header: string
  /** The preserved edge-reach lines, ending in `float amount=…;`. */
  amountSnippet: string
  /** The preserved curved-line lines, ending in `float wave=…;`. */
  waveSnippet: string
  /** The CRTFilter uniforms, constants and `vignette()` from `vendor/filters.js`. */
  crtDeclarations: string
  crtVignetteCall: string
  /** Which `uVignette` slot each setting fills, read from the CRTFilter setters. */
  vignetteSlots: Record<'vignetting' | 'vignettingAlpha' | 'vignettingBlur', number>
  constants: {
    amountThreshold: number
    tapCentre: number
    tapAxis: number
    tapDiagonalScale: number
    tapDiagonal: number
    ratioFloor: number
    ratioLow: number
    ratioHigh: number
    protectLow: number
    protectHigh: number
    rec709: [number, number, number]
    lightFloor: number
  }
}

export interface MotionClockModule {
  initialClock: () => { phase: number; grainElapsed: number; grainIndex: number }
  advanceClock: (clock: { phase: number; grainElapsed: number; grainIndex: number }, seconds: number, settings: object) => { phase: number; grainElapsed: number; grainIndex: number }
  grainSeed: (clock: { grainIndex: number }) => number
  TAU: number
}

export interface Proof {
  root: string
  settingsPath: string
  settings: CrtSettings
  phosphorEcho: Record<string, number> | null
  files: Record<ReferenceKey | 'settings', { path: string; sha256: string; bytes: number }>
  shader: ShaderSource
  clock: MotionClockModule
  still: { phase: number; seed: number }
  hostLoop: { frameCapFps: number; maxStepSeconds: number }
  /** The preserved fragment source, so the summary can show what was parsed. */
  glassFragment: string
}

function envValue(name: string): string | undefined {
  const exported = process.env[name]?.trim()
  if (exported) return exported
  for (const file of ENV_FILES) {
    const path = resolve(process.cwd(), file)
    if (!existsSync(path)) continue
    const value = parseEnvFile(readFileSync(path, 'utf8'))[name]?.trim()
    if (value) return value
  }
  return undefined
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

function need(text: string, pattern: RegExp, what: string): RegExpMatchArray {
  const match = text.match(pattern)
  if (!match) throw new Error(`TASK-201 blocker: ${what} was not found in the preserved source; the proof cannot read that operation`)
  return match
}

function between(text: string, start: string, endInclusive: string, what: string): string {
  const from = text.indexOf(start)
  const to = from < 0 ? -1 : text.indexOf(endInclusive, from)
  if (from < 0 || to < 0) throw new Error(`TASK-201 blocker: ${what} was not found in glass-effect.mjs`)
  return text.slice(from, to + endInclusive.length)
}

function parseGlass(source: string): Omit<ShaderSource, 'crtDeclarations' | 'crtVignetteCall' | 'vignetteSlots'> & { fragment: string } {
  const fragment = need(source, /const fragment=`([\s\S]*?)`;/, 'the glass-effect.mjs fragment')[1]!
  const mainAt = fragment.indexOf('void main(){')
  if (mainAt < 0) throw new Error('TASK-201 blocker: glass-effect.mjs fragment has no main()')
  const taps = need(
    fragment,
    /c\*=([\d.]+);\s*c\+=\(sampleAt\(uv\+vec2\(d\.x,0\.0\)\)[^;]*?\)\*([\d.]+);\s*c\+=\(sampleAt\(uv\+d\*([\d.]+)\)[^;]*?\)\*([\d.]+);/,
    'the nine-tap edge softness weights',
  )
  const ratio = need(fragment, /ratio=clamp\(filtered\/max\(brightness,([\d.]+)\),([\d.]+),([\d.]+)\)/, 'the colour-protection ratio clamp')
  const protect = need(fragment, /protection=smoothstep\(([\d.]+),([\d.]+),peak\)/, 'the colour-protection smoothstep')
  const rec = need(fragment, /brightness=dot\(original,vec3\(([\d.]+),([\d.]+),([\d.]+)\)\)/, 'the Rec. 709 brightness weights')
  const floor = need(fragment, /lightFloor=([\d.]+);/, 'the dark-ground light floor')
  const threshold = need(fragment, /if\(amount>([\d.]+)&&uSoftness>/, 'the edge-softness amount threshold')
  return {
    fragment,
    header: fragment.slice(0, mainAt),
    amountSnippet: between(fragment, 'vec2 centre=', 'float amount=smoothstep(1.0-uReach,1.0,edge);', 'the edge reach field'),
    waveSnippet: between(fragment, 'vec2 dir=coord-.5;', 'float wave=cos(v*1.2-uPhase);', 'the curved line wave'),
    constants: {
      amountThreshold: Number(threshold[1]),
      tapCentre: Number(taps[1]),
      tapAxis: Number(taps[2]),
      tapDiagonalScale: Number(taps[3]),
      tapDiagonal: Number(taps[4]),
      ratioFloor: Number(ratio[1]),
      ratioLow: Number(ratio[2]),
      ratioHigh: Number(ratio[3]),
      protectLow: Number(protect[1]),
      protectHigh: Number(protect[2]),
      rec709: [Number(rec[1]), Number(rec[2]), Number(rec[3])],
      lightFloor: Number(floor[1]),
    },
  }
}

/** The CRTFilter fragment's vignette, uniforms and constants, from the vendor bundle. */
function parseCrt(bundle: string): Pick<ShaderSource, 'crtDeclarations' | 'crtVignetteCall' | 'vignetteSlots'> {
  const at = bundle.indexOf('float vignette(')
  if (at < 0) throw new Error('TASK-201 blocker: vendor/filters.js has no CRTFilter vignette() function')
  const start = bundle.lastIndexOf('in vec2 vTextureCoord', at)
  const end = bundle.indexOf('void main', at)
  if (start < 0 || end < 0) throw new Error('TASK-201 blocker: the CRTFilter fragment bounds were not found in vendor/filters.js')
  const chunk = bundle.slice(start, end).replace(/\\n/g, '\n').replace(/\\t/g, ' ')
  const uniforms = [...chunk.matchAll(/uniform\s+\w+\s+\w+\s*;/g)].map((m) => m[0])
  const constants = [...chunk.matchAll(/const\s+float\s+\w+\s*=\s*[\d.]+\s*;/g)].map((m) => m[0])
  const fnAt = chunk.indexOf('float vignette(')
  let depth = 0
  let fnEnd = -1
  for (let i = chunk.indexOf('{', fnAt); i < chunk.length; i++) {
    if (chunk[i] === '{') depth++
    if (chunk[i] === '}' && --depth === 0) { fnEnd = i + 1; break }
  }
  if (fnEnd < 0) throw new Error('TASK-201 blocker: the CRTFilter vignette() body was not closed')
  const mainAt = bundle.indexOf('void main', at)
  const mainText = bundle.slice(mainAt, mainAt + 1200).replace(/\\n/g, '\n')
  // The CRTFilter computes `float v = vignette(finalColor.rgb, coord)` and multiplies the colour by it.
  const callMatch = mainText.match(/float\s+(\w+)\s*=\s*vignette\(([^;]*)\);\s*finalColor\s*\*=\s*vec4\(\1,\s*\1,\s*\1,\s*finalColor\.a\);/)
  if (!callMatch) throw new Error(`TASK-201 blocker: the CRTFilter vignette multiply was not found in vendor/filters.js main(): ${mainText.slice(0, 700)}`)
  const call = `${callMatch[0].slice(0, callMatch[0].indexOf(';') + 1)} float vg=${callMatch[1]};`
  const slots: Partial<ShaderSource['vignetteSlots']> = {}
  for (const m of bundle.matchAll(/set\s+(vignetting|vignettingAlpha|vignettingBlur)\s*\((\w+)\)\s*\{\s*this\.uniforms\.uVignette\[(\d)\]\s*=\s*\2/g)) {
    slots[m[1] as keyof ShaderSource['vignetteSlots']] = Number(m[3])
  }
  for (const key of ['vignetting', 'vignettingAlpha', 'vignettingBlur'] as const) {
    if (slots[key] === undefined) throw new Error(`TASK-201 blocker: the CRTFilter ${key} uniform slot was not found in vendor/filters.js`)
  }
  return {
    crtDeclarations: [...uniforms, ...constants, chunk.slice(fnAt, fnEnd)].join('\n'),
    crtVignetteCall: call,
    vignetteSlots: slots as ShaderSource['vignetteSlots'],
  }
}

export async function loadProof(): Promise<Proof> {
  const dir = envValue(REFERENCE_ENV)
  if (!dir) throw new Error(`TASK-201 blocker: ${REFERENCE_ENV} is not set (exported or in ${ENV_FILES.join(', ')}); the preserved CRT reference checkpoint (PRE-201) is missing`)
  const settingsPath = envValue(SETTINGS_ENV)
  if (!settingsPath) throw new Error(`TASK-201 blocker: ${SETTINGS_ENV} is not set (exported or in ${ENV_FILES.join(', ')}); crt-iab-current-settings.json (PRE-202) is missing`)
  const root = resolve(dir, CHECKPOINT)
  const files = {} as Proof['files']
  for (const [key, rel] of Object.entries(REFERENCE_FILES) as [ReferenceKey, string][]) {
    const path = resolve(root, rel)
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`TASK-201 blocker: ${REFERENCE_ENV}/${CHECKPOINT}/${rel} is missing; the preserved reference cannot be rendered`)
    }
    const bytes = readFileSync(path)
    files[key] = { path, sha256: sha256(bytes), bytes: bytes.length }
  }
  if (!existsSync(settingsPath) || !statSync(settingsPath).isFile()) {
    throw new Error(`TASK-201 blocker: ${SETTINGS_ENV} names no readable file; crt-iab-current-settings.json (PRE-202) is missing`)
  }
  const settingsBytes = readFileSync(settingsPath)
  const settingsSha = sha256(settingsBytes)
  if (settingsSha !== SETTINGS_SHA256) {
    throw new Error(`TASK-201 blocker: ${SETTINGS_ENV} SHA-256 is ${settingsSha}, not the approved ${SETTINGS_SHA256}`)
  }
  files.settings = { path: settingsPath, sha256: settingsSha, bytes: settingsBytes.length }
  const exported = JSON.parse(settingsBytes.toString('utf8')) as { settings?: Record<string, unknown>; phosphorEcho?: Record<string, number> }
  const raw = exported.settings ?? {}
  const settings = {} as CrtSettings
  for (const key of NUMBERS) {
    if (typeof raw[key] !== 'number') throw new Error(`TASK-201 blocker: settings.${key} is not a number in ${SETTINGS_ENV}`)
    ;(settings as Record<string, number>)[key] = raw[key] as number
  }
  for (const key of FLAGS) {
    if (typeof raw[key] !== 'boolean') throw new Error(`TASK-201 blocker: settings.${key} is not a boolean in ${SETTINGS_ENV}`)
    ;(settings as Record<string, boolean>)[key] = raw[key] as boolean
  }

  const glass = parseGlass(readFileSync(files.glassEffect.path, 'utf8'))
  const crt = parseCrt(readFileSync(files.filters.path, 'utf8'))
  const study = readFileSync(files.study.path, 'utf8')
  const step = need(study, /Math\.min\(\(now-lastTime\)\/1000,([\d.]+)\)/, 'the study.mjs per-frame step clamp')
  const cap = need(study, /now-lastRender>=1000\/(\d+)/, 'the study.mjs render cap')
  const clock = (await import(pathToFileURL(files.motionClock.path).href)) as MotionClockModule
  const initial = clock.initialClock()

  return {
    root,
    settingsPath,
    settings,
    phosphorEcho: exported.phosphorEcho ?? null,
    files,
    shader: { header: glass.header, amountSnippet: glass.amountSnippet, waveSnippet: glass.waveSnippet, constants: glass.constants, ...crt },
    clock,
    still: { phase: initial.phase, seed: clock.grainSeed(initial) },
    hostLoop: { frameCapFps: Number(cap[1]), maxStepSeconds: Number(step[1]) },
    glassFragment: glass.fragment,
  }
}
