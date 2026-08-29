> **EXE-01** · Layer `ui` · Milestone `M1` · Carry-over `rebuild`

**Spec:** `specs/structures/master-structure-clarity.md`

Section-by-section progression, prev/next navigation, progress tracker, global session timer, exit/abandon with confirm.

## Acceptance
- [ ] Global timer is wall-clock based — correct after backgrounding the tab/phone
- [ ] Navigation works across all sections; progress bar reflects section statuses
- [ ] Abandon confirms, persists partial state, and feeds HOME-01 resumption
- [ ] **Workout is a focus mode.** While a session is active there is no in-app navigation out of it except completing or abandoning — no nav to History, Settings, or Home. Browser back triggers the abandon confirm rather than leaving
- [ ] Navigating directly to another route with an active session (deep link, restored tab) prompts to resume or abandon rather than silently stranding the session
- [ ] Leaving the *app* is still allowed — closing the tab or backgrounding the phone persists state and surfaces resumption on Home. The trap is on in-app navigation, not on the user
- [ ] Section header shows structure-type identity per the master clarity spec
- [ ] **The shell owns block completion**, and writes the `block_results` row for every structure type. Perceived effort (1–10) is captured here, once, at block completion — so EMOM, AMRAP, For Time and ladders record it through one path rather than each renderer growing its own. The renderers (EXE-03, EXE-04a…c) supply the structure-specific outcome fields; the shell writes the row. This is what OVR-03 reads, and it is collected from day one

---

**Depends on:** SES-01a, DS-04a, DS-05
**Blocks:** EXE-02, EXE-03, EXE-04a, EXE-04b, EXE-04c, EXE-05, EXE-06

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
