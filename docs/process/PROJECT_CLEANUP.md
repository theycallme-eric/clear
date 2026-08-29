# Project Knowledge Cleanup

Two jobs: remove the last Antigravity references, and purge duplicate docs.
They overlap — the dirty Antigravity copies *are* duplicates.

**The rule for everything below: keep the newest, delete the rest.**
Nothing is lost. The newest copy at each path is the one already in use.

---

## 1. Antigravity — delete these first

A prior cleanup created corrected copies (they say "the build agent") but left the
originals in place. The originals still get retrieved by search, which is why
Antigravity keeps resurfacing.

| Document | Keep | Delete |
|---|---|---|
| `CLAUDE_AI_PLANNING_GUIDE.md` | Jun 22, 16:35 | Jun 22 16:30 · Feb 11 · Feb 4 |
| `clear-project-instructions-v2.md` | Jun 22, 16:30 | Feb 2 |
| `index-refactor-plan.md` | Jun 22, 16:30 | Feb 2 |
| `Clear_-_Workout_Generation_Prompt_v3.md` | Jun 22, 16:30 | Feb 27 21:10 · Feb 27 20:56 |

Verified: reading `clear-project-instructions-v2.md` returns the clean June copy.
The June 22 batch is the corrected re-upload. Everything older at these paths is dirty.

---

## 2. Project instructions — your edit

Roughly twelve mentions. They appear in these sections:

- Opening line — *"Google Antigravity executes the plans you create."*
- **Who I Am** — "then Antigravity to build"
- **Your Role** — "generate plans for Antigravity to follow"
- **Your Role** — the proactive-handoff example line
- **Document System** — PROJECT_MAP, SESSION_LOG, SESSION_PLAN, feature roadmaps
- **Design System Sources** — "Antigravity references Figma directly"
- **How We Work Together** — Planning mode, Review mode

Two other things in there are stale while you're in it: the stack line says
**Tailwind** (not installed — it's raw CSS custom properties), and the design
source of truth is listed as **Figma** (it's Claude Design / Pencil now).

---

## 3. Duplicate purge — everything else

26 paths have duplicates. 60 docs where 26 would do. Keep newest, delete the rest.

| Document | Copies | Delete (older) |
|---|---|---|
| `Clear_-_Exercise_Swap_Spec.md` | 3 | Mar 4 22:13 · Mar 4 21:41 |
| `Clear_-_Data_Model.md` | 3 | Jan 20 17:42 · Jan 20 17:05 |
| `Clear_-_User_Journey_Maps.md` | 3 | Dec 22 19:31 · Dec 22 18:23 |
| `Clear_-_Workout_Anatomy_Spec.md` | 2 | May 21 20:17 |
| `Clear_-_Favorites_Spec_v2.md` | 2 | Mar 5 20:31 |
| `token-audit-skill.md` | 2 | Feb 10 18:09 |
| `Clear_-_Implementation_Plan_v2.md` | 2 | Feb 4 06:26 |
| `Clear_-_Intensity_Model_Spec.md` | 2 | Feb 4 03:19 |
| `Clear_-_Workout_Generation_Prompt_v2.md` | 2 | Feb 4 04:28 |
| `Clear_-_Structure_Types_Spec.md` | 2 | Feb 3 21:32 |
| `RETRO_HANDOFF_TO_OPUS.md` | 2 | Jan 27 14:55 |
| `Clear_-_Claude_Code_Prompt__Developer_Options.md` | 2 | Jan 22 |
| `Clear_-_Implementation_Action_Plan__Jan_22_2026_.md` | 2 | Jan 22 17:00 |
| `Clear_-_Auth_Screen_Wireframe.md` | 2 | Jan 21 22:46 |
| `Clear_-_Workout_Generation_Prompt.md` | 2 | Jan 21 20:33 |
| `Clear_-_Backend_Planning_Session__Jan_20_2026_.md` | 2 | Jan 20 17:41 |
| `Clear_-_Workout_History__Wireframe_.md` | 2 | Jan 9 16:30 |
| `Clear_-_Content_Definitions.md` | 2 | Dec 22 19:25 |
| `clear-sitemap.mermaid` | 2 | Dec 22 18:31 |
| `Clear_-_User_Personas.md` | 2 | Dec 20 06:28 |
| `Clear - Screen 3: Workout Mode (Wireframe).md` | 2 | Dec 18 16:15 |
| `Clear - Future Work & Known Issues.md` | 2 | Dec 17 23:20 |

---

## 4. Outside the project

- Historical cleanup bundles are preserved under `docs/_archive/`; they are not build inputs.
- `~/.antigravity` in your home directory — the app's own config folder
- Old repo git history — 2 commit messages, 7 commits, and a deleted
  `docs/antigravity-handoff.md`. Not worth rewriting. Archive `clear-app` instead.
- GitHub issues and PRs on the remote may reference it in titles or bodies

---

## Worth considering before requirements get written

102 docs, and most describe the app being replaced. Anything searching project
knowledge while writing the rebuild spec will pull architecture details from the
old build. The duplicate purge above is step one; a wider archive pass on
old-app specs is worth doing before the requirements work starts.
