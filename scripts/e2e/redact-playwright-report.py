"""Redact access credentials from diagnostic artifacts; never change test inputs."""
import base64
import io
import json
import os
from pathlib import Path
import re
import sys
import zipfile

REDACTED = "[REDACTED]"
SENSITIVE = {
    "authorization", "proxy-authorization", "cookie", "set-cookie",
    "x-vercel-protection-bypass", "x-vercel-set-bypass-cookie",
    "access-token", "refresh-token", "accesstoken", "refreshtoken",
}
EMBEDDED_ZIP = re.compile(r"data:application/zip;base64,([A-Za-z0-9+/=]+)")


def redact_value(value):
    if isinstance(value, list):
        return [redact_value(item) for item in value]
    if not isinstance(value, dict):
        return value
    header = str(value.get("name", "")).lower().replace("_", "-")
    result = {}
    for key, item in value.items():
        name = key.lower().replace("_", "-")
        if name == "cookies":
            result[key] = []
        elif name in SENSITIVE or (name == "value" and header in SENSITIVE):
            result[key] = REDACTED
        else:
            result[key] = redact_value(item)
    return result


def clean_bytes(data, secrets):
    if zipfile.is_zipfile(io.BytesIO(data)):
        result = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(data)) as original, zipfile.ZipFile(result, "w") as clean:
            for entry in original.infolist():
                clean.writestr(entry, clean_bytes(original.read(entry), secrets))
        return result.getvalue()
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        if any(secret.encode() in data for secret in secrets):
            raise ValueError("An artifact contains a credential in unsupported binary data")
        return data  # Screenshots, fonts and other binary resources stay byte-identical.

    text = EMBEDDED_ZIP.sub(
        lambda match: "data:application/zip;base64," + base64.b64encode(
            clean_bytes(base64.b64decode(match[1], validate=True), secrets)
        ).decode(), text,
    )
    for secret in secrets:
        text = text.replace(secret, REDACTED)
    text = re.sub(r"/Users/[^/\s\"']+", "/Users/[redacted-user]", text)

    # Traces/network logs are JSON lines; report metadata can be whole JSON.
    try:
        text = json.dumps(redact_value(json.loads(text)), ensure_ascii=False)
    except json.JSONDecodeError:
        lines = []
        for line in text.splitlines(keepends=True):
            try:
                lines.append(json.dumps(redact_value(json.loads(line)), ensure_ascii=False)
                             + ("\n" if line.endswith("\n") else ""))
            except json.JSONDecodeError:
                lines.append(line)
        text = "".join(lines)
    if any(secret in text for secret in secrets):
        raise ValueError("Credential redaction did not complete")
    return text.encode()


def main():
    secrets = tuple(value for key in ("VERCEL_AUTOMATION_BYPASS_SECRET", "SUPABASE_SERVICE_ROLE_KEY")
                    if (value := os.environ.get(key)))
    count = 0
    for argument in sys.argv[1:]:
        root = Path(argument)
        paths = sorted(root.rglob("*")) if root.is_dir() else [root]
        for path in paths:
            if path.is_symlink():
                raise ValueError("Diagnostic artifact symlinks are not supported")
            if path.is_file():
                path.write_bytes(clean_bytes(path.read_bytes(), secrets))
                count += 1
    print(f"Sanitized {count} diagnostic files; test outcomes and screenshot bytes preserved.")


if __name__ == "__main__":
    main()
