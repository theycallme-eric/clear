#!/usr/bin/env python3
"""
Generate the GitHub issue scripts and bodies from requirements/REQUIREMENTS.md.

The requirements file is the source of truth. Nothing here is hand-maintained:
  github/02-create-issues.sh      one create_issue per requirement
  github/03-wire-dependencies.sh  one wire per Depends-on entry
  github/bodies/<ID>.md           one body per requirement

Also validates the graph: unknown dependencies, cycles, and the ready queue.

  python3 scripts/gen-issues.py            # generate + validate
  python3 scripts/gen-issues.py --check    # validate only, non-zero exit on failure
"""
import re, sys, os, pathlib, shlex

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
REQ  = DOCS / "requirements" / "REQUIREMENTS.md"
GH   = DOCS / "github"
BOD  = GH / "bodies"

VERSION = "v0.7"
FOOTER  = (f"<sub>Generated from `docs/requirements/REQUIREMENTS.md` {VERSION} by "
           f"`scripts/gen-issues.py` — edit the requirement, not the issue.</sub>")

HEAD = re.compile(r'^### ([A-Z][A-Z0-9]*-\d+[a-z]?) — (.+?)\s*$')
META = re.compile(r'^\*\*Layer:\*\*\s*(\S+)\s*·\s*\*\*Milestone:\*\*\s*(\S+)\s*·\s*\*\*Carry-over:\*\*\s*(\S+)')
DEPS = re.compile(r'^\*\*Depends on:\*\*\s*(.*)$')


def parse():
    text = REQ.read_text(encoding="utf-8")
    lines = text.split("\n")
    # locate every heading
    heads = [(i, m.group(1), m.group(2)) for i, l in enumerate(lines) for m in [HEAD.match(l)] if m]
    reqs, preambles, order = {}, {}, []

    for k, (i, rid, title) in enumerate(heads):
        end = heads[k + 1][0] if k + 1 < len(heads) else len(lines)
        block = lines[i + 1:end]

        # A requirement can be the final ### heading in the document. In that case,
        # stop at the next top-level section instead of absorbing the appendices into
        # its issue body (EXE-06 exposed this when it was the last live requirement).
        for j, line in enumerate(block):
            if line.startswith("## ") or (line.startswith("### ") and not HEAD.match(line)):
                block = block[:j]
                break
        while block and (not block[-1].strip() or block[-1].strip() == "---"):
            block.pop()

        if "(deleted" in title:
            continue
        if "(split:" in title:                       # a parent stub: shared context for its children
            preambles[rid] = "\n".join(block).strip()
            continue

        layer = ms = carry = None
        deps, body = [], []
        for l in block:
            if (m := META.match(l)):
                layer, ms, carry = m.groups(); continue
            if (m := DEPS.match(l)):
                raw = m.group(1).strip()
                deps = [] if raw in ("—", "-", "") else [d.strip() for d in raw.split(",") if d.strip()]
                continue
            body.append(l)
        if not ms:
            continue                                  # not a requirement (a sub-heading in prose)

        reqs[rid] = dict(id=rid, title=title.replace("*", "").strip(), layer=layer,
                         milestone=ms, carry=carry, deps=deps,
                         body="\n".join(body).strip())
        order.append(rid)
    return reqs, preambles, order


def validate(reqs):
    errs = []
    for r in reqs.values():
        for d in r["deps"]:
            if d not in reqs:
                errs.append(f"{r['id']} depends on {d}, which is not a requirement")
    # cycles
    state = {}
    def dfs(n, path):
        if state.get(n) == 1:
            return path[path.index(n):] + [n]
        if state.get(n) == 2:
            return None
        state[n] = 1
        for m in reqs[n]["deps"]:
            if m in reqs and (c := dfs(m, path + [n])):
                return c
        state[n] = 2
        return None
    for n in reqs:
        if (c := dfs(n, [])):
            errs.append("cycle: " + " → ".join(c)); break
    return errs


def blocks_map(reqs):
    b = {r: [] for r in reqs}
    for r in reqs.values():
        for d in r["deps"]:
            if d in b:
                b[d].append(r["id"])
    return b


def write(reqs, preambles, order):
    BOD.mkdir(parents=True, exist_ok=True)
    blocks = blocks_map(reqs)

    for rid in order:
        r = reqs[rid]
        parent = re.match(r'^([A-Z][A-Z0-9]*-\d+)[a-z]$', rid)
        pre = ""
        if parent and parent.group(1) in preambles:
            paras = [q.strip() for q in preambles[parent.group(1)].split("\n\n") if q.strip()]
            why = next((q for q in paras if q.startswith("**Why it splits.")), None)
            lead = why or next((q for q in paras if not q.startswith("**")), paras[0])
            pre = ("> **Part of " + parent.group(1) + ".** "
                   + lead.replace("**Why it splits.** ", "").replace("\n", " ") + "\n\n")
            for q in paras:
                if q.startswith("**Applies to all") or q.startswith("**Shared,"):
                    pre += q + "\n\n"
        out = (f"> **{rid}** · Layer `{r['layer']}` · Milestone `{r['milestone']}` · "
               f"Carry-over `{r['carry']}`\n\n{pre}{r['body'].replace(chr(42)*2+chr(65)+'cceptance:'+chr(42)*2, '## Acceptance')}\n\n---\n\n"
               f"**Depends on:** {', '.join(r['deps']) or '—'}\n"
               f"**Blocks:** {', '.join(blocks[rid]) or '—'}\n\n{FOOTER}\n")
        (BOD / f"{rid}.md").write_text(out, encoding="utf-8")

    # prune bodies for requirements that no longer exist
    stale = [p for p in BOD.glob("*.md") if p.stem not in reqs]

    with open(GH / "02-create-issues.sh", "w", encoding="utf-8") as f:
        f.write(f"""#!/usr/bin/env bash
# 02 — create all {len(order)} issues. Re-runnable: skips anything already in issue-map.txt.
# GENERATED by scripts/gen-issues.py — do not hand-edit.
set -euo pipefail
REPO="${{1:-}}"
[ -z "$REPO" ] && {{ echo "usage: ./02-create-issues.sh owner/repo" >&2; exit 1; }}
export GH_REPO="$REPO"
cd "$(dirname "${{BASH_SOURCE[0]}}")"
MAP="issue-map.txt"; touch "$MAP"

create_issue() {{
  local rid="$1" title="$2" milestone="$3"; shift 3
  if grep -q "^$rid " "$MAP" 2>/dev/null; then
    echo "  skip $rid (already created)"; return 0
  fi
  local url
  url=$(gh issue create --title "$title" --body-file "bodies/$rid.md" --milestone "$milestone" "$@")
  local num="${{url##*/}}"
  echo "$rid $num" >> "$MAP"
  echo "  $rid → #$num"
}}

echo "Creating issues in ${{REPO}}…"
""")
        for rid in order:
            r = reqs[rid]
            args = [
                rid,
                f'[{rid}] {r["title"]}',
                r["milestone"],
                "--label",
                f'layer:{r["layer"]}',
                "--label",
                f'carry:{r["carry"]}',
            ]
            f.write("create_issue " + " ".join(shlex.quote(arg) for arg in args) + "\n")
        f.write(f'\necho "Done. {len(order)} issues. Map in $MAP."\n')
    os.chmod(GH / "02-create-issues.sh", 0o755)

    edges = [(r["id"], d) for rid in order for r in [reqs[rid]] for d in r["deps"]]
    with open(GH / "03-wire-dependencies.sh", "w", encoding="utf-8") as f:
        f.write(f"""#!/usr/bin/env bash
# 03 — wire {len(edges)} native blocked-by relationships. Re-runnable.
# GENERATED by scripts/gen-issues.py — do not hand-edit.
# Needs gh 2.94.0+ for --add-blocked-by.
set -euo pipefail
REPO="${{1:-}}"
[ -z "$REPO" ] && {{ echo "usage: ./03-wire-dependencies.sh owner/repo" >&2; exit 1; }}
export GH_REPO="$REPO"
cd "$(dirname "${{BASH_SOURCE[0]}}")"
[ -f issue-map.txt ] || {{ echo "run ./02-create-issues.sh first" >&2; exit 1; }}

num() {{ awk -v r="$1" '$1==r {{print $2}}' issue-map.txt; }}

wire() {{
  local child parent
  child=$(num "$1"); parent=$(num "$2")
  if [ -z "$child" ] || [ -z "$parent" ]; then
    echo "  !! missing issue for $1 or $2 — skipping" >&2; return 0
  fi
  if gh issue edit "$child" --add-blocked-by "$parent" >/dev/null 2>&1; then
    echo "  $1 blocked by $2"
  else
    echo "  !! could not wire $1 ← $2 (gh 2.94.0+ required?)" >&2
  fi
}}

echo "Wiring dependencies in ${{REPO}}…"
""")
        for child, parent in edges:
            f.write(f'wire "{child}" "{parent}"\n')
        f.write(f'\necho "Done. {len(edges)} relationships."\n')
    os.chmod(GH / "03-wire-dependencies.sh", 0o755)
    return stale, edges


def main():
    reqs, preambles, order = parse()
    errs = validate(reqs)
    blocks = blocks_map(reqs)
    ready = [r for r in order if not reqs[r]["deps"]]

    if errs:
        print("GRAPH ERRORS:"); [print("  ✗", e) for e in errs]
    if "--check" in sys.argv:
        print(f"{len(order)} requirements, {sum(len(r['deps']) for r in reqs.values())} edges")
        sys.exit(1 if errs else 0)
    if errs:
        sys.exit(1)

    stale, edges = write(reqs, preambles, order)
    ms = {}
    for r in reqs.values():
        ms[r["milestone"]] = ms.get(r["milestone"], 0) + 1

    print(f"{len(order)} requirements → {len(edges)} edges, no cycles")
    print("  milestones: " + " · ".join(f"{k} {ms[k]}" for k in sorted(ms)))
    print(f"  ready queue: {', '.join(ready)}")
    print(f"  widest fan-in: " + max(((len(r['deps']), r['id']) for r in reqs.values()))[1] +
          f" ({max(len(r['deps']) for r in reqs.values())} deps)")
    print(f"  widest fan-out: " + max(((len(v), k) for k, v in blocks.items()))[1] +
          f" ({max(len(v) for v in blocks.values())} dependents)")
    if stale:
        print("  stale bodies (delete these): " + ", ".join(p.name for p in stale))


if __name__ == "__main__":
    main()
