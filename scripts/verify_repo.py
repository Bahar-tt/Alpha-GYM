"""Verify the ops repo: compile scripts and block secrets/data filenames/patterns."""

from __future__ import annotations

import py_compile
import re
import subprocess
from pathlib import Path

from common import ROOT

BLOCKED_NAME = re.compile(
    r"(?i)(^|/)(\.env($|\.)|agent\.config\.json$|.*agent[_-]?key.*|.*anydesk.*|.*\.pem$|.*\.key$|.*\.db$|.*\.db-.*|.*\.sqlite3?$|.*\.bak$|.*\.bak-.*|.*\.dump$|.*\.sql\.gz$)"
)
HARDCODED_SECRET = re.compile(
    r"(?i)\b(password|passwd|pwd|agent[_-]?key|token|secret|api[_-]?key)\b\s*[:=]\s*['\"](?!\s*(?:your|change|placeholder|<|$))[^'\"]{4,}['\"]"
)
SKIP_DIRS = {".git", "__pycache__", ".venv", "venv", "node_modules"}


def tracked_or_all_files():
    git_dir = ROOT / ".git"
    if git_dir.exists():
        result = subprocess.run(
            ["git", "ls-files"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            return [ROOT / line for line in result.stdout.splitlines() if line.strip()]
    return [p for p in ROOT.rglob("*") if p.is_file() and not (set(p.relative_to(ROOT).parts) & SKIP_DIRS)]


def main() -> int:
    issues = []
    files = tracked_or_all_files()

    for path in files:
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT).as_posix()
        if BLOCKED_NAME.search("/" + rel) and rel != ".env.example":
            issues.append(f"blocked filename: {rel}")

    for path in ROOT.rglob("*.py"):
        if set(path.relative_to(ROOT).parts) & SKIP_DIRS:
            continue
        try:
            py_compile.compile(str(path), doraise=True)
        except Exception as exc:
            issues.append(f"syntax error: {path.relative_to(ROOT).as_posix()}: {exc}")

    for path in files:
        if not path.is_file() or path.suffix.lower() not in {".py", ".md", ".jsonc", ".txt", ".example"}:
            continue
        if path.name == ".env.example":
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for match in HARDCODED_SECRET.finditer(text):
            line_no = text.count("\n", 0, match.start()) + 1
            issues.append(
                f"hardcoded secret pattern: {path.relative_to(ROOT).as_posix()}:{line_no}"
            )

    if issues:
        print("VERIFY FAILED")
        for issue in issues:
            print("- " + issue)
        return 1

    print(f"VERIFY OK: {len(files)} files checked, no blocked filenames or hardcoded-secret patterns")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
