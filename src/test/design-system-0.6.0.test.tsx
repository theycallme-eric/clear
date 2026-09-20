import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { VERSION, OverflowRail, TabBar, Input, Button, Chip, Toast } from '../design-system/index'

const dsPath = (p: string) => resolve(import.meta.dirname, '../design-system', p)

describe('0.6.0 version checks', () => {
  it('declares VERSION 0.6.0 from the public entry', () => {
    expect(VERSION).toBe('0.6.0')
  })

  it('vendored package.json is 0.6.0', () => {
    const pkg = JSON.parse(readFileSync(dsPath('package.json'), 'utf-8'))
    expect(pkg.version).toBe('0.6.0')
  })

  it('ATOMIC.md pin is 0.6.0', () => {
    const atomic = readFileSync(
      resolve(import.meta.dirname, '../../docs/specs/design/ATOMIC.md'),
      'utf-8',
    )
    expect(atomic).toMatch(/\|\s*Version\s*\|\s*`0\.6\.0`\s*\|/)
  })

  it('documents (without patching) the stale index.d.ts prose header', () => {
    // The upstream artifact ships byte-identical; its prose header still says 0.5.0.
    const dts = readFileSync(dsPath('index.d.ts'), 'utf-8')
    expect(dts).toContain('Version 0.5.0')
    const atomic = readFileSync(
      resolve(import.meta.dirname, '../../docs/specs/design/ATOMIC.md'),
      'utf-8',
    )
    expect(atomic).toContain('index.d.ts')
  })

  it('exports OverflowRail from the public entry without touching internals', () => {
    expect(typeof OverflowRail).toBe('function')
  })
})

describe('TabBar semantics and reveal', () => {
  const tabs = ['Alpha', 'Beta', 'Gamma']

  it('renders a tablist whose direct children are the tabs', () => {
    render(<TabBar tabs={tabs} active={1} onChange={() => {}} />)
    const tablist = screen.getByRole('tablist')
    const kids = Array.from(tablist.children)
    expect(kids).toHaveLength(3)
    kids.forEach((el) => expect(el).toHaveAttribute('role', 'tab'))
    expect(kids[1]).toHaveAttribute('aria-selected', 'true')
    expect(kids[1]).toHaveAttribute('tabindex', '0')
    expect(kids[0]).toHaveAttribute('tabindex', '-1')
  })

  it('reveals the active item via the rail (no app-side scroll mechanism)', () => {
    // jsdom has no layout; the reveal contract is that the rail owns measuring
    // and scrolling internally, keyed by activeIndex — the tablist itself must
    // not gain a second scroll container between tablist and tabs.
    render(<TabBar tabs={tabs} active={2} onChange={() => {}} />)
    const tablist = screen.getByRole('tablist')
    expect(tablist.querySelector('[role="tablist"]')).toBeNull()
    // Every element between rail root and tabs is design-system-owned.
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })
})

describe('Input constrained sizing and invalid state', () => {
  it('shrinks inside constrained layouts (minWidth released on the field column)', () => {
    const { container } = render(<Input label="Name" value="" onChange={() => {}} />)
    const column = container.firstElementChild as HTMLElement
    expect(column.style.minWidth).toBe('0px')
  })

  it('uses the invalid-state border token and aria-invalid when errored', () => {
    render(<Input label="Name" value="" onChange={() => {}} errorText="Required" />)
    const input = screen.getByLabelText('Name')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    // Input draws its invalid border as a shorthand from the coherent 0.5.2
    // frame/input state token set.
    expect(input.getAttribute('style')).toContain('var(--border-input-invalid)')
    expect(input.getAttribute('style')).toContain('var(--surface-input-invalid)')
  })
})

describe('reduced motion', () => {
  it('rail never scrolls smoothly under prefers-reduced-motion', () => {
    const mm = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    } as MediaQueryList)
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollTo')
    const items = [
      <button key="a" type="button">one</button>,
      <button key="b" type="button">two</button>,
    ]
    const { rerender } = render(<OverflowRail activeIndex={0}>{items}</OverflowRail>)
    // Post-mount activeIndex changes are the smooth path when motion is allowed;
    // jsdom's zero-size geometry always yields a reveal delta, so this exercises it.
    rerender(<OverflowRail activeIndex={1}>{items}</OverflowRail>)
    expect(mm).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    const behaviors = scrollSpy.mock.calls.map(([opts]) => (opts as ScrollToOptions)?.behavior)
    expect(behaviors.length).toBeGreaterThan(0)
    expect(behaviors).not.toContain('smooth')
    scrollSpy.mockRestore()
    mm.mockRestore()
  })

  it('motion.css contains a prefers-reduced-motion block', () => {
    expect(readFileSync(dsPath('css/motion.css'), 'utf-8')).toContain(
      '@media (prefers-reduced-motion: reduce)',
    )
  })
})

describe('cumulative box-sizing regression (0.5.1)', () => {
  it('foundation.css applies the global border-box correction', () => {
    const css = readFileSync(dsPath('css/foundation.css'), 'utf-8')
    expect(css).toMatch(/box-sizing:\s*border-box/)
  })

  it('Button, Chip, Input, Toast still render from the public entry', () => {
    render(
      <>
        <Button>Go</Button>
        <Chip>Tag</Chip>
        <Input label="Field" value="" onChange={() => {}} />
        <Toast>Saved</Toast>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument()
    expect(screen.getByText('Tag')).toBeInTheDocument()
    expect(screen.getByLabelText('Field')).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('keeps the 0.6.0 responsive and contrast specimens available for the gallery', () => {
    for (const f of ['preview/responsive-constraints.html', 'preview/contrast-audit.html', 'preview/frame-roles.html']) {
      expect(readFileSync(dsPath(f), 'utf-8').length).toBeGreaterThan(0)
    }
  })

  it('has no local TabBar/Input workaround creating a second scroll or sizing mechanism', () => {
    // 0.6.0 makes the rail own scrolling/reveal and the Input own shrinking.
    // App-owned code must not reintroduce either mechanism around them.
    const srcRoot = resolve(import.meta.dirname, '..')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === 'design-system' || entry.name === 'test') continue
          walk(full)
        } else if (/\.(tsx?|css)$/.test(entry.name)) {
          const text = readFileSync(full, 'utf-8')
          if (/scrollIntoView|overflow-x|overflowX/.test(text)) offenders.push(full)
        }
      }
    }
    walk(srcRoot)
    expect(offenders).toEqual([])
  })
})
