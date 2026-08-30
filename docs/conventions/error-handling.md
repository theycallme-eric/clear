# Error handling conventions

This document defines CLEAR's error handling patterns. These conventions are enforced through
code review and the typed error system in `src/state/errors.ts`.

## The rule

**Never throw string errors. Never catch and read `.message` directly.**

```typescript
// BAD: stringly-typed errors
throw "User not found"
throw new Error("Something went wrong")
catch (e) { alert(e.message) }

// GOOD: typed errors
import { createError, ErrorCode, Result, err } from '@/state/errors'

// Option 1: Return a Result
function findUser(id: string): Result<User> {
  if (!user) {
    return err(createError(ErrorCode.PERSISTENCE_NOT_FOUND))
  }
  return ok(user)
}

// Option 2: Create and throw AppError (for unexpected cases)
throw createError(ErrorCode.PERSISTENCE_NOT_FOUND, { requestId })
```

## Why

1. **User-safe messages**: String errors leak implementation details. `AppError` messages are
   written for users.
2. **Correlation**: `requestId` connects client errors to edge function logs.
3. **Type safety**: The compiler catches missing error handling.
4. **Consistency**: Every error has a known structure for display.

## Request ID format

```
req_<timestamp-base36>_<random-base36>
```

Example: `req_lxyz123_a1b2c3`

- `req_` — visual prefix for logs
- timestamp — milliseconds since epoch, base36 encoded
- random — 6 random alphanumeric characters

### Usage in edge functions

```typescript
// Client
const requestId = generateRequestId()
const response = await fetch('/api/generate', {
  headers: { 'X-Request-ID': requestId }
})
if (!response.ok) {
  return err(toAppError(await response.json(), ErrorCode.GENERATION_FAILED, requestId))
}

// Edge function
const requestId = req.headers.get('X-Request-ID') || generateRequestId()
// Use requestId in all logs
// Return requestId in error responses
```

## Error categories

| Prefix | When to use |
|---|---|
| `AUTH_*` | Authentication/authorization failures |
| `NETWORK_*` | Connectivity and transport failures |
| `VALIDATION_*` | Input validation failures |
| `GENERATION_*` | Workout generation failures |
| `PERSISTENCE_*` | Data storage failures |

## Result vs throw

Use `Result<T>` for **expected** failures:
- User input validation
- Not-found conditions
- Business logic violations

Use `throw createError()` for **unexpected** failures:
- Programming errors
- Invariant violations
- Unrecoverable states

## Review checklist

When reviewing code that handles errors, check:

- [ ] No `throw "string"` or `throw new Error("string")`
- [ ] No `catch (e) { e.message }` without `toAppError()` wrapper
- [ ] Edge function calls include `requestId`
- [ ] Error boundaries use `toAppError()` to normalize
- [ ] User-facing messages come from `getErrorMessage()`, not raw details
- [ ] `Result<T>` used for expected failure modes
