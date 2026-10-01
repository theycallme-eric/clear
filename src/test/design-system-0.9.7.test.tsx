import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { render, screen } from '@testing-library/react'
import {
  VERSION,
  OverflowRail,
  ScrollRegion,
  FocusBrackets,
  TabBar,
  Input,
  Button,
  Chip,
  Toast,
} from '../design-system/index'

const dsPath = (path: string) => resolve(import.meta.dirname, '../design-system', path)

function filesBelow(root: string): string[] {
  const files: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else files.push(relative(root, full))
    }
  }
  walk(root)
  return files.sort()
}

describe('0.9.7 source and public contract', () => {
  it('declares VERSION 0.9.7 from the public entry and package', () => {
    const pkg = JSON.parse(readFileSync(dsPath('package.json'), 'utf-8'))
    expect(VERSION).toBe('0.9.7')
    expect(pkg.version).toBe('0.9.7')
  })

  it('pins ATOMIC.md to the owner-supplied archive and hash', () => {
    const atomic = readFileSync(
      resolve(import.meta.dirname, '../../docs/specs/design/ATOMIC.md'),
      'utf-8',
    )
    expect(atomic).toMatch(/\|\s*Version\s*\|\s*`0\.9\.7`\s*\|/)
    expect(atomic).toContain(
      '12620dc5d9b6d7de965f25b80f86a90b8ee3e6a5eeea813eb1b85b0563d74790',
    )
  })

  it('keeps the runtime vendor byte-identical to the immutable evidence copy', () => {
    const runtime = resolve(import.meta.dirname, '../design-system')
    const evidence = resolve(
      import.meta.dirname,
      '../../docs/design/exports/clear-design-system-0.9.7',
    )
    const runtimeFiles = filesBelow(runtime)
    const evidenceFiles = filesBelow(evidence)
    expect(runtimeFiles).toEqual(evidenceFiles)
    expect(runtimeFiles).toHaveLength(590)
    for (const path of runtimeFiles) {
      if (!readFileSync(join(runtime, path)).equals(readFileSync(join(evidence, path)))) {
        throw new Error(`Runtime vendor differs from evidence at ${path}`)
      }
    }
  })

  it('documents without patching the stale index.d.ts prose header', () => {
    const declaration = readFileSync(dsPath('index.d.ts'), 'utf-8')
    const atomic = readFileSync(
      resolve(import.meta.dirname, '../../docs/specs/design/ATOMIC.md'),
      'utf-8',
    )
    expect(declaration).toContain('Version 0.5.0')
    expect(declaration).toContain("VERSION: '0.9.7'")
    expect(atomic).toContain('documentation defect')
  })

  it('exports the public horizontal, vertical, and focus behavior components', () => {
    expect(typeof OverflowRail).toBe('function')
    expect(typeof ScrollRegion).toBe('function')
    expect(typeof FocusBrackets).toBe('function')
  })

  it('keeps all 43 preview and component review pages available', () => {
    const previews = readdirSync(dsPath('preview')).filter((name) => name.endsWith('.html'))
    const cards = readdirSync(dsPath('components'), { withFileTypes: true }).filter((entry) => {
      if (!entry.isDirectory()) return false
      try {
        readFileSync(dsPath(`components/${entry.name}/card.html`))
        return true
      } catch {
        return false
      }
    })
    expect(previews).toHaveLength(24)
    expect(cards).toHaveLength(19)
    expect(previews.length + cards.length).toBe(43)
  })

  it('ships the 0.9.7 composition and motion vocabulary', () => {
    const foundation = readFileSync(dsPath('css/foundation.css'), 'utf-8')
    const motion = readFileSync(dsPath('css/motion.css'), 'utf-8')
    for (const className of ['clr-scroll-region', 'clr-list', 'clr-actions', 'clr-footer', 'clr-band']) {
      expect(foundation).toContain(`.${className}`)
    }
    expect(motion).toContain('.clr-pulse-micro')
    expect(motion).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

describe('0.9.7 component behavior', () => {
  const tabs = ['Alpha', 'Beta', 'Gamma']

  it('renders a tablist whose direct children are the tabs', () => {
    render(<TabBar tabs={tabs} active={1} onChange={() => {}} />)
    const tablist = screen.getByRole('tablist')
    const children = Array.from(tablist.children)
    expect(children).toHaveLength(3)
    children.forEach((element) => expect(element).toHaveAttribute('role', 'tab'))
    expect(children[1]).toHaveAttribute('aria-selected', 'true')
    expect(children[1]).toHaveAttribute('tabindex', '0')
    expect(children[0]).toHaveAttribute('tabindex', '-1')
  })

  it('uses the Input unit API and puts invalid border/surface on the public field frame', () => {
    render(
      <Input label="Load" value="" onChange={() => {}} errorText="Required" unit="kg" />,
    )
    const input = screen.getByLabelText('Load')
    const frame = input.closest('.clr-field') as HTMLElement
    const unit = screen.getByText('kg')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toContain(unit.id)
    expect(frame.getAttribute('style')).toContain('var(--border-input-invalid)')
    expect(frame.getAttribute('style')).toContain('var(--surface-input-invalid)')
  })

  it('keeps constrained Input sizing inside the public component', () => {
    const { container } = render(<Input label="Name" value="" onChange={() => {}} />)
    const column = container.firstElementChild as HTMLElement
    const input = screen.getByLabelText('Name')
    expect(column.style.minWidth).toBe('0px')
    expect(input.style.minWidth).toBe('0px')
  })

  it('rail never scrolls smoothly under prefers-reduced-motion', () => {
    const media = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    } as MediaQueryList)
    const scroll = vi.spyOn(Element.prototype, 'scrollTo')
    const items = [
      <button key="a" type="button">one</button>,
      <button key="b" type="button">two</button>,
    ]
    const { rerender } = render(<OverflowRail activeIndex={0}>{items}</OverflowRail>)
    rerender(<OverflowRail activeIndex={1}>{items}</OverflowRail>)
    expect(media).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    const behaviors = scroll.mock.calls.map(([options]) => (options as ScrollToOptions)?.behavior)
    expect(behaviors.length).toBeGreaterThan(0)
    expect(behaviors).not.toContain('smooth')
    scroll.mockRestore()
    media.mockRestore()
  })

  it('keeps the global border-box correction and core public components', () => {
    expect(readFileSync(dsPath('css/foundation.css'), 'utf-8')).toMatch(/box-sizing:\s*border-box/)
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

  it('has no app-side horizontal reveal or constrained-input workaround', () => {
    const sourceRoot = resolve(import.meta.dirname, '..')
    const offenders: string[] = []
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === 'design-system' || entry.name === 'test') continue
          walk(full)
        } else if (/\.(tsx?|css)$/.test(entry.name)) {
          const text = readFileSync(full, 'utf-8')
          if (/scrollIntoView|overflow-x|overflowX/.test(text)) offenders.push(full)
        }
      }
    }
    walk(sourceRoot)
    expect(offenders).toEqual([])
  })
})
