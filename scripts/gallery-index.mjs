/** Derive the human/agent index from the actual register without mounting examples. */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const source = readFileSync(resolve(root, 'src/dev/gallery-registry.tsx'), 'utf8')
const ast = ts.createSourceFile('gallery-registry.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const entries = []
function text(node) {
  if (node && ts.isStringLiteralLike(node)) return node.text
  if (node && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return text(node.left) + text(node.right)
  throw new Error('Registry index metadata must be static text')
}
function visit(node) {
  if (ts.isObjectLiteralExpression(node)) {
    const fields = new Map(node.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(ast), p.initializer]))
    if (fields.has('component') && fields.has('module') && fields.has('specimens')) {
      entries.push({ component: text(fields.get('component')), module: text(fields.get('module')), summary: text(fields.get('summary')) })
    }
  }
  ts.forEachChild(node, visit)
}
visit(ast)
if (!entries.length) throw new Error('No gallery entries found')
entries.sort((a, b) => a.component.localeCompare(b.component))
const clean = value => value.replaceAll('|', '\\|').replace(/\s+/g, ' ').trim()
const markdown = '# App component index\n\nGenerated from `src/dev/gallery-registry.tsx` by `node scripts/gallery-index.mjs`.\nEdit that register, then regenerate; do not edit this table. These are registered\nexamples, not complete screen/state coverage. API details live in the linked source.\n\n'
  + '| Component | Source | Purpose |\n| --- | --- | --- |\n'
  + entries.map(e => `| ${e.component} | [${e.module}](../../../${e.module}) | ${clean(e.summary)} |`).join('\n') + '\n'
const target = resolve(root, 'docs/design/library/COMPONENTS.md')
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== markdown) throw new Error('Regenerate docs/design/library/COMPONENTS.md')
} else writeFileSync(target, markdown)
process.stdout.write(`${entries.length} registered component entries${process.argv.includes('--check') ? ' verified' : ' generated'}.\n`)
