/**
 * CLEAR Structured Logger (CORE-02)
 *
 * Leveled JSON-line logger with scoped children, shared by the client and
 * edge runtimes. Redaction is structural, not advisory:
 *
 * - The API accepts plain field objects, never raw header maps. A `Headers`
 *   (or Map / header-container) value is replaced wholesale before emit.
 * - Denylisted keys — authorization, apikey, token, secret, password,
 *   cookie, session, credential, email, and friends — are masked wherever
 *   they appear, at any nesting depth, in any casing.
 * - String values that look like bearer tokens, JWTs, or email addresses
 *   are masked even under safe keys.
 *
 * Raw `console` calls are banned in app-owned source (ESLint `no-console`
 * plus the CI grep gate); this module is the only sanctioned sink.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Levels and sinks
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

/**
 * Destination for emitted lines. Tests inject a memory sink; the default
 * sink binds to the runtime's global logging object (browser or Deno edge).
 */
export interface LogSink {
  write(level: LogLevel, line: string): void
}

const globalOut = globalThis.console

const defaultSink: LogSink = {
  write(level, line) {
    if (level === 'debug') globalOut.debug(line)
    else if (level === 'info') globalOut.info(line)
    else if (level === 'warn') globalOut.warn(line)
    else globalOut.error(line)
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Redaction
// ─────────────────────────────────────────────────────────────────────────────

const REDACTED = '[redacted]'
const REDACTED_HEADERS = '[redacted:headers]'
const MAX_DEPTH = 8

/**
 * A key is denylisted when its normalized form (lowercase, separators
 * stripped) contains any of these fragments — so `Authorization`,
 * `x-api-key`, `refresh_token`, and `userEmail` are all caught.
 */
const denylistFragments = [
  'authorization',
  'apikey',
  'token',
  'secret',
  'password',
  'passwd',
  'cookie',
  'session',
  'credential',
  'bearer',
  'email',
  'jwt',
]

function isDenylistedKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  return denylistFragments.some((fragment) => normalized.includes(fragment))
}

const bearerPattern = /\bbearer\s+[\w.~+/=-]+/gi
const jwtPattern = /\bey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
const emailPattern =
  /[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/g

function redactString(value: string): string {
  return value
    .replace(bearerPattern, REDACTED)
    .replace(jwtPattern, REDACTED)
    .replace(emailPattern, REDACTED)
}

/**
 * Header maps are rejected wholesale — even their "safe" entries never
 * reach a log line. Covers fetch `Headers`, `Map`, and duck-typed header
 * containers from other runtimes.
 */
function isHeaderMap(value: object): boolean {
  if (typeof Headers !== 'undefined' && value instanceof Headers) return true
  if (value instanceof Map) return true
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.get === 'function' &&
    typeof candidate.has === 'function' &&
    typeof candidate.append === 'function'
  )
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value

  switch (typeof value) {
    case 'string':
      return redactString(value)
    case 'number':
    case 'boolean':
      return value
    case 'bigint':
      return value.toString()
    case 'function':
    case 'symbol':
      return '[unloggable]'
  }

  const obj = value as object
  if (isHeaderMap(obj)) return REDACTED_HEADERS
  if (depth >= MAX_DEPTH) return '[max-depth]'
  if (seen.has(obj)) return '[circular]'
  seen.add(obj)

  if (Array.isArray(obj)) {
    return obj.map((item) => redactValue(item, depth + 1, seen))
  }
  if (obj instanceof Date) return obj.toISOString()
  if (obj instanceof Error) {
    return { name: obj.name, message: redactString(obj.message) }
  }

  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(obj)) {
    out[key] = isDenylistedKey(key) ? REDACTED : redactValue(val, depth + 1, seen)
  }
  return out
}

/**
 * Structurally redacts any value. Exposed so boundary code can sanitize
 * data before storing it in an `AppError`'s details, not just before logging.
 */
export function redact(value: unknown): unknown {
  return redactValue(value, 0, new WeakSet())
}

// ─────────────────────────────────────────────────────────────────────────────
// Logger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contextual fields for a log entry. Pass plain objects with the values you
 * mean to log — never a request's header map.
 */
export interface LogFields {
  readonly [key: string]: unknown
}

export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /** Returns a logger whose scope is `parent.child` with merged bound fields. */
  child(scope: string, fields?: LogFields): Logger
}

export interface LoggerOptions {
  scope?: string
  level?: LogLevel
  sink?: LogSink
  /** Fields bound to every entry this logger (and its children) emits. */
  fields?: LogFields
}

function normalizeFields(fields?: LogFields): Record<string, unknown> {
  if (!fields || typeof fields !== 'object') return {}
  if (isHeaderMap(fields)) return { fields: REDACTED_HEADERS }
  return fields as Record<string, unknown>
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const scope = options.scope ?? ''
  const level = options.level ?? 'info'
  const sink = options.sink ?? defaultSink
  const boundFields = normalizeFields(options.fields)

  function emit(entryLevel: LogLevel, message: string, fields?: LogFields): void {
    if (levelRank[entryLevel] < levelRank[level]) return
    const merged = redact({ ...boundFields, ...normalizeFields(fields) }) as Record<
      string,
      unknown
    >
    // Fixed keys come last so caller fields can never spoof them.
    const entry: Record<string, unknown> = {
      ...merged,
      ...(scope ? { scope } : {}),
      level: entryLevel,
      msg: redactString(message),
      time: new Date().toISOString(),
    }
    sink.write(entryLevel, JSON.stringify(entry))
  }

  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    child: (childScope, childFields) =>
      createLogger({
        scope: scope ? `${scope}.${childScope}` : childScope,
        level,
        sink,
        fields: { ...boundFields, ...normalizeFields(childFields) },
      }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Edge request logging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The one structured line an edge function emits per request. Fields are
 * picked explicitly, so nothing else on the input object — headers, tokens,
 * emails, careless spreads — can reach the line.
 */
export interface EdgeRequestSummary {
  requestId: string
  route: string
  status: number
  durationMs: number
}

export function formatEdgeRequestLine(summary: EdgeRequestSummary): string {
  return JSON.stringify({
    level: 'info',
    event: 'edge_request',
    requestId: redactString(String(summary.requestId)),
    route: redactString(String(summary.route)),
    status: Number(summary.status),
    durationMs: Number(summary.durationMs),
    time: new Date().toISOString(),
  })
}

export function logEdgeRequest(
  summary: EdgeRequestSummary,
  sink: LogSink = defaultSink
): void {
  sink.write('info', formatEdgeRequestLine(summary))
}
