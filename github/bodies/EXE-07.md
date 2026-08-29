> **EXE-07** · Layer `state` · Milestone `M1` · Carry-over `new`

**Spec:** `specs/DATA_MODEL.md` §5 set logs

Closes D7. A set the user physically performed must never be lost to a dead signal, and the
UI must never claim a set is logged when it is not. **This is not offline support** — the
app does not need to work offline. It needs one write path that does not lie.

## Acceptance
- [ ] Set writes go through a durable local queue first; the row is written locally, then flushed
- [ ] The queue survives a reload, a backgrounded tab, and a killed app — a set logged at 6:02 is still there at 6:40
- [ ] The UI distinguishes **logged** from **syncing** from **failed to sync**; a pending set is never drawn as confirmed
- [ ] Flush is idempotent — a retried write does not create a duplicate set (client-generated id, not a server sequence)
- [ ] On resuming a session, unflushed sets reconcile against the server without the user being asked to re-enter anything
- [ ] Sustained failure surfaces once, factually, with the count of unsynced sets — not a toast per set

---

**Depends on:** EXE-02, SES-01a
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
