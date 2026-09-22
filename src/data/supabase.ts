/**
 * DATA-03 — the typed Supabase client. Every call `src/` makes to the database
 * goes through this module.
 *
 * It is thin on purpose. PostgREST is an HTTP interface, `fetch` already speaks
 * HTTP, and `supabase-js` would add a dependency whose auth, realtime and
 * storage halves this app does not use. What is *not* thin is the typing: the
 * table name, the columns of a filter, the shape of an insert, the RPC's
 * arguments and its return are all read from `database.types.ts`, which is
 * generated from the migrations. A table that does not exist, a column that was
 * renamed, or an insert missing a NOT NULL column is a compile error and not a
 * 400 at runtime.
 *
 * Three rules this module exists to keep:
 *
 *   1. No `any`, here or in anything that calls it. What arrives over the wire
 *      is `unknown` until something narrows it; the one place that asserts a
 *      row's shape is `asRows`, and it says so.
 *   2. Every failure is an `AppError` from `src/state/errors.ts`. Nothing
 *      throws, and a refusal by row-level security does not read as a network
 *      problem.
 *   3. No caller builds a PostgREST URL. If a query needs something this
 *      surface cannot express, the surface grows — typed — rather than the
 *      caller reaching past it.
 *
 * Not here, deliberately: auth (AUTH-01 owns sessions and supplies the access
 * token), and per-column response validation (CORE-03 adds Zod at the
 * boundary). `asRows` is where that validation will attach.
 */

import {
  ErrorCode,
  createError,
  err,
  ok,
  type AppError,
  type Result,
} from '../state/errors'
import type {
  FunctionArgs,
  FunctionName,
  FunctionReturns,
  TableName,
  Tables,
  TablesInsert,
  TablesUpdate,
} from './database.types'

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface SupabaseConfig {
  /** The project URL — `VITE_SUPABASE_URL`. */
  readonly url: string
  /**
   * The public anon key — `VITE_SUPABASE_ANON_KEY`. Browser-safe by design:
   * row-level security is the boundary, not secrecy. The service-role key never
   * reaches this client.
   */
  readonly anonKey: string
  /**
   * The signed-in user's access token. Absent means anonymous, and every policy
   * in this schema refuses that, so the client says so before making the call.
   */
  readonly accessToken?: string | null
  /** Injected in tests; the global `fetch` otherwise. */
  readonly fetch?: typeof globalThis.fetch
}

/**
 * The two variables `.env.example` documents, read from a Vite-style env.
 *
 * Deliberately not a module-level singleton: a client bound at import time
 * cannot be given the access token that AUTH-01 will obtain later, and it makes
 * every test that imports this file depend on the environment.
 */
export function configFromEnv(env: {
  readonly [key: string]: unknown
}): Result<Omit<SupabaseConfig, 'accessToken' | 'fetch'>> {
  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY

  if (typeof url !== 'string' || url === '' || typeof anonKey !== 'string' || anonKey === '') {
    // `npm run dev` fails before Vite starts for exactly this (ENV-04), so
    // reaching it means a deployed build is missing a variable.
    return err(
      createError(ErrorCode.VALIDATION_REQUIRED_FIELD, {
        details: {
          missing: [
            typeof url === 'string' && url !== '' ? null : 'VITE_SUPABASE_URL',
            typeof anonKey === 'string' && anonKey !== '' ? null : 'VITE_SUPABASE_ANON_KEY',
          ].filter((name) => name !== null),
        },
      }),
    )
  }

  return ok({ url, anonKey })
}

// ─────────────────────────────────────────────────────────────────────────────
// Query surface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Values a filter can compare against: a scalar column, or null. An array or
 * JSON column is not filterable this way, and saying so in the type is cheaper
 * than a runtime error PostgREST would phrase in its own vocabulary.
 */
type Filterable<T extends TableName> = {
  readonly [K in keyof Tables<T>]?: Extract<Tables<T>[K], string | number | boolean | null>
}

export interface OrderBy<T extends TableName> {
  readonly column: keyof Tables<T> & string
  /** Default ascending, matching PostgREST. */
  readonly ascending?: boolean
}

export interface SelectQuery<T extends TableName> {
  /** Omitted means every column. */
  readonly columns?: readonly (keyof Tables<T> & string)[]
  /** Equality only. Anything richer is a named RPC, where SQL can be reviewed. */
  readonly where?: Filterable<T>
  readonly order?: readonly OrderBy<T>[]
  readonly limit?: number
}

export interface TableClient<T extends TableName> {
  select(query?: SelectQuery<T>): Promise<Result<Tables<T>[]>>
  /** Returns the rows as the database stored them, defaults and all. */
  insert(rows: TablesInsert<T> | readonly TablesInsert<T>[]): Promise<Result<Tables<T>[]>>
  update(patch: TablesUpdate<T>, where: Filterable<T>): Promise<Result<Tables<T>[]>>
  /** No representation requested, so a delete of something already gone is not an error. */
  delete(where: Filterable<T>): Promise<Result<void>>
}

export interface SupabaseClient {
  from<T extends TableName>(table: T): TableClient<T>
  /**
   * A database function, by name, with its own arguments and its own return
   * type. `constraints_in_force` answers rows; `usable_equipment` answers
   * `string[]`, and the two are not interchangeable at the call site.
   */
  rpc<F extends FunctionName>(fn: F, args: FunctionArgs<F>): Promise<Result<FunctionReturns<F>>>
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export function createSupabaseClient(config: SupabaseConfig): SupabaseClient {
  const base = `${config.url.replace(/\/+$/, '')}/rest/v1`
  const fetchImpl = config.fetch ?? globalThis.fetch

  const request = async (
    path: string,
    init: RequestInit & { headers?: Record<string, string> },
  ): Promise<Result<unknown>> => {
    if (!config.accessToken) {
      return err(createError(ErrorCode.AUTH_UNAUTHENTICATED))
    }

    let response: Response
    try {
      response = await fetchImpl(`${base}${path}`, {
        ...init,
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      })
    } catch (error) {
      return err(
        createError(ErrorCode.NETWORK_OFFLINE, {
          details: {
            reason: error instanceof Error ? error.message : String(error),
          },
        }),
      )
    }

    if (!response.ok) return err(await transportError(response, init.method))

    // 204 has no body: a delete, or a write that asked for no representation.
    if (response.status === 204) return ok(null)

    try {
      return ok(await response.json())
    } catch {
      return err(malformed({ status: response.status }))
    }
  }

  const table = <T extends TableName>(name: T): TableClient<T> => ({
    async select(query = {}) {
      const params = new URLSearchParams({
        select: query.columns === undefined ? '*' : query.columns.join(','),
      })
      applyFilters(params, query.where)
      if (query.order !== undefined && query.order.length > 0) {
        params.set(
          'order',
          query.order
            .map((by) => `${by.column}.${by.ascending === false ? 'desc' : 'asc'}`)
            .join(','),
        )
      }
      if (query.limit !== undefined) params.set('limit', String(query.limit))

      const result = await request(`/${name}?${params}`, { method: 'GET' })

      return result.ok ? asRows<T>(result.value) : result
    },

    async insert(rows) {
      const result = await request(`/${name}`, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
      })

      return result.ok ? asRows<T>(result.value) : result
    },

    async update(patch, where) {
      const params = new URLSearchParams()
      applyFilters(params, where)

      const result = await request(`/${name}?${params}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      })

      return result.ok ? asRows<T>(result.value) : result
    },

    async delete(where) {
      const params = new URLSearchParams()
      applyFilters(params, where)

      const result = await request(`/${name}?${params}`, { method: 'DELETE' })

      return result.ok ? ok(undefined) : result
    },
  })

  return {
    from: table,

    async rpc(fn, args) {
      const result = await request(`/rpc/${fn}`, {
        method: 'POST',
        body: JSON.stringify(args),
      })

      // The generated Returns is what the function's own SQL declares, so the
      // narrowing that matters happened when the types were generated.
      return result.ok ? ok(result.value as FunctionReturns<typeof fn>) : result
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire → rows
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The single assertion in this module, and the honest account of it: PostgREST
 * answers with the columns the schema declares, so an array of objects from
 * `/table` *is* that table's rows. What is checked is that an array arrived;
 * what is trusted is the schema. CORE-03 replaces the trust with a parse — this
 * is the seam it attaches to, and it is one function rather than one per
 * caller.
 */
function asRows<T extends TableName>(payload: unknown): Result<Tables<T>[]> {
  if (!Array.isArray(payload)) return err(malformed({ payload: typeof payload }))

  return ok(payload as Tables<T>[])
}

function applyFilters(params: URLSearchParams, where: Record<string, unknown> | undefined): void {
  for (const [column, value] of Object.entries(where ?? {})) {
    if (value === undefined) continue
    // `is.null` is not `eq.null`: PostgREST compares with IS for null, and
    // `eq.null` matches nothing at all.
    params.set(column, value === null ? 'is.null' : `eq.${String(value)}`)
  }
}

function malformed(details: Record<string, unknown>): AppError {
  return createError(ErrorCode.PERSISTENCE_READ_FAILED, { details })
}

/**
 * HTTP status → the error taxonomy. A write refused by RLS is not a network
 * problem and must not read as one: 401/403 means the caller is not the owner,
 * which is `AUTH_UNAUTHORIZED` and never retryable.
 */
async function transportError(
  response: Response,
  method: string | undefined,
): Promise<AppError> {
  const writing = method !== undefined && method !== 'GET'
  const details: Record<string, unknown> = { status: response.status }

  // PostgREST states which constraint refused a row. Useful in a log, never in
  // a user-facing message — `createError` supplies that from the code.
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'code' in body) {
      details.pgCode = (body as { code?: unknown }).code
    }
  } catch {
    // A body that is not JSON tells us nothing the status has not already.
  }

  if (response.status === 401 || response.status === 403) {
    return createError(ErrorCode.AUTH_UNAUTHORIZED, { details })
  }
  if (response.status === 409) {
    return createError(ErrorCode.PERSISTENCE_CONFLICT, { details })
  }
  if (response.status === 429) {
    return createError(ErrorCode.NETWORK_RATE_LIMITED, { details })
  }
  // 400 from this schema is a CHECK constraint refusing the row.
  if (response.status === 400 || response.status === 422) {
    return createError(ErrorCode.VALIDATION_CONSTRAINT, { details })
  }
  if (response.status >= 500) {
    return createError(ErrorCode.NETWORK_SERVER_ERROR, { details })
  }

  return createError(
    writing ? ErrorCode.PERSISTENCE_WRITE_FAILED : ErrorCode.PERSISTENCE_READ_FAILED,
    { details },
  )
}
