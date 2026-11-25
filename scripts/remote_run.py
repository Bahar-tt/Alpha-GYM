"""Run a remote command or Python diagnostic script through SSH.

Read-only by default. Destructive/write commands require --allow-write --confirm WRITE.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from common import (
    RemoteConfig,
    assert_readonly_command,
    connect,
    print_block,
    run_remote,
    safe_token,
    stamp,
    upload,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Safe remote command runner")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--cmd", help="Remote shell command")
    group.add_argument("--script", help="Local Python diagnostic script to upload and run")
    parser.add_argument("--sudo", action="store_true", help="Run with sudo -S using env password")
    parser.add_argument("--allow-write", action="store_true", help="Disable read-only guard")
    parser.add_argument("--confirm", help="Must be exactly WRITE when --allow-write is used")
    parser.add_argument("--timeout", type=int, default=60)
    args = parser.parse_args()

    if args.allow_write and args.confirm != "WRITE":
        raise SystemExit("--allow-write requires --confirm WRITE")
    if not args.allow_write and args.confirm:
        raise SystemExit("--confirm is only valid with --allow-write")

    local_script = None
    remote_path = None
    if args.script:
        local_script = Path(args.script).resolve()
        if not local_script.is_file():
            raise SystemExit(f"Script not found: {local_script}")
        if not args.allow_write:
            assert_readonly_command(local_script.read_text(encoding="utf-8"))
        remote_path = f"/tmp/agops-{safe_token(local_script.stem)}-{stamp()}.py"
        command = f"python3 {remote_path}"
    else:
        command = args.cmd
        if not args.allow_write:
            assert_readonly_command(command)

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        if local_script is not None:
            upload(client, local_script, remote_path)
        rc, out, err = run_remote(
            client,
            command,
            sudo=args.sudo,
            sudo_password=cfg.sudo_password,
            timeout=args.timeout,
        )
    finally:
        client.close()

    print_block("REMOTE", out, err, rc)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
