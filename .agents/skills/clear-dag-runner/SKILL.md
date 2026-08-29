---
name: clear-dag-runner
description: Runs CLEAR build work from the live GitHub dependency graph. Use when Eric asks Codex to run the DAG, automate the build, take ready issues, work unattended, or continue the CLEAR rebuild.
---

# CLEAR DAG runner

Read `docs/process/DAG_RUNNER.md` and `docs/process/HUMAN_GATES.md` completely, then follow them.

Run `python3 scripts/dag-ready.py` before choosing work. Read the selected issue and its comments.
Use single-issue mode unless Eric explicitly asks to run for a while, run unattended, or use runway
mode. In runway mode, continue across unclaimed ready issues one at a time without waiting between
them, but never work a blocked issue, merge without the approved policy, or route around a human gate.
