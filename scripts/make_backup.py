"""Create a fresh SQLite backup before any DB change.

This writes a backup file, so it requires --confirm BACKUP.
"""

from __future__ import annotations

import argparse
import json
import shlex
from typing import Dict

from common import (
    BACKEND_DIR,
    DB_PATH,
    RemoteConfig,
    connect,
    print_block,
    run_remote,
    run_remote_python,
    safe_token,
    stamp,
)


def create_backup(client, reason: str, *, persist: bool, sudo_password: str = "", timeout: int = 90) -> Dict[str, object]:
    token = safe_token(reason, default="manual")
    suffix = f"agops-{token}-{stamp()}"
    tmp_path = f"/tmp/gym.db.bak-{suffix}"
    final_path = BACKEND_DIR + f"/gym.db.bak-{suffix}"

    payload = f'''import json, os, sqlite3
tmp_path = {json.dumps(tmp_path)}
src = sqlite3.connect("file:{DB_PATH}?mode=ro", uri=True)
dst = sqlite3.connect(tmp_path)
src.backup(dst)
dst.close()
chk = sqlite3.connect("file:" + tmp_path + "?mode=ro", uri=True)
integrity = chk.execute("PRAGMA integrity_check").fetchone()[0]
chk.close()
src.close()
size = os.path.getsize(tmp_path)
print("BACKUP_TMP " + tmp_path)
print(json.dumps({{"path": tmp_path, "bytes": size, "integrity_check": integrity}}, ensure_ascii=False))
'''

    rc, out, err = run_remote_python(client, payload, timeout=timeout)
    if rc != 0 or "BACKUP_TMP " not in out:
        print_block("BACKUP_FAILED", out, err, rc)
        raise SystemExit("Backup failed. No DB change is allowed.")

    data = json.loads([line for line in out.splitlines() if line.startswith("{")][-1])
    if data.get("integrity_check") != "ok" or int(data.get("bytes") or 0) < 1000:
        raise SystemExit(f"Backup verification failed: {data}")

    result: Dict[str, object] = {"tmp": data["path"], "bytes": data["bytes"], "integrity_check": "ok"}

    if persist:
        q_tmp = shlex.quote(str(data["path"]))
        q_final = shlex.quote(final_path)
        rc, out, err = run_remote(
            client,
            f"cp -p {q_tmp} {q_final} && ls -lh {q_final}",
            sudo=True,
            sudo_password=sudo_password,
            timeout=30,
        )
        if rc != 0:
            print_block("BACKUP_PERSIST_FAILED", out, err, rc)
            raise SystemExit("Backup was created in /tmp but could not be copied to the backend directory.")
        result["persisted"] = final_path
        print_block("BACKUP_PERSISTED", out, err, rc)

    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a fresh DB backup")
    parser.add_argument("--reason", required=True, help="Short ASCII reason, e.g. sara-dance-fix")
    parser.add_argument("--persist", action="store_true", help="Also copy backup into backend directory")
    parser.add_argument("--confirm", help="Must be exactly BACKUP")
    parser.add_argument("--timeout", type=int, default=90)
    args = parser.parse_args()

    if args.confirm != "BACKUP":
        raise SystemExit("--confirm BACKUP is required before creating a backup")
    if not args.reason.strip():
        raise SystemExit("--reason cannot be empty")

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        result = create_backup(
            client,
            args.reason,
            persist=args.persist,
            sudo_password=cfg.sudo_password,
            timeout=args.timeout,
        )
    finally:
        client.close()

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
