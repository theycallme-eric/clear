import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "dag-ready.py"
SPEC = importlib.util.spec_from_file_location("dag_ready", SCRIPT)
assert SPEC and SPEC.loader
dag_ready = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(dag_ready)


class DagReadyTests(unittest.TestCase):
    def test_closed_blockers_do_not_prevent_readiness(self):
        index = dag_ready.open_dependency_index(
            [
                {
                    "number": 2,
                    "blockedBy": {"nodes": [{"number": 1, "state": "CLOSED"}]},
                    "blocking": {"nodes": [{"number": 5, "state": "OPEN"}]},
                }
            ]
        )
        self.assertEqual(index[2], {"open_blockers": 0, "open_dependents": 1})

    def test_rank_prefers_available_then_milestone_then_fanout(self):
        issues = [
            {"number": 2, "title": "[ENV-02] CI", "milestone": {"title": "M0"}},
            {"number": 3, "title": "[ENV-03] Deploy", "milestone": {"title": "M0"}},
            {"number": 4, "title": "[ENV-04] Dev", "milestone": {"title": "M1"}},
        ]
        dependency_index = {
            2: {"open_blockers": 0, "open_dependents": 2},
            3: {"open_blockers": 0, "open_dependents": 5},
            4: {"open_blockers": 0, "open_dependents": 9},
        }
        pull_requests = {3: {"number": 74, "url": "url", "head": "env-03"}}

        ranked = dag_ready.rank_ready(
            issues, dependency_index, pull_requests, {"ENV-02", "ENV-04"}
        )

        self.assertEqual([issue["number"] for issue in ranked], [2, 4, 3])

    def test_native_and_open_blocker_sets_must_match(self):
        with self.assertRaises(dag_ready.DagReadyError):
            dag_ready.validate_ready_sets({2, 3}, {2})

    def test_closing_issue_references_claim_ready_work(self):
        index = dag_ready.closing_pr_index(
            [
                {
                    "number": 72,
                    "url": "https://example.test/pr/72",
                    "headRefName": "env-01",
                    "closingIssuesReferences": [{"number": 1}],
                }
            ]
        )
        self.assertEqual(index[1]["number"], 72)


if __name__ == "__main__":
    unittest.main()
