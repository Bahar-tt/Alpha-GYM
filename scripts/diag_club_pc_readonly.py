"""Read-only club-PC fingerprint diagnostic for the other OpenCode agent.

Run on the Windows club PC, not on the cloud server:

    py -3 diag_club_pc_readonly.py --path "C:\\alpha-gym-module-native"

It never writes, deletes, enrolls, resets UFS, or prints agent_key/password/token.
It prints one JSON report to stdout. Paste that report back (redaction is built in).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

LOG_WORDS = (
    "enroll", "native", "stuck", "fplib", "0xc0000005", "800008", "800009",
    "timeout", "تایم", "زمان ثبت", "اثر انگشت", "انگشت", "sensor", "snsor",
    "foh", "callback", "complete", "failed", "false", "busy", "restart",
)
SOURCE_MARKERS = (
    "FohReadLoop_End", "FohReadLoop_Start", "CancelEnroll", "EnrollCmplete",
    "EnrollComplete", "native-stuck", "Enroll() returned false", "activeFinger",
    "clearTimeout", "setTimeout", "enrollWorker", "_enrolling", "lock (",
    "Monitor.Enter", "Enroll(", "RaiseFail", "enroll_failed", "enroll_complete",
)
SOURCE_FILES = ("Agent.cs", "Hardware.cs", "GymBridge.cs", "Program.cs", "Log.cs")
REDACT = re.compile(
    r"(?i)\b(agent[_-]?key|password|passwd|token|secret|authorization|bearer)\b"
    r"\s*[:=]\s*['\"]?([^\s'\";,}]{3,})"
)


def sha256(path: Path, limit: int = 80 * 1024 * 1024) -> str | None:
    try:
        if path.stat().st_size > limit:
            return None
        h = hashlib.sha256()
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def redact(text: str) -> str:
    return REDACT.sub(lambda m: m.group(0).replace(m.group(2), "***REDACTED***"), text)


def smart_decode(raw: bytes) -> str:
    try:
        text = raw.decode("utf-8")
        if "\ufffd" not in text:
            return text
    except UnicodeDecodeError:
        pass
    try:
        return raw.decode("cp1252").encode("latin-1", "ignore").decode("utf-8", "replace")
    except Exception:
        return raw.decode("utf-8", "replace")


def line_context(text: str, marker: str, radius: int = 2) -> list[dict]:
    lines = text.splitlines()
    hits = []
    needle = marker.lower()
    for i, line in enumerate(lines):
        if needle in line.lower():
            start, end = max(0, i - radius), min(len(lines), i + radius + 1)
            hits.append({
                "line": i + 1,
                "text": redact("\n".join(lines[start:end]))[:1600],
            })
            if len(hits) >= 4:
                break
    return hits


def read_log(log: Path, tail_lines: int) -> dict:
    out = {"path": str(log), "sha256": sha256(log), "size": None, "matched_lines": []}
    try:
        data = log.read_bytes()
    except OSError as exc:
        out["error"] = type(exc).__name__
        return out
    out["size"] = len(data)
    text = smart_decode(data)
    lines = text.splitlines()
    out["total_lines"] = len(lines)
    picked = []
    for idx, line in enumerate(lines):
        low = line.lower()
        if any(word.lower() in low for word in LOG_WORDS):
            picked.append({"line": idx + 1, "text": redact(line)[:900]})
    out["matched_lines"] = picked[-tail_lines:]
    out["matched_total"] = len(picked)
    return out


def source_report(root: Path) -> dict:
    report = {}
    for name in SOURCE_FILES:
        path = root / "src" / name
        item = {"exists": path.is_file(), "sha256": sha256(path) if path.is_file() else None}
        if path.is_file():
            try:
                text = smart_decode(path.read_bytes())
                item["size"] = len(text.encode("utf-8", "replace"))
                item["markers"] = {
                    marker: len(re.findall(re.escape(marker), text, flags=re.IGNORECASE))
                    for marker in SOURCE_MARKERS
                    if marker.lower() in text.lower()
                }
                item["context"] = {
                    marker: line_context(text, marker)
                    for marker in (
                        "FohReadLoop_End", "FohReadLoop_Start", "CancelEnroll",
                        "native-stuck", "Enroll() returned false", "_enrolling",
                    )
                    if marker.lower() in text.lower()
                }
            except OSError as exc:
                item["error"] = type(exc).__name__
        report[name] = item
    return report


def ufs_report(root: Path, foh_ids: list[str]) -> dict:
    dbdir = root / "DataBase"
    out = {"directory": str(dbdir), "files": []}
    if not dbdir.is_dir():
        out["error"] = "DataBase directory missing"
        return out
    for path in sorted(dbdir.glob("*.UFS")) + sorted(dbdir.glob("*.ufs")):
        item = {"name": path.name, "size": None, "sha256": sha256(path)}
        try:
            raw = path.read_bytes()
            item["size"] = len(raw)
            item["id_search"] = {}
            for foh in foh_ids:
                ascii_hits = [m.start() for m in re.finditer(re.escape(foh.encode("ascii")), raw)]
                utf16_hits = [m.start() for m in re.finditer(re.escape(foh.encode("utf-16le")), raw)]
                item["id_search"][foh] = {
                    "ascii_count": len(ascii_hits),
                    "utf16le_count": len(utf16_hits),
                    "first_offsets": (ascii_hits[:3] + utf16_hits[:3]),
                }
        except OSError as exc:
            item["error"] = type(exc).__name__
        out["files"].append(item)
    return out


def process_report() -> dict:
    out = {}
    try:
        cp = subprocess.run(["tasklist", "/FO", "CSV"], capture_output=True, text=True, timeout=20)
        names = ("alphagymagent.exe", "gymbridge.exe", "node.exe")
        out["wanted"] = []
        for line in cp.stdout.splitlines()[1:]:
            low = line.lower()
            if any(name in low for name in names):
                out["wanted"].append(redact(line)[:400])
        out["rc"] = cp.returncode
    except Exception as exc:
        out["error"] = type(exc).__name__
    try:
        cp = subprocess.run(["sc", "query"], capture_output=True, text=True, timeout=20)
        out["services"] = [
            redact(line)[:400] for line in cp.stdout.splitlines()
            if "alphagym" in line.lower() or "finger" in line.lower() or "agent" in line.lower()
        ]
    except Exception as exc:
        out["service_error"] = type(exc).__name__
    return out


def queue_report(root: Path) -> dict:
    out = {}
    for name in ("enroll_queue.json", "attendance_queue.json"):
        path = root / name
        item = {"exists": path.is_file()}
        if path.is_file():
            try:
                raw = path.read_bytes()
                item["size"] = len(raw)
                item["sha256"] = hashlib.sha256(raw).hexdigest()
                item["preview"] = redact(smart_decode(raw))[:300]
            except OSError as exc:
                item["error"] = type(exc).__name__
        out[name] = item
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", default=r"C:\alpha-gym-module-native")
    parser.add_argument("--tail-lines", type=int, default=80)
    parser.add_argument("--foh", nargs="*", default=["800008", "800009"])
    args = parser.parse_args()

    root = Path(args.path)
    report = {
        "read_only": True,
        "path": str(root),
        "exists": root.is_dir(),
        "top_level": [],
        "source": {},
        "ufs": {},
        "queues": {},
        "processes": {},
        "logs": [],
    }
    if not root.is_dir():
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 2

    report["top_level"] = [
        {"name": p.name, "size": p.stat().st_size if p.is_file() else None,
         "sha256": sha256(p) if p.is_file() and p.suffix.lower() in (".cs", ".js", ".json", ".dll", ".exe", ".bat", ".txt") else None}
        for p in sorted(root.iterdir())
    ]
    report["source"] = source_report(root)
    report["ufs"] = ufs_report(root, args.foh)
    report["queues"] = queue_report(root)
    report["processes"] = process_report()
    for log_name in ("agent.log", "native.log", "logs/agent.log"):
        log = root / log_name
        if log.is_file():
            report["logs"].append(read_log(log, args.tail_lines))

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
