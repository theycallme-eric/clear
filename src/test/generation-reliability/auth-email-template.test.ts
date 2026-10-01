import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EXPECTED_SUBJECT,
  TEMPLATE_PATH,
  checkAuthEmailTemplate,
  hostedDrift,
  templateIntentProblems,
} from '../../../scripts/generation-reliability/auth-email-template.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const committed = readFileSync(resolve(repoRoot, TEMPLATE_PATH), 'utf8')
const source = readFileSync(
  resolve(repoRoot, 'scripts/generation-reliability/auth-email-template.mjs'),
  'utf8',
)

const CODE_BODY = '<p><strong>{{ .Token }}</strong></p>'
const LINK_BODY = '<p><a href="{{ .ConfirmationURL }}">Sign in</a></p>'

const roots: string[] = []

function rootWith(body: string) {
  const root = mkdtempSync(join(tmpdir(), 'gr-auth-template-'))
  roots.push(root)
  mkdirSync(join(root, 'supabase/templates'), { recursive: true })
  writeFileSync(join(root, TEMPLATE_PATH), body)
  return root
}

function hostedConfig(body: string, subject = EXPECTED_SUBJECT) {
  return {
    mailer_subjects_magic_link: subject,
    mailer_templates_magic_link_content: body,
  }
}

function fetchReturning(config: Record<string, unknown>, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(config), { status }))
}

const withToken = { SUPABASE_ACCESS_TOKEN: 'test-token', SUPABASE_PROJECT_REF: 'test-ref' }

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('REQ-018 committed email template intent', () => {
  it('the committed template renders the numeric code and no confirmation link', () => {
    expect(templateIntentProblems(committed)).toEqual([])
  })

  it('fails a template that lacks the numeric code token', () => {
    expect(templateIntentProblems('<p>Your code is on its way.</p>')).toEqual([
      'does not render the numeric code token {{ .Token }}',
    ])
  })

  it('fails a template that uses the confirmation-link token in place of the code', () => {
    const problems = templateIntentProblems(LINK_BODY)

    expect(problems).toContain('does not render the numeric code token {{ .Token }}')
    expect(problems.join('\n')).toContain('{{ .ConfirmationURL }}')
  })

  it('fails a template that renders the code and still carries a confirmation link', () => {
    expect(templateIntentProblems(`${CODE_BODY}\n{{.ConfirmationURL}}`)).toHaveLength(1)
  })
})

describe('REQ-018 hosted drift comparison', () => {
  it('reports no drift when the hosted body and subject equal the committed ones', () => {
    expect(hostedDrift({ committedBody: CODE_BODY, hosted: hostedConfig(`${CODE_BODY}\n`) })).toEqual([])
  })

  it('names the differing field without including either body', () => {
    const drift = hostedDrift({ committedBody: CODE_BODY, hosted: hostedConfig(LINK_BODY, 'Magic Link') })

    expect(drift).toContain('hosted subject differs from the committed subject')
    expect(drift).toContain(`hosted body differs from ${TEMPLATE_PATH}`)
    expect(drift.join('\n')).not.toContain('Sign in')
    expect(drift.join('\n')).not.toContain('Magic Link')
  })
})

describe('REQ-018 gr:auth-template --check', () => {
  it('fails on a bad committed template before reading anything hosted', async () => {
    const fetchImpl = fetchReturning(hostedConfig(LINK_BODY))
    const result = await checkAuthEmailTemplate({
      root: rootWith(LINK_BODY),
      processEnv: withToken,
      fetchImpl,
    })

    expect(result.ok).toBe(false)
    expect(result.hosted).toBe('not-reached')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('passes when the hosted template matches, with one read-only request', async () => {
    const fetchImpl = fetchReturning(hostedConfig(CODE_BODY))
    const result = await checkAuthEmailTemplate({
      root: rootWith(CODE_BODY),
      processEnv: withToken,
      fetchImpl,
    })

    expect(result).toMatchObject({ ok: true, hosted: 'matched' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.supabase.com/v1/projects/test-ref/config/auth')
    expect(init.method).toBeUndefined()
    expect(init.body).toBeUndefined()
  })

  it('fails on hosted drift and prints neither body nor token', async () => {
    const result = await checkAuthEmailTemplate({
      root: rootWith(CODE_BODY),
      processEnv: withToken,
      fetchImpl: fetchReturning(hostedConfig(LINK_BODY)),
    })

    expect(result).toMatchObject({ ok: false, hosted: 'drift' })
    const output = result.lines.join('\n')
    expect(output).not.toContain('Sign in')
    expect(output).not.toContain('test-token')
  })

  it('fails when the hosted config cannot be read', async () => {
    await expect(
      checkAuthEmailTemplate({
        root: rootWith(CODE_BODY),
        processEnv: withToken,
        fetchImpl: fetchReturning({ message: 'private detail' }, 401),
      }),
    ).rejects.toThrow('Reading the hosted Auth config failed with 401')
  })

  it('without the token, says the hosted comparison was not run rather than claiming a match', async () => {
    const fetchImpl = fetchReturning(hostedConfig(CODE_BODY))
    const result = await checkAuthEmailTemplate({
      root: rootWith(CODE_BODY),
      processEnv: {},
      fetchImpl,
    })

    expect(result).toMatchObject({ ok: true, hosted: 'not-run' })
    expect(result.lines.join('\n')).toContain('NOT RUN hosted template comparison')
    expect(result.lines.join('\n')).not.toContain('match the committed')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('--require-hosted turns a skipped comparison into a failure', async () => {
    const result = await checkAuthEmailTemplate({
      root: rootWith(CODE_BODY),
      processEnv: {},
      requireHosted: true,
    })

    expect(result).toMatchObject({ ok: false, hosted: 'not-run' })
  })

  it('never writes to the hosted project or sends mail', () => {
    expect(source).not.toMatch(/method:\s*['"]/)
    expect(source.match(/fetchImpl\(/g)).toHaveLength(1)
    expect(source).not.toMatch(/\/otp|\/magiclink|generate_link|signInWithOtp/)
  })
})
