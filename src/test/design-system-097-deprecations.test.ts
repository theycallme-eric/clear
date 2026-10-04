import { readFileSync, readdirSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * VIBE-D — retired vocabulary must not quietly return through a local screen.
 * The 0.14.3 vendor removes compatibility aliases; this scan is deliberately
 * limited to the production application consumer.
 */

const root = resolve(import.meta.dirname, '..')
const productionRoots = ['app', 'ui', 'styles']
const extensions = new Set(['.ts', '.tsx', '.css'])

function productionFiles(): string[] {
  return productionRoots.flatMap((directory) =>
    readdirSync(resolve(root, directory), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => resolve(entry.parentPath, entry.name))
      .filter((path) => extensions.has(extname(path)))
      .filter((path) => !/\.(test|spec)\.[^.]+$/.test(path)),
  )
}

function emptyStateActions(path: string, source: string): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const violations: string[] = []

  const inspect = (node: ts.Node) => {
    const opening = ts.isJsxSelfClosingElement(node)
      ? node
      : ts.isJsxElement(node)
        ? node.openingElement
        : null
    if (opening?.tagName.getText(file) === 'EmptyState') {
      for (const property of opening.attributes.properties) {
        if (!ts.isJsxAttribute(property)) continue
        const name = property.name.getText(file)
        if (name === 'actionLabel' || name === 'onAction') violations.push(name)
      }
    }

    ts.forEachChild(node, inspect)
  }

  inspect(file)
  return violations
}

describe('the production app consumes CLEAR 0.14.3 vocabulary', () => {
  it('contains none of the removed class or token names', () => {
    const removed = [
      'clr-load-ticks',
      'tracking-data-wide',
      'surface-overlay',
      'chamfer-xl',
      'chamfer--open-left',
      'chamfer--bottom-only',
      'glow-emissive',
      'text-shadow-glow',
      'glow-box',
      'hasLeftBorder',
    ]

    for (const path of productionFiles()) {
      const source = readFileSync(path, 'utf-8')
      for (const name of removed) expect(source, `${path}: ${name}`).not.toContain(name)
      expect(source, `${path}: retired pulse-micro`).not.toMatch(/(?<!clr-)pulse-micro/)
    }
  })

  it('uses role tokens rather than the legacy orange and blue aliases', () => {
    for (const path of productionFiles().filter((path) => !path.endsWith('skin-clear.css'))) {
      const source = readFileSync(path, 'utf-8')
      expect(source, path).not.toMatch(/var\(--color-(?:orange|blue)-/)
    }
  })

  it('does not put actions back inside EmptyState', () => {
    for (const path of productionFiles().filter((path) => extname(path) === '.tsx')) {
      const source = readFileSync(path, 'utf-8')
      expect(emptyStateActions(path, source), path).toEqual([])
    }
  })
})
