> **EXE-01** · Layer `ui` · Milestone `M1` · Carry-over `rebuild`

Section-by-section progression, prev/next navigation, progress tracker, global session timer, exit/abandon with confirm.

**Spec:** `specs/structures/master-structure-clarity.md`

## Acceptance

- [ ] Global timer is wall-clock based — correct after backgrounding the tab/phone
- [ ] Navigation works across all sections; progress bar reflects section statuses
- [ ] Abandon confirms, persists partial state, and feeds HOME-01 resumption
- [ ] **Workout is a focus mode.** While a session is active there is no in-app navigation out of it except completing or abandoning — no nav to History, Settings, or Home. Browser back triggers the abandon confirm rather than leaving
- [ ] Navigating directly to another route with an active session (deep link, restored tab) prompts to resume or abandon rather than silently stranding the session
- [ ] Leaving the *app* is still allowed — closing the tab or backgrounding the phone persists state and surfaces resumption on Home. The trap is on in-app navigation, not on the user
- [ ] Section header shows structure-type identity per the master clarity spec

---

**Depends on:** SES-01, DS-03, DS-05
**Blocks:** EXE-02, EXE-03, EXE-04, EXE-05

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
