#!/usr/bin/env bash
# 01 — labels and milestones. Safe to re-run.
set -euo pipefail
REPO="${1:-}"
[ -z "$REPO" ] && { echo "usage: ./01-setup-repo.sh owner/repo" >&2; exit 1; }

command -v gh >/dev/null || { echo "gh not installed — brew install gh" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "not authenticated — run: gh auth login" >&2; exit 1; }

V=$(gh --version | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
echo "gh $V — dependency flags need 2.94.0+"

gh repo view "$REPO" >/dev/null 2>&1 || {
  echo "Repo $REPO not found. Create it first:" >&2
  echo "  gh repo create $REPO --private --description 'CLEAR — AI workout generator'" >&2
  exit 1
}
export GH_REPO="$REPO"

echo "Labels…"
gh label create "layer:api" --color 8250DF --description "Layer: api" --force
gh label create "layer:data" --color 1F6FEB --description "Layer: data" --force
gh label create "layer:design" --color DB61A2 --description "Layer: design" --force
gh label create "layer:infra" --color 0E4429 --description "Layer: infra" --force
gh label create "layer:state" --color BF8700 --description "Layer: state" --force
gh label create "layer:ui" --color F87823 --description "Layer: ui" --force
gh label create "carry:keep" --color 99DD39 --description "Prior art: keep" --force
gh label create "carry:new" --color A368FF --description "Prior art: new" --force
gh label create "carry:port" --color 00A9F4 --description "Prior art: port" --force
gh label create "carry:rebuild" --color F87823 --description "Prior art: rebuild" --force
gh label create "needs-spec" --color 6E7681 --description "Backlog — write a spec before building" --force
gh label create "blocked:design-export" --color CD1958 --description "Waiting on the Claude Design export" --force

echo "Milestones…"
gh api "repos/$REPO/milestones" -f title="M0" -f description="Foundation — CI, deploy, schema, auth, dev environment, design tokens" >/dev/null 2>&1 || echo "  M0 already exists"
gh api "repos/$REPO/milestones" -f title="M1" -f description="Core loop — generate, review, execute, log, history" >/dev/null 2>&1 || echo "  M1 already exists"
gh api "repos/$REPO/milestones" -f title="M2" -f description="Parity — favorites, streaks, settings, onboarding, PWA" >/dev/null 2>&1 || echo "  M2 already exists"
gh api "repos/$REPO/milestones" -f title="M3" -f description="Progressive overload" >/dev/null 2>&1 || echo "  M3 already exists"

echo "Done. Next: ./02-create-issues.sh $REPO"
