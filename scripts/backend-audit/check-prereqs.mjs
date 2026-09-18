#!/usr/bin/env node
// REQ-008 execution prerequisites. Prints presence booleans only — never values.
const checks = [
  ['PRE-003 SUPABASE_SERVICE_ROLE_KEY', Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)],
  ['PRE-004 SUPABASE_DB_URL', Boolean(process.env.SUPABASE_DB_URL)],
  ['SUPABASE_ACCESS_TOKEN (CLI token, optional)', Boolean(process.env.SUPABASE_ACCESS_TOKEN)],
  ['VITE_SUPABASE_URL (optional)', Boolean(process.env.VITE_SUPABASE_URL)],
];
let failed = false;
for (const [name, present] of checks) {
  console.log(`${name}: ${present ? 'set' : 'NOT SET'}`);
  if (!present && !name.includes('optional')) failed = true;
}
process.exit(failed ? 1 : 0);
