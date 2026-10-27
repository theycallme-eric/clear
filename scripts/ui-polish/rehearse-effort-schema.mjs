/**
 * TASK-007 (REQ-012, TC-001) — rehearse the categorical-effort migration
 * against a disposable local PostgreSQL 17.
 *
 *     node scripts/ui-polish/rehearse-effort-schema.mjs
 *
 * What it proves, on synthetic rows and identities only:
 *
 *   1. The actual baseline — every migration in `supabase/migrations/` before
 *      the candidate — applies on the project's own Supabase PostgreSQL 17
 *      image, with its real `auth` schema, roles and RLS.
 *   2. Sets logged *before* the candidate (with and without a historical
 *      numeric `rpe`) survive it untouched and read back with `effort` NULL.
 *   3. After the candidate, as the owning `authenticated` user under RLS:
 *      all three categories and unanswered round-trip through insert and read;
 *      an old queued entry (no effort key) still inserts; a retry of the same
 *      client-minted id collides instead of duplicating or changing the row;
 *      an edit and a clear land; and `rpe` never moves.
 *   4. A number or an unknown key is refused, another user cannot read or
 *      correct the row, and `anon` cannot write it.
 *   5. No function or view definition changes, so no reader, adaptation or
 *      prompt input learns the categories; the readers that build set logs
 *      with `to_jsonb(l)` carry `effort` without being edited.
 *   6. The candidate is idempotent.
 *
 * Disposable by construction. It accepts no target: it starts one new
 * container from a locally present `supabase/postgres:17.*` image (`--pull
 * never`), with `--network none` so nothing outside the container is
 * reachable from it and nothing outside can reach it, talks to it only through
 * `docker exec … psql`, and removes exactly that container and its anonymous
 * volumes on every exit path. It refuses a non-local Docker endpoint, refuses
 * any argument, and strips database and Supabase credentials from the
 * environment it hands to `docker`, so a production credential in the
 * caller's shell is never read or forwarded.
 *
 * Exit codes: 0 when every check passed; 1 when a check failed; 2 when the
 * script refused to run (a target was offered, Docker is not local, or no
 * local PostgreSQL 17 image is present).
 */
import { spawnSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const CANDIDATE = '20261027000027_set_effort.sql'

const IMAGE_REPOSITORY = 'public.ecr.aws/supabase/postgres'
const LABEL = 'clear.rehearsal=effort-schema'
const READY_TIMEOUT_MS = 180_000

const CATEGORIES = ['too_hard', 'about_right', 'too_easy']

// ─────────────────────────────────────────────────────────────────────────────
// Refusals
// ─────────────────────────────────────────────────────────────────────────────

class Refusal extends Error {}
class CheckFailed extends Error {}

/**
 * The environment `docker` runs with: enough to find the binary and its local
 * context, and nothing that names a database or carries a key.
 */
function dockerEnv() {
  const env = {}
  for (const key of ['PATH', 'HOME', 'USER', 'TMPDIR', 'DOCKER_CONFIG', 'DOCKER_HOST', 'DOCKER_CONTEXT']) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  return env
}

function refuseTargets(argv) {
  if (argv.length > 0) {
    throw new Refusal(
      'takes no arguments. It provisions its own disposable ' +
        'container and will not be pointed at any other database.',
    )
  }
}

function refuseRemoteDocker() {
  const host = process.env.DOCKER_HOST
  if (host !== undefined && host !== '' && !/^(unix|npipe):\/\//.test(host)) {
    throw new Refusal('DOCKER_HOST is not a local socket; refusing a remote Docker engine.')
  }

  const endpoint = docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], {
    allowFailure: true,
  })
  const resolved = host !== undefined && host !== '' ? host : endpoint.stdout.trim()
  if (!/^(unix|npipe):\/\//.test(resolved)) {
    throw new Refusal('the Docker endpoint is missing or is not a local socket.')
  }
}

/** The newest locally present Supabase PostgreSQL 17 image. Never pulled. */
function localPostgres17Image() {
  const listed = docker(['image', 'ls', IMAGE_REPOSITORY, '--format', '{{.Tag}}']).stdout
  const tags = listed
    .split('\n')
    .map((tag) => tag.trim())
    .filter((tag) => /^17(\.\d+)+$/.test(tag))
    .sort((left, right) => compareVersions(right, left))

  if (tags.length === 0) {
    throw new Refusal(
      `no local ${IMAGE_REPOSITORY}:17.* image. supabase/config.toml pins major_version 17; ` +
        'provision the image deliberately first — this script never pulls one.',
    )
  }
  return `${IMAGE_REPOSITORY}:${tags[0]}`
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Docker and psql
// ─────────────────────────────────────────────────────────────────────────────

function docker(args, { input, allowFailure = false } = {}) {
  const result = spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    env: dockerEnv(),
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw new Refusal(`docker is not runnable: ${result.error.message}`)
  if (result.status !== 0 && !allowFailure) {
    throw new CheckFailed(`docker ${args[0]} failed (${result.status}):\n${result.stderr.trim()}`)
  }
  return result
}

/** The container this run owns, and nothing else. */
const owned = { id: null }

function cleanUp() {
  if (owned.id === null) return
  const id = owned.id
  owned.id = null
  // By id, and only after confirming the label: this removes the container
  // this run started and its anonymous data volume, never anything else.
  const label = docker(['inspect', '--format', '{{index .Config.Labels "clear.rehearsal"}}', id], {
    allowFailure: true,
  })
  if (label.status === 0 && label.stdout.trim() === 'effort-schema') {
    docker(['rm', '--force', '--volumes', id], { allowFailure: true })
  }
}

function startContainer(image) {
  const name = `clear-effort-rehearsal-${randomBytes(4).toString('hex')}`
  const password = randomBytes(18).toString('base64url')
  const run = docker([
    'run',
    '--detach',
    '--pull', 'never',
    '--network', 'none',
    '--name', name,
    '--label', LABEL,
    '--env', `POSTGRES_PASSWORD=${password}`,
    image,
  ])
  owned.id = run.stdout.trim()
  return name
}

/**
 * Runs SQL as `role` inside the container, over the container's own loopback.
 * The init process's temporary server listens on no TCP port, so a TCP answer
 * means the real server is up.
 */
function psql(sql, { role = 'postgres', allowFailure = false } = {}) {
  const result = docker(
    [
      'exec', '--interactive', owned.id,
      'psql', '--host', '127.0.0.1', '--username', role, '--dbname', 'postgres',
      '--no-psqlrc', '--quiet', '--tuples-only', '--no-align',
      '--set', 'ON_ERROR_STOP=1',
    ],
    { input: sql, allowFailure: true },
  )
  if (result.status !== 0 && !allowFailure) {
    throw new CheckFailed(`psql as ${role} failed:\n${result.stderr.trim()}`)
  }
  return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr.trim() }
}

async function waitForReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS
  for (;;) {
    const ready = docker(
      ['exec', owned.id, 'pg_isready', '--host', '127.0.0.1', '--username', 'postgres'],
      { allowFailure: true },
    )
    if (ready.status === 0) {
      const probe = psql("select to_regprocedure('auth.uid()') is not null", { allowFailure: true })
      if (probe.ok && probe.out === 't') return
    }
    if (Date.now() > deadline) {
      const logs = docker(['logs', '--tail', '40', owned.id], { allowFailure: true })
      throw new CheckFailed(`PostgreSQL did not become ready:\n${logs.stdout}${logs.stderr}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Checks
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0

function check(label, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new CheckFailed(`${label}\n    expected ${e}\n    actual   ${a}`)
  passed += 1
  write(`  ok  ${label}`)
}

function write(line) {
  process.stdout.write(`${line}\n`)
}

/** `select` one row as JSON, as `role`. */
function one(sql, role) {
  const { out } = psql(`select coalesce(to_json((${sql}))::text, 'null')`, { role })
  return JSON.parse(out)
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

/**
 * SQL run as the synthetic user, under RLS, the way PostgREST runs a request:
 * `set local role authenticated` with the JWT claims set for the transaction.
 */
function asUser(userId, body) {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' })
  return [
    'begin;',
    'set local role authenticated;',
    `select set_config('request.jwt.claims', ${sqlString(claims)}, true);`,
    `select set_config('request.jwt.claim.sub', ${sqlString(userId)}, true);`,
    body,
    'commit;',
  ].join('\n')
}

/**
 * The PostgREST insert path for one JSON body: only the keys present are
 * named, so an omitted key takes the column's default — for `effort`, NULL.
 */
function postgrestInsert(payload) {
  const columns = Object.keys(payload).join(', ')
  return (
    `insert into public.exercise_set_logs (${columns}) ` +
    `select ${columns} from json_populate_record(null::public.exercise_set_logs, ${sqlString(
      JSON.stringify(payload),
    )}::json)`
  )
}

/**
 * The body `setLogInsert` produces (src/state/set-logging.ts) for an entry:
 * `rpe` is always null, and `effort` is present only when answered.
 */
function clientInsert({ id, exerciseId, setNumber, performed }) {
  return {
    id,
    workout_exercise_id: exerciseId,
    set_number: setNumber,
    actual_reps: performed.reps ?? null,
    actual_duration_seconds: null,
    actual_distance: null,
    actual_distance_unit: null,
    weight: performed.weight ?? null,
    weight_unit: 'kg',
    rpe: null,
    is_warmup_set: false,
    ...(performed.effort === undefined || performed.effort === null ? {} : { effort: performed.effort }),
  }
}

function definitions() {
  return psql(`
    select string_agg(format('%s=%s', p.oid::regprocedure, md5(pg_get_functiondef(p.oid))), E'\\n' order by 1)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f';
    select string_agg(format('%s=%s', c.relname, md5(pg_get_viewdef(c.oid))), E'\\n' order by 1)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v';
  `).out
}

function applyMigration(file) {
  psql(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
}

async function rehearse() {
  const image = localPostgres17Image()
  write('CLEAR effort-schema rehearsal (disposable, local, synthetic)')
  write('')
  write(`  image      ${image}  (local only, --pull never)`)
  const name = startContainer(image)
  write(`  container  ${name}  (--network none, removed on exit)`)
  await waitForReady()

  const major = one(`select current_setting('server_version_num')::int / 10000`)
  check('server is PostgreSQL 17, matching supabase/config.toml', major, 17)
  check(
    'project auth prerequisites exist: auth.uid(), authenticated, anon',
    one(`select json_build_array(
      to_regprocedure('auth.uid()') is not null,
      exists (select 1 from pg_roles where rolname = 'authenticated'),
      exists (select 1 from pg_roles where rolname = 'anon'))`),
    [true, true, true],
  )

  // ── baseline ──
  const files = readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql')).sort()
  const candidateIndex = files.indexOf(CANDIDATE)
  if (candidateIndex === -1) throw new CheckFailed(`${CANDIDATE} is not in supabase/migrations/`)
  const baseline = files.slice(0, candidateIndex)
  for (const file of baseline) applyMigration(file)
  write(`  applied    ${baseline.length} baseline migrations`)
  check(
    'baseline has rpe and no effort column',
    one(`select json_build_array(
      exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'exercise_set_logs' and column_name = 'rpe'),
      exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'exercise_set_logs' and column_name = 'effort'))`),
    [true, false],
  )

  // ── synthetic owners and one prescription each ──
  const userA = randomUUID()
  const userB = randomUUID()
  const exerciseA = randomUUID()
  const exerciseB = randomUUID()
  const exerciseId = `rehearsal_${randomBytes(3).toString('hex')}`
  const seed = (user, exercise, tag) => `
    with s as (
      insert into public.workout_sessions (user_id, date, title, session_focus,
        requested_duration_mins, effective_duration_target_mins,
        requested_intensity, effective_intensity, prompt_version, contract_version)
      values ('${user}', current_date, 'Rehearsal ${tag}', 'full_body', 45, 45, 6, 6,
              'rehearsal', '4.2.0')
      returning id),
    sec as (
      insert into public.workout_sections (session_id, section_type, order_index, section_title)
      select id, 'primary_lift', 0, 'Primary lift' from s returning id),
    b as (
      insert into public.workout_blocks (section_id, order_index, structure_type)
      select id, 0, 'standard' from sec returning id)
    insert into public.workout_exercises (id, block_id, exercise_id, order_index, modality,
      sets, target_kind, target_value, equipment_used, slot_id, load_type)
    select '${exercise}', id, '${exerciseId}', 0, 'reps', 5, 'fixed', 8, 'dumbbell',
           gen_random_uuid(), 'none'
    from b;`
  psql(`
    insert into auth.users (id, aud, role, email, created_at, updated_at)
    values ('${userA}', 'authenticated', 'authenticated', 'rehearsal-a@example.invalid', now(), now()),
           ('${userB}', 'authenticated', 'authenticated', 'rehearsal-b@example.invalid', now(), now());
    insert into public.exercise_definitions (id, name, equipment_options, default_equipment)
    values ('${exerciseId}', 'Rehearsal squat', array['dumbbell'], 'dumbbell');
    ${seed(userA, exerciseA, 'A')}
    ${seed(userB, exerciseB, 'B')}
  `)

  // ── legacy rows, written by the owner before the candidate exists ──
  const legacyRpe = randomUUID()
  const legacyNull = randomUUID()
  psql(
    asUser(
      userA,
      `insert into public.exercise_set_logs
         (id, workout_exercise_id, set_number, actual_reps, weight, weight_unit, rpe)
       values ('${legacyRpe}', '${exerciseA}', 1, 8, 60, 'kg', 7.5),
              ('${legacyNull}', '${exerciseA}', 2, 8, 60, 'kg', null);`,
    ),
  )
  const before = definitions()
  const legacyBefore = one(
    `select json_agg(json_build_array(id, set_number, actual_reps, weight, rpe) order by set_number)
     from public.exercise_set_logs`,
  )

  // ── candidate ──
  applyMigration(CANDIDATE)
  write(`  applied    ${CANDIDATE}`)

  check(
    'effort is a nullable public.set_effort with no default',
    one(`select json_build_array(udt_schema, udt_name, is_nullable, column_default)
         from information_schema.columns where table_schema = 'public'
         and table_name = 'exercise_set_logs' and column_name = 'effort'`),
    ['public', 'set_effort', 'YES', null],
  )
  check(
    'set_effort holds exactly the three categories',
    one(`select json_agg(enumlabel order by enumsortorder) from pg_enum
         where enumtypid = 'public.set_effort'::regtype`),
    CATEGORIES,
  )
  check(
    'rpe keeps its type and its 1–10 check',
    one(`select json_build_array(
      (select data_type || '(' || numeric_precision || ',' || numeric_scale || ')'
       from information_schema.columns where table_schema = 'public'
       and table_name = 'exercise_set_logs' and column_name = 'rpe'),
      (select pg_get_constraintdef(oid) from pg_constraint
       where conname = 'exercise_set_logs_rpe_range'))`),
    ['numeric(3,1)', 'CHECK (((rpe IS NULL) OR ((rpe >= (1)::numeric) AND (rpe <= (10)::numeric))))'],
  )
  check(
    'no function or view definition changed (no reader, adaptation or prompt change)',
    definitions() === before,
    true,
  )
  check(
    'legacy rows are untouched — ids, measurements and historical rpe',
    one(`select json_agg(json_build_array(id, set_number, actual_reps, weight, rpe) order by set_number)
         from public.exercise_set_logs`),
    legacyBefore,
  )
  check(
    'legacy rows read back with effort NULL, nothing fabricated from rpe',
    one(
      `select json_agg(json_build_array(rpe, effort) order by set_number)
       from public.exercise_set_logs where id in ('${legacyRpe}', '${legacyNull}')`,
      'postgres',
    ),
    [[7.5, null], [null, null]],
  )

  // ── new rows: three categories, unanswered by omission and by explicit null ──
  const answered = CATEGORIES.map((effort, index) => ({
    id: randomUUID(),
    exerciseId: exerciseA,
    setNumber: 3 + index,
    performed: { reps: 8, weight: 60, effort },
  }))
  const omitted = { id: randomUUID(), exerciseId: exerciseA, setNumber: 6, performed: { reps: 8, weight: 60 } }
  const oldQueued = {
    // An entry an older build queued: no effort key at all, and a legacy rpe
    // the queue tolerates and the writer no longer sends.
    id: randomUUID(),
    exerciseId: exerciseA,
    setNumber: 7,
    performed: { reps: 6, weight: 62.5, rpe: 8 },
  }
  const explicitNull = { id: randomUUID(), setNumber: 8 }

  psql(
    asUser(
      userA,
      [...answered, omitted, oldQueued].map((entry) => `${postgrestInsert(clientInsert(entry))};`).join('\n') +
        `\n${postgrestInsert({
          ...clientInsert({ ...explicitNull, exerciseId: exerciseA, performed: { reps: 8 } }),
          effort: null,
        })};`,
    ),
  )
  const readBack = (ids) =>
    one(
      `select json_agg(json_build_array(effort, rpe) order by set_number) from public.exercise_set_logs
       where id in (${ids.map((id) => sqlString(id)).join(', ')})`,
      'postgres',
    )
  check(
    'all three categories round-trip through the owner insert and read',
    readBack(answered.map((entry) => entry.id)),
    CATEGORIES.map((effort) => [effort, null]),
  )
  check(
    'unanswered round-trips as NULL — by omission, from an old queued entry, and explicitly',
    readBack([omitted.id, oldQueued.id, explicitNull.id]),
    [[null, null], [null, null], [null, null]],
  )
  check(
    'the owner reads every category back under RLS',
    JSON.parse(
      psql(
        asUser(
          userA,
          `select json_agg(effort order by set_number) from public.exercise_set_logs
           where set_number between 3 and 8;`,
        ),
      ).out.split('\n').pop(),
    ),
    [...CATEGORIES, null, null, null],
  )

  // ── retry: the same client-minted id collides and changes nothing ──
  const retried = answered[1]
  const retry = psql(
    asUser(userA, `${postgrestInsert(clientInsert({ ...retried, performed: { ...retried.performed, effort: 'too_easy' } }))};`),
    { allowFailure: true },
  )
  check(
    'a retried flush collides on its own id (23505) instead of duplicating',
    [retry.ok, /duplicate key value/.test(retry.err)],
    [false, true],
  )
  check(
    'and the stored answer is the first write, unchanged',
    one(`select effort from public.exercise_set_logs where id = '${retried.id}'`),
    'about_right',
  )

  // ── edit and clear, as the owner ──
  const target = answered[0].id
  psql(asUser(userA, `update public.exercise_set_logs set effort = 'too_easy' where id = '${target}';`))
  check(
    'an edit replaces the category, leaving measurements and rpe',
    one(`select json_build_array(effort, actual_reps, weight, rpe) from public.exercise_set_logs where id = '${target}'`),
    ['too_easy', 8, 60, null],
  )
  psql(asUser(userA, `update public.exercise_set_logs set effort = null where id = '${target}';`))
  check(
    'a clear returns it to unanswered',
    one(`select effort from public.exercise_set_logs where id = '${target}'`),
    null,
  )
  psql(asUser(userA, `update public.exercise_set_logs set effort = 'too_hard' where id = '${legacyRpe}';`))
  check(
    'a legacy row can be answered later without disturbing its historical rpe',
    one(`select json_build_array(effort, rpe) from public.exercise_set_logs where id = '${legacyRpe}'`),
    ['too_hard', 7.5],
  )

  // ── refusals ──
  for (const bad of ['7', 'hard', '']) {
    const refused = psql(
      asUser(userA, `update public.exercise_set_logs set effort = ${sqlString(bad)} where id = '${target}';`),
      { allowFailure: true },
    )
    check(`effort ${JSON.stringify(bad)} is refused by the enum`, refused.ok, false)
  }
  const numeric = psql(
    asUser(userA, `update public.exercise_set_logs set effort = 2 where id = '${target}';`),
    { allowFailure: true },
  )
  check('a numeric effort is refused, never cast', numeric.ok, false)

  const foreign = psql(
    asUser(
      userB,
      `with u as (update public.exercise_set_logs set effort = 'too_easy' where id = '${legacyNull}' returning 1)
       select json_build_array((select count(*) from u),
         (select count(*) from public.exercise_set_logs where workout_exercise_id = '${exerciseA}'));`,
    ),
  )
  check('another user can neither correct nor read the row', JSON.parse(foreign.out.split('\n').pop()), [0, 0])
  check(
    'and the row is unchanged',
    one(`select effort from public.exercise_set_logs where id = '${legacyNull}'`),
    null,
  )
  const anon = psql(
    `begin; set local role anon;
     insert into public.exercise_set_logs (id, workout_exercise_id, set_number, weight_unit, effort)
     values ('${randomUUID()}', '${exerciseA}', 99, 'kg', 'too_hard'); commit;`,
    { allowFailure: true },
  )
  check('anon cannot write effort', anon.ok, false)

  // ── readers built on to_jsonb(l) carry it without an edit ──
  check(
    'session_performed carries effort for every set, NULL for the unanswered',
    one(
      `select json_agg(l->>'effort' order by (l->>'set_number')::int)
       from public.session_performed sp, unnest(sp.set_logs) l
       where sp.workout_exercise_id = '${exerciseA}'`,
    ),
    ['too_hard', null, null, 'about_right', 'too_easy', null, null, null],
  )

  // ── idempotent ──
  const state = () =>
    one(`select json_build_array(
      (select json_agg(json_build_array(id, effort, rpe) order by id) from public.exercise_set_logs),
      (select json_agg(enumlabel order by enumsortorder) from pg_enum
       where enumtypid = 'public.set_effort'::regtype))`)
  const settled = state()
  applyMigration(CANDIDATE)
  check('reapplying the candidate is a no-op', state(), settled)
}

/** Confirms the container this run started no longer exists. */
function confirmRemoved(id) {
  return docker(['inspect', id], { allowFailure: true }).status !== 0
}

async function main(argv) {
  const interrupt = () => {
    cleanUp()
    process.exit(130)
  }
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', interrupt)

  try {
    refuseTargets(argv)
    refuseRemoteDocker()
    await rehearse()
    const id = owned.id
    cleanUp()
    check('the disposable container and its volume were removed', confirmRemoved(id), true)
    write('')
    write(`PASSED — ${passed} checks. No remote schema was touched; no backfill was run.`)
    return 0
  } catch (error) {
    write('')
    if (error instanceof Refusal) {
      write(`REFUSED — ${error.message}`)
      return 2
    }
    write(`FAILED — ${error instanceof Error ? error.message : String(error)}`)
    return 1
  } finally {
    cleanUp()
  }
}

process.exitCode = await main(process.argv.slice(2))
