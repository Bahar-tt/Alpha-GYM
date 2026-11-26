"""Finish AGFIX113 after the copied files passed verification."""

from __future__ import annotations

import argparse
import hashlib

from common import (
    BACKEND_DIR,
    FRONTEND_DIR,
    PM2_BIN,
    RemoteConfig,
    connect,
    run_remote,
)

LOCAL = __import__("pathlib").Path(__file__).resolve().parents[1] / "local"
ASSET = "index-AGFIX113.js"

PAIRS = [
    (LOCAL / "personnelAttendance.agfix113.js", f"{BACKEND_DIR}/personnelAttendance.js"),
    (LOCAL / "attendanceScan.agfix113.js", f"{BACKEND_DIR}/attendanceScan.js"),
    (LOCAL / "index-AGFIX113.js", f"{FRONTEND_DIR}/assets/{ASSET}"),
    (LOCAL / "agfix113-index.html", f"{FRONTEND_DIR}/index.html"),
]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm", help="Must be exactly RESTART")
    args = parser.parse_args()
    if args.confirm != "RESTART":
        raise SystemExit("--confirm RESTART is required")

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        sftp = client.open_sftp()
        for local, remote in PAIRS:
            expected = local.read_bytes()
            live = sftp.open(remote).read()
            if digest(expected) != digest(live):
                raise SystemExit(f"Refusing restart: {remote} does not match built output")
            print("HASH_OK", remote, digest(live)[:16])
        sftp.close()

        verify_cmd = (
            f"grep -c 'personnel-attendance/check-in' {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -c \"app.delete('/personnel-leaves/:id'\" {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -c 'leave_flags' {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -c 'AGFIX116' {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -c 'hour === 24' {BACKEND_DIR}/attendanceScan.js; "
            f"grep -o 'index-AGFIX[0-9]*\\.js' {FRONTEND_DIR}/index.html | head -n 1"
        )
        rc, out, err = run_remote(client, verify_cmd, timeout=30)
        lines = [line.strip() for line in out.strip().splitlines() if line.strip()]
        if rc != 0 or lines[:5] != ["1", "1", "1", "1", "1"] or lines[-1:] != [ASSET]:
            raise SystemExit(f"Verify failed: rc={rc}, lines={lines!r}, err={err!r}")
        print("LIVE_ASSERTIONS_OK", lines[:5], lines[-1])

        pm2_cmd = (
            "env PATH=/usr/local/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin "
            + PM2_BIN + " restart alphagym-api"
        )
        rc, out, err = run_remote(client, pm2_cmd, sudo=True,
                                  sudo_password=cfg.sudo_password, timeout=90)
        if rc != 0:
            raise SystemExit(f"pm2 restart failed: rc={rc}, out={out[:2000]}, err={err[:2000]}")
        print("PM2_RESTART_OK")
        print("FINALIZE_OK", ASSET)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
