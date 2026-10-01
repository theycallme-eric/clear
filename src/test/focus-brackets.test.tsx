/**
 * CLEAR 0.9.7 focus contract.
 *
 * The old regression test modelled a local `.clr-chamfer--focus-owner`
 * convention. Version 0.9.7 supersedes that patch with one public
 * `<FocusBrackets />` mounted near the root. This file proves the public
 * component, vendor rules, and the single application-root mount.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FocusBrackets } from '../design-system/index'

const SOURCE = resolve(import.meta.dirname, '..')
const foundationPath = resolve(SOURCE, 'design-system/css/foundation.css')
const focusSourcePath = resolve(
  SOURCE,
  'design-system/components/FocusBrackets/FocusBrackets.jsx',
)

function makeFocusVisible(): ReturnType<typeof vi.spyOn> {
  const nativeMatches = Element.prototype.matches
  return vi.spyOn(Element.prototype, 'matches').mockImplementation(function matches(
    this: Element,
    selector,
  ) {
    if (selector === ':focus-visible') return true
    return nativeMatches.call(this, selector)
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-clr-focus')
  document.querySelectorAll('.clr-focus-brackets').forEach((element) => element.remove())
})

describe('FocusBrackets lifecycle', () => {
  it('mounts one out-of-flow layer and removes the global mode on cleanup', () => {
    const { unmount } = render(<FocusBrackets />)

    expect(document.documentElement).toHaveAttribute('data-clr-focus', 'brackets')
    expect(document.body.querySelectorAll('.clr-focus-brackets')).toHaveLength(1)
    expect(document.querySelector('.clr-focus-brackets')).toHaveAttribute('aria-hidden', 'true')

    unmount()
    expect(document.documentElement).not.toHaveAttribute('data-clr-focus')
    expect(document.querySelector('.clr-focus-brackets')).toBeNull()
  })

  it('snaps brackets around a selectable control', () => {
    makeFocusVisible()
    const { getByRole } = render(
      <>
        <FocusBrackets />
        <button type="button">Continue</button>
      </>,
    )
    const button = getByRole('button', { name: 'Continue' })
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      x: 20,
      y: 30,
      left: 20,
      top: 30,
      right: 120,
      bottom: 70,
      width: 100,
      height: 40,
      toJSON: () => ({}),
    })

    button.focus()
    fireEvent.focusIn(button)

    const layer = document.querySelector('.clr-focus-brackets') as HTMLElement
    expect(layer.style.opacity).toBe('1')
    expect(layer.style.transform).toBe('translate(15px,25px)')
    expect(layer.style.width).toBe('110px')
    expect(layer.style.height).toBe('50px')
  })

  it('leaves text fields to light their own border', () => {
    makeFocusVisible()
    const { getByLabelText } = render(
      <>
        <FocusBrackets />
        <label htmlFor="name">Name</label>
        <input id="name" />
      </>,
    )
    const input = getByLabelText('Name')

    input.focus()
    fireEvent.focusIn(input)

    const layer = document.querySelector('.clr-focus-brackets') as HTMLElement
    expect(layer.style.opacity).toBe('0')
  })
})

describe('the 0.9.7 vendor focus rules', () => {
  const foundation = readFileSync(foundationPath, 'utf-8')
  const component = readFileSync(focusSourcePath, 'utf-8')

  it('suppresses selectable fallback outlines only while the bracket layer is mounted', () => {
    expect(foundation).toContain('html[data-clr-focus="brackets"]')
    expect(foundation).toContain('.clr-focus-brackets')
    expect(component).toContain('root.setAttribute("data-clr-focus", "brackets")')
    expect(component).toContain('root.removeAttribute("data-clr-focus")')
  })

  it('keeps text-field focus on the field border and makes bracket focus static', () => {
    expect(foundation).toContain('--border-field-focus')
    expect(foundation).toMatch(/\.clr-focus-brackets\s*\{[^}]*opacity:\s*0;/s)
    const bracketRule = foundation.match(/\.clr-focus-brackets\s*\{[^}]*\}/s)?.[0] ?? ''
    expect(bracketRule).not.toContain('transition')
    expect(bracketRule).not.toContain('animation')
  })

  it('does not ship or preserve the superseded focus-owner convention in app code', () => {
    expect(foundation).not.toContain('clr-chamfer--focus-owner')

    const offenders: string[] = []
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = resolve(directory, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === 'design-system' || entry.name === 'test') continue
          walk(full)
        } else if (/\.(css|tsx?|jsx?)$/.test(entry.name) && !entry.name.includes('.test.')) {
          if (readFileSync(full, 'utf-8').includes('clr-chamfer--focus-owner')) {
            offenders.push(full)
          }
        }
      }
    }
    walk(SOURCE)
    expect(offenders).toEqual([])
  })

  it('is mounted exactly once by the application root', () => {
    const root = readFileSync(resolve(SOURCE, 'app/RootLayout.tsx'), 'utf-8')

    expect(root.match(/<FocusBrackets\s*\/>/g)).toHaveLength(1)
  })
})
