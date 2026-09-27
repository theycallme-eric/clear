import { createAdminClient } from '../e2e/client.mjs'

const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

if (process.env.TASK_072_CONFIRM_RETIRE_AUTH_USERS !== '8-disposable-test-users') {
  throw new Error('TASK-072 auth retirement confirmation is missing')
}

const client = createAdminClient({
  url: required('SUPABASE_URL'),
  anonKey: required('SUPABASE_ANON_KEY'),
  serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
})

const users = await client.listUsers()
if (users.length !== 8) {
  throw new Error(`TASK-072 expected 8 disposable users, found ${users.length}`)
}

for (const user of users) await client.deleteUser(user.id)

const remaining = await client.listUsers()
if (remaining.length !== 0) {
  throw new Error(`TASK-072 auth retirement left ${remaining.length} users`)
}

console.log('TASK-072 retired 8 disposable auth users; 0 remain')

