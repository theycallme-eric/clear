import base64
import importlib.util
import io
import json
from pathlib import Path
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("redaction", Path(__file__).with_name("redact-playwright-report.py"))
redaction = importlib.util.module_from_spec(spec)
spec.loader.exec_module(redaction)


def archive(files):
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w", compression=zipfile.ZIP_DEFLATED) as output:
        for name, data in files.items():
            output.writestr(name, data)
    return result.getvalue()


class ReportRedaction(unittest.TestCase):
    def test_trace_headers_cookies_and_known_secret_are_removed_without_changing_measurements(self):
        data = {"request": {"headers": [{"name": "Authorization", "value": "derived-access"},
                                       {"name": "x-vercel-protection-bypass", "value": "fixture-preview-secret"}],
                            "cookies": [{"name": "session", "value": "derived-cookie"}]},
                "settings": {"lineWidth": 2, "grainSoftness": 0.4}, "passed": False,
                "note": "fixture-preview-secret", "path": "/Users/fixture/private/reference"}
        clean = redaction.clean_bytes((json.dumps(data) + "\n").encode(), ("fixture-preview-secret",))
        result = json.loads(clean)
        self.assertEqual(result["request"]["headers"][0]["value"], "[REDACTED]")
        self.assertEqual(result["request"]["cookies"], [])
        self.assertEqual(result["settings"], data["settings"])
        self.assertFalse(result["passed"])
        for excluded in [b"fixture-preview-secret", b"derived-access", b"derived-cookie", b"/Users/fixture/"]:
            self.assertNotIn(excluded, clean)

    def test_nested_zip_and_embedded_html_report_stay_readable_and_pixels_stay_identical(self):
        image = b"\x89PNG\xff\x00immutable-screenshot-bytes"
        network = b'{"headers":[{"name":"set-cookie","value":"derived-cookie"}],"passed":true}\n'
        trace = archive({"0.network": network, "resources/image.png": image})
        report = archive({"trace.zip": trace, "report.json": b'{"status":"failed","note":"fixture-preview-secret"}'})
        html = b'<script>window.report="data:application/zip;base64,' + base64.b64encode(report) + b'";</script>'
        clean = redaction.clean_bytes(html, ("fixture-preview-secret",))
        encoded = redaction.EMBEDDED_ZIP.search(clean.decode())[1]
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(encoded))) as outer:
            self.assertEqual(json.loads(outer.read("report.json"))["status"], "failed")
            self.assertNotIn(b"fixture-preview-secret", outer.read("report.json"))
            with zipfile.ZipFile(io.BytesIO(outer.read("trace.zip"))) as inner:
                self.assertEqual(inner.read("resources/image.png"), image)
                self.assertNotIn(b"derived-cookie", inner.read("0.network"))
                self.assertTrue(json.loads(inner.read("0.network"))["passed"])

    def test_unsupported_binary_with_a_known_credential_fails_closed(self):
        with self.assertRaises(ValueError):
            redaction.clean_bytes(b"\xff\x00fixture-preview-secret", ("fixture-preview-secret",))


if __name__ == "__main__":
    unittest.main()
