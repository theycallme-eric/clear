const PROJECT_REF = 'qxckevxniacktaqecypl'
const EXPECTED_OLD_SITE = 'https://clear-app-1111.vercel.app'
const NEW_SITE = 'https://clear-peach.vercel.app'
const token = process.env.SUPABASE_ACCESS_TOKEN

if (!token) throw new Error('Missing SUPABASE_ACCESS_TOKEN')
if (process.env.TASK_072_CONFIRM_AUTH_URLS !== NEW_SITE) {
  throw new Error('TASK-072 auth URL confirmation is missing')
}

const endpoint = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
}

const currentResponse = await fetch(endpoint, { headers })
if (!currentResponse.ok) {
  throw new Error(`Reading Supabase Auth config failed with ${currentResponse.status}`)
}
const current = await currentResponse.json()

if (current.site_url !== EXPECTED_OLD_SITE) {
  throw new Error(`TASK-072 expected the old site URL before cutover; found ${current.site_url}`)
}

const updateResponse = await fetch(endpoint, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({
    site_url: NEW_SITE,
    uri_allow_list: `${NEW_SITE}/reset-password`,
  }),
})
if (!updateResponse.ok) {
  throw new Error(`Updating Supabase Auth config failed with ${updateResponse.status}`)
}

const updated = await updateResponse.json()
if (
  updated.site_url !== NEW_SITE ||
  updated.uri_allow_list !== `${NEW_SITE}/reset-password`
) {
  throw new Error('Supabase Auth config did not retain the reviewed new URLs')
}

console.log('TASK-072 updated Supabase Auth site and reset-password URLs')

