#!/usr/bin/env bash
# 02 — create all 55 issues. Re-runnable: skips anything already in issue-map.txt.
set -euo pipefail
REPO="${1:-}"
[ -z "$REPO" ] && { echo "usage: ./02-create-issues.sh owner/repo" >&2; exit 1; }
export GH_REPO="$REPO"
cd "$(dirname "${BASH_SOURCE[0]}")"
MAP="issue-map.txt"; touch "$MAP"

create_issue() {
  local rid="$1" title="$2" milestone="$3"; shift 3
  if grep -q "^$rid " "$MAP" 2>/dev/null; then
    echo "  skip $rid (already created)"; return 0
  fi
  local url
  url=$(gh issue create --title "$title" --body-file "bodies/$rid.md" --milestone "$milestone" "$@")
  local num="${url##*/}"
  echo "$rid $num" >> "$MAP"
  echo "  $rid → #$num"
}

echo "Creating issues in $REPO…"
create_issue "ENV-01" "[ENV-01] Repository scaffold" "M0" --label "layer:infra" --label "carry:new"
create_issue "ENV-02" "[ENV-02] CI pipeline" "M0" --label "layer:infra" --label "carry:new"
create_issue "ENV-03" "[ENV-03] Deploy pipeline" "M0" --label "layer:infra" --label "carry:port"
create_issue "ENV-04" "[ENV-04] Dev environment: one command, legible failures" "M0" --label "layer:infra" --label "carry:new"
create_issue "ENV-05" "[ENV-05] Supabase keep-alive" "M0" --label "layer:infra" --label "carry:new"
create_issue "DATA-01" "[DATA-01] Baseline schema" "M0" --label "layer:data" --label "carry:rebuild"
create_issue "DATA-02" "[DATA-02] Exercise library seed + taxonomy verification" "M0" --label "layer:data" --label "carry:keep"
create_issue "DATA-03" "[DATA-03] Generated types + typed client" "M0" --label "layer:data" --label "carry:rebuild"
create_issue "DATA-05" "[DATA-05] User-authored constraints" "M0" --label "layer:data" --label "carry:new"
create_issue "CORE-01" "[CORE-01] Error taxonomy + request IDs" "M0" --label "layer:state" --label "carry:new"
create_issue "CORE-02" "[CORE-02] Structured logger with redaction" "M0" --label "layer:state" --label "carry:rebuild"
create_issue "CORE-03" "[CORE-03] Boundary schemas (zod)" "M0" --label "layer:state" --label "carry:new"
create_issue "CORE-04" "[CORE-04] App-wide state contract" "M0" --label "layer:state" --label "carry:new"
create_issue "AUTH-01" "[AUTH-01] Session context" "M0" --label "layer:state" --label "carry:rebuild"
create_issue "AUTH-02" "[AUTH-02] Welcome + OTP login screens" "M0" --label "layer:ui" --label "carry:rebuild"
create_issue "AUTH-03" "[AUTH-03] Route guards + profile/locations queries" "M0" --label "layer:state" --label "carry:rebuild"
create_issue "DS-01" "[DS-01] Vendor and mount the design system" "M0" --label "layer:design" --label "carry:new"
create_issue "DS-02" "[DS-02] Self-host the three font families" "M0" --label "layer:design" --label "carry:port" --label "needs:decision"
create_issue "DS-04" "[DS-04] App-composed controls" "M0" --label "layer:design" --label "carry:new" --label "needs:split"
create_issue "DS-05" "[DS-05] Toast host and error surfaces" "M1" --label "layer:design" --label "carry:new"
create_issue "DS-06" "[DS-06] Atmosphere assignment" "M1" --label "layer:design" --label "carry:port"
create_issue "DS-07" "[DS-07] Gallery" "M1" --label "layer:design" --label "carry:rebuild"
create_issue "DS-08" "[DS-08] Adherence gate in CI" "M0" --label "layer:design" --label "carry:new"
create_issue "GEN-01" "[GEN-01] Edge function envelope" "M1" --label "layer:api" --label "carry:rebuild"
create_issue "GEN-02" "[GEN-02] Workout generation: contract v4.1" "M1" --label "layer:api" --label "carry:rebuild"
create_issue "GEN-03" "[GEN-03] Generation client state" "M1" --label "layer:state" --label "carry:rebuild"
create_issue "GEN-04" "[GEN-04] Generation screen" "M1" --label "layer:ui" --label "carry:rebuild"
create_issue "GEN-05" "[GEN-05] Loading screen" "M1" --label "layer:ui" --label "carry:port" --label "blocked:design-export"
create_issue "GEN-06" "[GEN-06] Duration plausibility check" "M1" --label "layer:api" --label "carry:new"
create_issue "SES-01" "[SES-01] Session lifecycle + three-state persistence" "M1" --label "layer:state" --label "carry:rebuild"
create_issue "REV-01" "[REV-01] Review screen" "M1" --label "layer:ui" --label "carry:rebuild"
create_issue "REV-02" "[REV-02] Section/exercise swap function" "M1" --label "layer:api" --label "carry:rebuild"
create_issue "REV-03" "[REV-03] Swap UI: history, undo, nudge" "M1" --label "layer:ui" --label "carry:rebuild"
create_issue "EXE-01" "[EXE-01] Workout shell" "M1" --label "layer:ui" --label "carry:rebuild"
create_issue "EXE-02" "[EXE-02] Standard + superset renderers, set logging" "M1" --label "layer:ui" --label "carry:rebuild"
create_issue "EXE-03" "[EXE-03] Circuit + EMOM renderers" "M1" --label "layer:ui" --label "carry:rebuild"
create_issue "EXE-04" "[EXE-04] AMRAP + For Time + ladder renderers" "M1" --label "layer:ui" --label "carry:rebuild"
create_issue "EXE-05" "[EXE-05] Rest timer + coaching panel" "M1" --label "layer:ui" --label "carry:rebuild"
create_issue "EXE-07" "[EXE-07] Durable set logging" "M1" --label "layer:state" --label "carry:new" --label "closes:D7"
create_issue "SUM-01" "[SUM-01] Post-workout summary" "M1" --label "layer:ui" --label "carry:rebuild"
create_issue "HIST-01" "[HIST-01] History list + detail" "M1" --label "layer:ui" --label "carry:rebuild"
create_issue "HOME-01" "[HOME-01] Home screen v1" "M1" --label "layer:ui" --label "carry:rebuild"
create_issue "ONB-01" "[ONB-01] Onboarding flow" "M2" --label "layer:ui" --label "carry:rebuild"
create_issue "FAV-01" "[FAV-01] Favorites core" "M2" --label "layer:ui" --label "carry:rebuild"
create_issue "FAV-02" "[FAV-02] Favorites v2: progression + personal bests" "M2" --label "layer:ui" --label "carry:new"
create_issue "HOME-02" "[HOME-02] Streak engine + rest days" "M2" --label "layer:state" --label "carry:rebuild"
create_issue "HOME-03" "[HOME-03] Suggested anchor + intensity" "M2" --label "layer:state" --label "carry:port"
create_issue "SET-01" "[SET-01] Settings hub + preferences" "M2" --label "layer:ui" --label "carry:rebuild"
create_issue "SET-02" "[SET-02] Locations + equipment management" "M2" --label "layer:ui" --label "carry:rebuild"
create_issue "PWA-01" "[PWA-01] Installable PWA" "M2" --label "layer:infra" --label "carry:new"
create_issue "OVR-01" "[OVR-01] Load anchors + progression rules (standard sets)" "M3" --label "layer:state" --label "carry:new"
create_issue "OVR-02" "[OVR-02] Generation integration (prompt bump)" "M3" --label "layer:api" --label "carry:new"
create_issue "OVR-03" "[OVR-03] Timed-format progression" "M3" --label "layer:ui" --label "carry:new"
create_issue "OVR-04" "[OVR-04] Deload detection + override" "M3" --label "layer:state" --label "carry:new"
create_issue "EXE-06" "[EXE-06] Mid-workout exercise swap" "M3" --label "layer:ui" --label "carry:new"


echo
echo "$(wc -l < "$MAP") issues mapped in $MAP"
echo "Next: ./03-wire-dependencies.sh $REPO"
