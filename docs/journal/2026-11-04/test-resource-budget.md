# Product test resource budget

The supervised CLEAR launch preserved TASK-039 after its full project suite failed with
five-second timeouts. Its two consistently implicated existing suites passed all 115 tests
in isolation. One controlled full-suite run on the retained candidate with four workers
passed all 6,067 tests in 250 files in 83.4 seconds; timeouts and assertions were unchanged.

Cap simultaneous Vitest workers at the lesser of four and the runtime's available CPU
parallelism. This bounds concurrent JSDOM/Git fixture load on the local host and retains
lower concurrency on smaller CI runners. It changes no test selection, assertion, timeout,
retry, production behavior, Runner, approved graph, or frozen execution configuration.

This is a launch-readiness correction, not completion of TASK-039 or another DAG task.
Keep native failure history and existing limits. Delivery targets the protected integration
branch. Actual required verification and hosted CI results are recorded with the PR.
