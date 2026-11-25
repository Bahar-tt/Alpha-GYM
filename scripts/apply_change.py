"""Apply a reviewed DB change script after making a fresh backup.

This is deliberately strict: it only runs scripts stored in changes/ that contain
the required proof tokens. Human review is still mandatory.
"""

from __future__ import annotations

import argparse
import shlex
from pathlib import Path

from common import (
    ROOT,
    RemoteConfig,
    connect,
    print_block,
    run_remote,
    safe_token,
    stamp,
    upload,
)
from make_backup import create_backup

REQUIRED_TOKENS = (
    "sqlite3.connect",
    "AG_BACKUP_PATH",
    "BEGIN",
    "COMMIT",
    "ROLLBACK",
    "PRAGMA integrity_check",
    "ROWCOUNT",
    "FINAL_COUNTS",
    "INTEGRITY ok",
    "COMMITTED",
)
REQUIRED_OUTPUT = ("ROWCOUNT", "FINAL_COUNTS", "INTEGRITY ok", "COMMITTED")


def check_change_file(path: Path) -> str:
    changes_root = (ROOT / "changes").resolve()
    resolved = path.resolve()
    if changes_root not in resolved.parents:
        raise SystemExit(f"Change file must live under {changes_root}")
    if not resolved.is_file():
        raise SystemExit(f"Change file not found: {resolved}")
    text = resolved.read_text(encoding="utf-8")
    missing = [token for token in REQUIRED_TOKENS if token not in text]
    if missing:
        raise SystemExit("Change file is missing required tokens: " + ", ".join(missing))
    return text


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply a reviewed DB change")
    parser.add_argument("--change-file", required=True)
    parser.add_argument("--reason", required=True)
    parser.add_argument("--confirm", help='Must be exactly "APPLY <reason>"')
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args()

    expected = f"APPLY {args.reason}"
    if args.confirm != expected:
        raise SystemExit(f'--confirm must be exactly "{expected}"')

    change_path = Path(args.change_file)
    check_change_file(change_path)

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        backup = create_backup(
            client,
            args.reason,
            persist=True,
            sudo_password=cfg.sudo_password,
            timeout=args.timeout,
        )
        token = safe_token(args.reason, default="change")
        remote_path = f"/tmp/agops-change-{token}-{stamp()}.py"
        upload(client, change_path, remote_path)

        env_prefix = (
            f"env AG_BACKUP_PATH={shlex.quote(str(backup['tmp']))} "
            f"AG_REASON={shlex.quote(args.reason)} "
        )
        rc, out, err = run_remote(
            client,
            env_prefix + "python3 " + shlex.quote(remote_path),
            timeout=args.timeout,
        )
    finally:
        client.close()

    print_block("APPLY_OUTPUT", out, err, rc)
    if rc != 0:
        raise SystemExit("Change script failed. Check ROLLBACK output and the backup path above.")
    missing_output = [token for token in REQUIRED_OUTPUT if token not in out]
    if missing_output:
        raise SystemExit("Change script finished but did not print proof tokens: " + ", ".join(missing_output))

    print("APPLY_OK backup=" + str(backup["tmp"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
