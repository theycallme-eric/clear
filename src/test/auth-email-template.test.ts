import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../..')
const template = readFileSync(
  resolve(repoRoot, 'supabase/templates/magic-link.html'),
  'utf8',
)
const verifier = readFileSync(
  resolve(repoRoot, 'scripts/backend-audit/verify-auth-email-template.mjs'),
  'utf8',
)

describe('hosted email matches CLEAR numeric OTP flow', () => {
  it('renders the code and never sends the unconsumed magic-link flow', () => {
    expect(template).toMatch(/{{\s*\.Token\s*}}/)
    expect(template).not.toMatch(/{{\s*\.ConfirmationURL\s*}}/i)
    expect(template).not.toMatch(/<a\b/i)
  })

  it('has a read-only live drift check for the hosted Supabase setting', () => {
    expect(verifier).toContain('mailer_templates_magic_link_content')
    expect(verifier).toContain('mailer_subjects_magic_link')
    expect(verifier).toContain('SUPABASE_ACCESS_TOKEN')
    expect(verifier).not.toMatch(/method:\s*['"](?:PATCH|POST|PUT|DELETE)['"]/)
  })
})
