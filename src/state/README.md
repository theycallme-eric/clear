# State boundary

Client state machines, query hooks, and cross-screen state coordination belong here.

`schemas.ts` (CORE-03) is the exception that proves the boundary: it is not client state but the
contract client state is parsed from. Every payload crossing a process boundary — the generation
envelopes, contract 4.1.0's output, and the row shapes `src/data/` reads — is validated there and
nowhere else, and an edge function imports that same file rather than restating it in Deno.
