import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'qxckevxniacktaqecypl'
const EXPECTED_SUBJECT = 'Your CLEAR sign-in code'
const TEMPLATE_PATH = resolve('supabase/templates/magic-link.html')
const accessToken = process.env.SUPABASE_ACCESS_TOKEN

if (!accessToken) {
  throw new Error('Missing SUPABASE_ACCESS_TOKEN for the read-only hosted-template check')
}

const expectedBody = (await readFile(TEMPLATE_PATH, 'utf8')).trim()
if (!/{{\s*\.Token\s*}}/.test(expectedBody)) {
  throw new Error('Committed Magic link or OTP template does not render {{ .Token }}')
}
if (/{{\s*\.ConfirmationURL\s*}}/i.test(expectedBody)) {
  throw new Error('Committed Magic link or OTP template still renders {{ .ConfirmationURL }}')
}

const response = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
  { headers: { Authorization: `Bearer ${accessToken}` } },
)
if (!response.ok) {
  throw new Error(`Reading Supabase Auth config failed with ${response.status}`)
}

const live = await response.json()
const liveBody = String(live.mailer_templates_magic_link_content ?? '').trim()
const failures = []

if (live.mailer_subjects_magic_link !== EXPECTED_SUBJECT) {
  failures.push('hosted subject differs from the committed subject')
}
if (liveBody !== expectedBody) {
  failures.push('hosted body differs from supabase/templates/magic-link.html')
}
if (!/{{\s*\.Token\s*}}/.test(liveBody)) {
  failures.push('hosted body does not render {{ .Token }}')
}
if (/{{\s*\.ConfirmationURL\s*}}/i.test(liveBody)) {
  failures.push('hosted body still renders {{ .ConfirmationURL }}')
}

if (failures.length > 0) {
  throw new Error(`Supabase Auth email template drift:\n- ${failures.join('\n- ')}`)
}

console.log(`Supabase Auth email template matches ${TEMPLATE_PATH}`)
