import { describe, expect, it } from 'vitest'

import { browserTestsForTarget } from '../../playwright.config'

/** Exercise the existing target selector, without launching a browser/server. */
const INTEGRATED_TITLES = [
  'mobile ui-polish-integrated.spec.ts JOURNEY-017: integrated sheet',
  'mobile e2e/ui-polish-integrated.spec.ts JOURNEY-017: swap return',
  'mobile /checkout/e2e/ui-polish-integrated.spec.ts:398:3 JOURNEY-017: integrated sheet',
  String.raw`mobile C:\checkout\e2e\ui-polish-integrated.spec.ts:588:3 JOURNEY-017: swap return`,
]

const B05_TITLES = [
  'mobile ui-polish-b05-scroll-boundaries.spec.ts page region',
  'mobile e2e/ui-polish-b05-shell.spec.ts shell',
  'mobile /checkout/e2e/ui-polish-b05-scroll-boundaries.spec.ts:398:3 nested region',
  String.raw`mobile C:\checkout\e2e\ui-polish-b05-scroll-boundaries.spec.ts:588:3 ladder`,
]

const LOCAL_TARGETS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://127.12.3.4:5173',
  'http://fixture.localhost:5173',
  'http://[::1]:5173',
]
const EXTERNAL_TARGETS = [
  'https://clear.example.com',
  'https://clear-preview.vercel.app',
  'http://localhost.example.com:5173',
  'http://127.0.0.1.example.com:5173',
]

describe('TASK-018 and B05 local-only browser target selection', () => {
  it.each(LOCAL_TARGETS)('selects integrated and B05 cases on the existing local target %s', (target) => {
    const selected = browserTestsForTarget('0.14.3', target)
    for (const title of [...INTEGRATED_TITLES, ...B05_TITLES]) expect(selected.test(title)).toBe(true)
  })

  it.each(EXTERNAL_TARGETS)('excludes integrated and B05 cases from ordinary external discovery at %s', (target) => {
    const selected = browserTestsForTarget('0.14.3', target)
    for (const title of [...INTEGRATED_TITLES, ...B05_TITLES]) expect(selected.test(title)).toBe(false)
    // No case-level skip or successful early return is added. With this file
    // alone selected, the existing command keeps the default no-tests error.
  })

  it.each([
    'mobile e2e/ui-polish-home.spec.ts JOURNEY-003: Home',
    'mobile ui-polish-pwa-viewport.spec.ts JOURNEY-002: viewport',
    'mobile e2e/ui-polish-action-glow.spec.ts JOURNEY-004: glow',
    'mobile core-loop.spec.ts JOURNEY-001: core loop',
    'mobile e2e/ui-polish-integrated-helper.spec.ts another proof',
    'mobile e2e/not-ui-polish-integrated.spec.ts another proof',
    'mobile e2e/ui-polish-integrated.spec.tsx another file',
    'mobile e2e/not-ui-polish-b05-scroll-boundaries.spec.ts another proof',
    'mobile e2e/ui-polish-b05-scroll-boundaries.spec.tsx another file',
  ])('preserves unrelated browser selection: %s', (title) => {
    for (const target of [...LOCAL_TARGETS, ...EXTERNAL_TARGETS]) {
      expect(browserTestsForTarget('0.14.3', target).test(title)).toBe(true)
    }
  })
})
