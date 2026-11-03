import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('public Playwright diagnostics', () => {
  it('redacts credentials through nested trace/report archives while preserving screenshots and results', () => {
    expect(() => execFileSync('python3', ['scripts/e2e/test_report_redaction.py'], {
      cwd: resolve(import.meta.dirname, '../..'), stdio: 'pipe',
    })).not.toThrow()
  })
})
