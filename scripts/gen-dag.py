#!/usr/bin/env python3
"""
Generate DAG.md — the dependency graph the build works from.

Two modes:
  python3 scripts/gen-dag.py          from requirements/REQUIREMENTS.md (works before GitHub exists)
  python3 scripts/gen-dag.py --live   from `gh issue list --json`, adding open/closed state

The live mode needs github/issue-map.txt and gh auth. Everything else is offline.
"""
import re, sys, json, subprocess, pathlib, collections

ROOT = pathlib.Path(__file__).resolve().parent.parent
REQ  = ROOT / "requirements" / "REQUIREMENTS.md"
OUT  = ROOT / "DAG.md"
MAP  = ROOT / "github" / "issue-map.txt"

HEAD = re.compile(r'^### ([A-Z][A-Z0-9]*-\d+[a-z]?) — (.+?)\s*$')
META = re.compile(r'^\*\*Layer:\*\*\s*(\S+)\s*·\s*\*\*Milestone:\*\*\s*(\S+)')
DEPS = re.compile(r'^\*\*Depends on:\*\*\s*(.*)$')
MS_ORDER = ["M0", "M1", "M2", "M3"]


def parse():
    lines = REQ.read_text(encoding="utf-8").split("\n")
    heads = [(i, m.group(1), m.group(2)) for i, l in enumerate(lines) for m in [HEAD.match(l)] if m]
    reqs, order = {}, []
    for k, (i, rid, title) in enumerate(heads):
        if "(deleted" in title or "(split:" in title:
            continue
        end = heads[k + 1][0] if k + 1 < len(heads) else len(lines)
        layer = ms = None; deps = []
        for l in lines[i + 1:end]:
            if (m := META.match(l)): layer, ms = m.groups()
            elif (m := DEPS.match(l)):
                raw = m.group(1).strip()
                deps = [] if raw in ("—", "-", "") else [d.strip() for d in raw.split(",") if d.strip()]
        if not ms:
            continue
        reqs[rid] = dict(id=rid, title=title.replace("*", "").strip(),
                         layer=layer, ms=ms, deps=deps)
        order.append(rid)
    return reqs, order


def live_state():
    """{requirement id: 'OPEN'|'CLOSED'} from gh, or {} if unavailable."""
    if not MAP.exists():
        return {}
    ids = dict(l.split() for l in MAP.read_text().split("\n") if l.strip())
    try:
        raw = subprocess.run(["gh", "issue", "list", "--state", "all", "--limit", "300",
                              "--json", "number,state"],
                             capture_output=True, text=True, check=True).stdout
    except Exception as e:
        print(f"  (live state unavailable: {e})", file=sys.stderr)
        return {}
    by_num = {str(i["number"]): i["state"] for i in json.loads(raw)}
    return {rid: by_num.get(num, "OPEN") for rid, num in ids.items()}


def waves(reqs):
    """Successive sets of work that become available, assuming everything before is done."""
    done, out, remaining = set(), [], dict(reqs)
    while remaining:
        layer = sorted(r for r, v in remaining.items() if all(d in done for d in v["deps"]))
        if not layer:
            break
        out.append(layer)
        done |= set(layer)
        for r in layer:
            remaining.pop(r)
    return out


def critical_path(reqs):
    """Longest chain — the floor on how many sequential steps the build takes."""
    memo = {}
    def depth(r):
        if r in memo: return memo[r]
        memo[r] = ([r] if not reqs[r]["deps"]
                   else max((depth(d) for d in reqs[r]["deps"] if d in reqs),
                            key=len, default=[]) + [r])
        return memo[r]
    return max((depth(r) for r in reqs), key=len)


def mermaid(reqs, ids, state):
    """One graph for a subset. Edges to nodes outside the subset are drawn as ghosts."""
    inside = set(ids)
    lines = ["```mermaid", "graph LR"]
    ghosts = set()
    for r in ids:
        v = reqs[r]
        st = state.get(r)
        mark = "✓ " if st == "CLOSED" else ""
        lines.append(f'  {r.replace("-","_")}["{mark}{r}<br/>{v["title"][:34]}"]')
    for r in ids:
        for d in reqs[r]["deps"]:
            if d not in reqs: continue
            if d not in inside:
                ghosts.add(d)
            lines.append(f'  {d.replace("-","_")} --> {r.replace("-","_")}')
    for g in sorted(ghosts):
        lines.insert(2, f'  {g.replace("-","_")}(["{g}"])')
    # colour by layer
    layers = collections.defaultdict(list)
    for r in ids:
        layers[reqs[r]["layer"]].append(r.replace("-", "_"))
    palette = {"infra": "#0E4429", "data": "#1F6FEB", "api": "#8250DF",
               "state": "#BF8700", "ui": "#F87823", "design": "#DB61A2"}
    for lay, members in layers.items():
        if lay in palette:
            lines.append(f'  classDef {lay} fill:{palette[lay]}22,stroke:{palette[lay]},color:#ddd')
            lines.append(f'  class {",".join(members)} {lay}')
    lines.append("```")
    return "\n".join(lines)


def main():
    reqs, order = parse()
    state = live_state() if "--live" in sys.argv else {}
    blocks = collections.defaultdict(list)
    for r in reqs.values():
        for d in r["deps"]:
            blocks[d].append(r["id"])

    w = waves(reqs)
    cp = critical_path(reqs)
    ready = [r for r in order if not reqs[r]["deps"]]
    fanout = sorted(((len(blocks[r]), r) for r in order), reverse=True)[:8]

    doc = []
    doc.append("# DAG — the build order\n")
    doc.append("**Generated** by `scripts/gen-dag.py` from `requirements/REQUIREMENTS.md`. "
               "Hand edits are meaningless; the next run overwrites them.\n")
    if state:
        closed = sum(1 for v in state.values() if v == "CLOSED")
        doc.append(f"**Live state:** {closed} of {len(reqs)} closed.\n")
    else:
        doc.append("_Structural view — run with `--live` once issues exist to overlay open/closed._\n")

    doc.append(f"""
| | |
|---|---|
| Requirements | **{len(reqs)}** |
| Dependencies | **{sum(len(r['deps']) for r in reqs.values())}** |
| Ready at t=0 | **{', '.join(ready)}** |
| Critical path | **{len(cp)} steps** |
| Widest parallelism | **{max(len(x) for x in w)} issues at once** (wave {[len(x) for x in w].index(max(len(x) for x in w)) + 1}) |
""")

    doc.append("\n## Critical path\n")
    doc.append("The longest chain in the graph. Nothing makes the build shorter than this, "
               "however many agents run in parallel — so a delay here is the only kind that "
               "costs calendar time.\n")
    doc.append("`" + " → ".join(cp) + "`\n")
    doc.append("\n> **A longer critical path is not automatically worse.** Splitting `DATA-01` "
               "into four domain migrations added three steps to this chain, but those migrations "
               "were always sequential — foreign keys decide that, not the tickets. What the split "
               "bought is that `DATA-02` starts after `DATA-01a` instead of after all four. Count "
               "steps to find the chain that matters; do not treat the number as a score.\n")

    doc.append("\n## Waves\n")
    doc.append("What becomes available as the previous wave closes. This is not a schedule — "
               "it is the *shape* of the available parallelism.\n")
    doc.append("| Wave | Count | Issues |\n|---|---|---|")
    for i, layer in enumerate(w, 1):
        doc.append(f"| {i} | {len(layer)} | {', '.join(layer)} |")

    doc.append("\n\n## Highest leverage\n")
    doc.append("When several issues are ready, the one unblocking the most is usually the "
               "one to take.\n")
    doc.append("| Issue | Unblocks |\n|---|---|")
    for n, r in fanout:
        if n: doc.append(f"| **{r}** — {reqs[r]['title']} | {n} |")

    for ms in MS_ORDER:
        ids = [r for r in order if reqs[r]["ms"] == ms]
        if not ids: continue
        doc.append(f"\n\n## {ms} — {len(ids)} issues\n")
        doc.append("Rounded nodes are dependencies from an earlier milestone.\n")
        doc.append(mermaid(reqs, ids, state))

    OUT.write_text("\n".join(doc) + "\n", encoding="utf-8")
    print(f"DAG.md — {len(reqs)} nodes, critical path {len(cp)}, "
          f"widest wave {max(len(x) for x in w)}")
    print("  critical path: " + " → ".join(cp))


if __name__ == "__main__":
    main()
