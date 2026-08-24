# Quick Fix: AMRAP "Each Round" Label

## What
Add a label `EACH ROUND:` between the AMRAP timer/buttons and the exercise list to clarify that all listed exercises compose one round.

## Where
The AMRAP section card in Workout Mode (Screen 3). Find the component that renders the AMRAP structure — it contains the timer, Pause/Resume/Finish buttons, and the exercise list below.

## Do
Insert a text label `EACH ROUND:` between the button row and the first exercise.

**Style:**
- Text: `EACH ROUND:`
- Font: Rajdhani, uppercase, `text-xs`
- Color: `--text-color-header` (blue-300)
- Spacing: `mt-3 mb-1` (or match existing spacing between the button row and exercise list)

**Only show this label when:**
- Structure type is `amrap`
- There are 2+ exercises in the section

Single-exercise AMRAPs don't need it — the round concept is obvious.

## Don't
- Don't change any other part of the AMRAP card
- Don't add interactivity — this is a static label
- No hardcoded colors — use the CSS custom property
