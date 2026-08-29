#!/usr/bin/env python3
"""Report CLEAR's live, unclaimed GitHub DAG ready queue."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DAG = ROOT / "docs" / "DAG.md"
ISSUE_ID = re.compile(r"\[([A-Z]+-[0-9]+[a-z]?)\]")


class DagReadyError(RuntimeError):
    """Raised when the live queue cannot be reported safely."""


def gh_json(arguments: list[str]) -> Any:
    try:
        result = subprocess.run(
            ["gh", *arguments],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as error:
        raise DagReadyError("GitHub CLI (`gh`) is not installed.") from error
    except subprocess.CalledProcessError as error:
        detail = error.stderr.strip() or error.stdout.strip() or "unknown GitHub CLI error"
        raise DagReadyError(detail) from error

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise DagReadyError("GitHub returned data that was not valid JSON.") from error


def resolve_repo(explicit_repo: str | None) -> str:
    if explicit_repo:
        return explicit_repo
    result = gh_json(["repo", "view", "--json", "nameWithOwner"])
    return str(result["nameWithOwner"])


def split_repo(repo: str) -> tuple[str, str]:
    parts = repo.split("/", maxsplit=1)
    if len(parts) != 2 or not all(parts):
        raise DagReadyError(f"Expected repository as owner/name, received: {repo}")
    return parts[0], parts[1]


def read_critical_ids(path: Path = DEFAULT_DAG) -> set[str]:
    if not path.exists():
        return set()
    text = path.read_text(encoding="utf-8")
    match = re.search(r"## Critical path\s+(.*?)(?=\n## )", text, re.DOTALL)
    if not match:
        return set()
    return set(re.findall(r"\b[A-Z]+-[0-9]+[a-z]?\b", match.group(1)))


def issue_id(title: str) -> str | None:
    match = ISSUE_ID.search(title)
    return match.group(1) if match else None


def milestone_order(issue: dict[str, Any]) -> tuple[int, str]:
    milestone = issue.get("milestone") or {}
    title = str(milestone.get("title") or "")
    match = re.fullmatch(r"M(\d+)", title)
    return (int(match.group(1)), title) if match else (sys.maxsize, title)


def open_dependency_index(graph_nodes: list[dict[str, Any]]) -> dict[int, dict[str, int]]:
    index: dict[int, dict[str, int]] = {}
    for node in graph_nodes:
        blockers = node.get("blockedBy", {}).get("nodes", [])
        dependents = node.get("blocking", {}).get("nodes", [])
        index[int(node["number"])] = {
            "open_blockers": sum(item.get("state") == "OPEN" for item in blockers),
            "open_dependents": sum(item.get("state") == "OPEN" for item in dependents),
        }
    return index


def closing_pr_index(pull_requests: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    index: dict[int, dict[str, Any]] = {}
    for pull_request in pull_requests:
        for issue in pull_request.get("closingIssuesReferences") or []:
            index[int(issue["number"])] = {
                "number": int(pull_request["number"]),
                "url": pull_request["url"],
                "head": pull_request["headRefName"],
            }
    return index


def validate_ready_sets(native_numbers: set[int], graph_numbers: set[int]) -> None:
    if native_numbers == graph_numbers:
        return
    only_native = sorted(native_numbers - graph_numbers)
    only_graph = sorted(graph_numbers - native_numbers)
    raise DagReadyError(
        "GitHub readiness signals disagree; refusing to recommend work. "
        f"Native-only: {only_native or 'none'}; open-blocker-only: {only_graph or 'none'}."
    )


def rank_ready(
    native_ready: list[dict[str, Any]],
    dependency_index: dict[int, dict[str, int]],
    pull_request_index: dict[int, dict[str, Any]],
    critical_ids: set[str],
) -> list[dict[str, Any]]:
    ranked: list[dict[str, Any]] = []
    for issue in native_ready:
        number = int(issue["number"])
        dependency = dependency_index[number]
        identifier = issue_id(str(issue["title"]))
        ranked.append(
            {
                **issue,
                "id": identifier,
                "fanout": dependency["open_dependents"],
                "critical": identifier in critical_ids,
                "pullRequest": pull_request_index.get(number),
            }
        )

    return sorted(
        ranked,
        key=lambda item: (
            item["pullRequest"] is not None,
            *milestone_order(item),
            -int(item["fanout"]),
            not bool(item["critical"]),
            int(item["number"]),
        ),
    )


def fetch_queue(repo: str) -> list[dict[str, Any]]:
    native_ready = gh_json(
        [
            "issue",
            "list",
            "--repo",
            repo,
            "--search",
            "is:open -is:blocked",
            "--limit",
            "100",
            "--json",
            "number,title,url,milestone,labels",
        ]
    )

    owner, name = split_repo(repo)
    query = """
      query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          issues(first: 100, states: OPEN, orderBy: {field: CREATED_AT, direction: ASC}) {
            nodes {
              number
              blockedBy(first: 100) { nodes { number state } }
              blocking(first: 100) { nodes { number state } }
            }
            pageInfo { hasNextPage }
          }
        }
      }
    """
    graph = gh_json(
        [
            "api",
            "graphql",
            "-f",
            f"query={query}",
            "-F",
            f"owner={owner}",
            "-F",
            f"name={name}",
        ]
    )
    issues = graph["data"]["repository"]["issues"]
    if issues["pageInfo"]["hasNextPage"]:
        raise DagReadyError("The repository has more than 100 open issues; pagination is required.")

    dependency_index = open_dependency_index(issues["nodes"])
    graph_ready = {
        number
        for number, dependency in dependency_index.items()
        if dependency["open_blockers"] == 0
    }
    native_numbers = {int(issue["number"]) for issue in native_ready}
    validate_ready_sets(native_numbers, graph_ready)

    pull_requests = gh_json(
        [
            "pr",
            "list",
            "--repo",
            repo,
            "--state",
            "open",
            "--limit",
            "100",
            "--json",
            "number,url,headRefName,closingIssuesReferences",
        ]
    )
    return rank_ready(
        native_ready,
        dependency_index,
        closing_pr_index(pull_requests),
        read_critical_ids(),
    )


def plain_report(repo: str, queue: list[dict[str, Any]]) -> str:
    available = [issue for issue in queue if issue["pullRequest"] is None]
    in_progress = [issue for issue in queue if issue["pullRequest"] is not None]
    lines = [
        f"CLEAR DAG ready queue — {repo}",
        f"{len(queue)} ready · {len(available)} available · {len(in_progress)} in an open PR",
        "",
        "Rank  Issue  Milestone  Fan-out  Path      State       Title",
    ]
    for rank, issue in enumerate(queue, start=1):
        milestone = (issue.get("milestone") or {}).get("title") or "—"
        path = "critical" if issue["critical"] else "—"
        state = f"PR #{issue['pullRequest']['number']}" if issue["pullRequest"] else "available"
        lines.append(
            f"{rank:<5} #{issue['number']:<5} {milestone:<10} {issue['fanout']:<8} "
            f"{path:<9} {state:<11} {issue['title']}"
        )
    lines.append("")
    if available:
        recommendation = available[0]
        lines.append(
            f"Recommended: #{recommendation['number']} {recommendation['title']} "
            f"({recommendation['fanout']} open dependents)"
        )
        lines.append(
            f"Inspect: gh issue view {recommendation['number']} --repo {repo} --comments"
        )
    else:
        lines.append("No unclaimed ready issue. Review or merge the open pull requests, then rerun.")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", help="GitHub repository as owner/name (defaults to current remote)")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON")
    return parser.parse_args()


def main() -> int:
    arguments = parse_args()
    try:
        repo = resolve_repo(arguments.repo)
        queue = fetch_queue(repo)
    except (DagReadyError, KeyError, TypeError) as error:
        print(f"dag-ready: {error}", file=sys.stderr)
        return 1

    if arguments.json:
        print(json.dumps({"repo": repo, "ready": queue}, indent=2))
    else:
        print(plain_report(repo, queue))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
