"""Collect a sanitized backend snapshot. No DB data, backups, logs, or secrets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from common import (
    BACKEND_DIR,
    DB_PATH,
    ROOT,
    RemoteConfig,
    connect,
    print_block,
    redact_text,
    run_remote_python,
    stamp,
    write_text,
)
from health_check import remote_payload as health_payload

BLOCKED_PARTS = (".env", "agent", "secret", "password", "passwd", "token", "anydesk", "private", ".pem", ".key")
SKIP_DIRS = {"node_modules", ".git", "logs", "backups", "uploads", "tmp", "__pycache__"}
ALLOWED_EXTRA_NAMES = {"package.json", "schema.sql", "README.md", "app.js", "server.js", "index.js", "db.js", "database.js"}


def file_list_payload() -> str:
    return f'''import json, os
root = "{BACKEND_DIR}"
blocked = {json.dumps(list(BLOCKED_PARTS))}
skip_dirs = {json.dumps(sorted(SKIP_DIRS))}
extra = {json.dumps(sorted(ALLOWED_EXTRA_NAMES))}
files = []
for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d not in skip_dirs and not d.startswith(".")]
    for name in filenames:
        lower = name.lower()
        if lower.endswith(".js") or name in extra or lower.endswith(".sql"):
            if any(part in lower for part in blocked):
                continue
            path = os.path.join(dirpath, name)
            try:
                size = os.path.getsize(path)
            except OSError:
                continue
            if size <= 2_000_000:
                files.append([os.path.relpath(path, root).replace(os.sep, "/"), path, size])
print(json.dumps(sorted(files), ensure_ascii=False))
'''


def schema_payload() -> str:
    return f'''import sqlite3
con = sqlite3.connect("file:{DB_PATH}?mode=ro", uri=True)
for row_type, name, sql in con.execute("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name"):
    print("-- " + str(row_type) + ": " + str(name))
    print(str(sql) + ";")
    print("")
con.close()
'''


def main() -> int:
    parser = argparse.ArgumentParser(description="Sanitized backend snapshot collector")
    parser.add_argument("--out", help="Output directory under snapshots/")
    args = parser.parse_args()

    cfg = RemoteConfig.from_env()
    snapshot_name = args.out or stamp()
    out_dir = (ROOT / "snapshots" / snapshot_name).resolve()
    snapshots_root = (ROOT / "snapshots").resolve()
    if snapshots_root not in out_dir.parents:
        raise SystemExit("--out must be inside snapshots/")

    client = connect(cfg)
    manifest = {"name": snapshot_name, "redaction": "applied", "files": [], "excluded": []}
    try:
        rc, out, err = run_remote_python(client, file_list_payload(), timeout=40)
        if rc != 0:
            print_block("FILE_LIST_FAILED", out, err, rc)
            return rc
        files = json.loads(out.strip().splitlines()[-1])

        sftp = client.open_sftp()
        try:
            for rel, remote_path, size in files:
                if ".." in Path(rel).parts or Path(rel).is_absolute():
                    manifest["excluded"].append({"path": rel, "reason": "unsafe relative path"})
                    continue
                with sftp.open(remote_path, "r") as handle:
                    raw = handle.read()
                text = raw.decode("utf-8", errors="replace")
                safe_text = redact_text(text)
                target = out_dir / "backend" / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(safe_text, encoding="utf-8")
                manifest["files"].append({"path": rel, "bytes": size, "redacted": safe_text != text})
        finally:
            sftp.close()

        rc, out, err = run_remote_python(client, schema_payload(), timeout=40)
        if rc == 0:
            write_text(out_dir / "db_schema.sql", redact_text(out))
            manifest["files"].append({"path": "db_schema.sql", "kind": "schema-only"})
        else:
            manifest["excluded"].append({"path": "db_schema.sql", "reason": "collection failed"})

        rc, out, err = run_remote_python(client, health_payload(), timeout=60)
        if rc == 0:
            write_text(out_dir / "health.json", redact_text(out.strip().splitlines()[-1]) + "\n")
            manifest["files"].append({"path": "health.json", "kind": "health"})
        else:
            manifest["excluded"].append({"path": "health.json", "reason": "collection failed"})
    finally:
        client.close()

    write_text(out_dir / "MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    write_text(
        out_dir / "README_SNAPSHOT.txt",
        "Sanitized snapshot. Local-only by default. No DB rows, backups, logs, secrets, agent config/key, or AnyDesk credentials.\n",
    )
    print(f"SNAPSHOT {out_dir}")
    print(f"FILES {len(manifest['files'])} EXCLUDED {len(manifest['excluded'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
