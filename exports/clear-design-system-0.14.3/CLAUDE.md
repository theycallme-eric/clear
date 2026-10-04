# Working preferences

- **Show, don't describe.** When a decision depends on how something looks or moves (motion, interaction states, layout or edge treatments), build a live, clickable comparison in `explorations/` (temporary) and open it for the user. Don't ask them to choose from text. Open the file in their preview and say where it is.
- Put each option's letter on it as a badge, and state the recommendation.
- **Show states that can really occur together.** Only one control is focused at a time, so a comparison that shows several focused at once misleads. Show one realistic screen state per option.
- **One difference per comparison**, everything else identical, built on real product screens (`ui_kits/app/`), or say plainly that a screen is illustrative. Don't invent product screens.
- **When a comparison is settled:** record the decision and the user's reason in `docs/decisions.md`, apply it, then **delete the comparison page**. Rejected options left in the project get mistaken for guidance.

# Platforms

Phone screens are tuned tightly. Desktop applications will use the system too, but desktop layouts aren't being fine-tuned yet. Don't treat the system as mobile-only.

# Confirmed visual preferences

**The overall aim is a tube monitor / CRT feel, across everything.** Emissive phosphor light on dark glass, scanlines, mechanical stepping. When two options are otherwise equal, pick the one that reads more like a display.

**Every decision, with the user's reasons and what it was picked over, is in `docs/decisions.md`. Read it before any visual work.** Apply it without asking when a choice follows clearly from it. Build a comparison when two entries conflict or the choice is new territory. Never record a reason the user didn't give.

**Working order: foundations first, then single controls, then combinations, then layouts.** Settle the more atomic level before calibrating anything built from it.

**Alignment is pixel-exact.** The user notices 1px gaps.
