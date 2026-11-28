"""Verify already-copied AGFIX127 files, restart pm2, and report health.

Run after deploy_user_api_guards_agfix127.py reached COPY_OK but stopped before
the verification/restart step. Read-only on the DB; no files are copied here.
"""

from __future__ import annotations

import shlex

from common import BACKEND_DIR, FRONTEND_DIR, PM2_BIN, RemoteConfig, connect, run_remote

CHECKS = (
    ("members_get", f"grep -Fc \"app.get('/members/:id', requireAuth\" {BACKEND_DIR}/server.js", "1"),
    ("member_dup", f"grep -Fc 'MEMBER_CODE_DUPLICATE' {BACKEND_DIR}/server.js", "1"),
    ("personnel_get", f"grep -Fc \"app.get('/personnel/:id', requireAuth\" {BACKEND_DIR}/personnelAttendance.js", "1"),
    ("personnel_invalid", f"grep -Fc 'INVALID_PERSONNEL_ID' {BACKEND_DIR}/personnelAttendance.js", "1"),
    ("enroll_guard", f"grep -Fc 'decideEnrollFailure(row, utcNow)' {BACKEND_DIR}/attendanceScan.js", "1"),
    ("agent_member_status", f"grep -Fc 'res.status(created ? 201 : 200).json' {BACKEND_DIR}/attendanceScan.js", "1"),
    ("guard_exports", f"grep -Fc 'module.exports' {BACKEND_DIR}/userApiGuards.js", "1"),
    ("frontend_ref", f"grep -oE \"index-AGFIX[0-9]+\\.js\" {FRONTEND_DIR}/index.html | head -n 1", "index-AGFIX125.js"),
)


def main() -> int:
    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        for label, command, expected in CHECKS:
            rc, out, err = run_remote(client, "sh -c " + shlex.quote(command), timeout=30)
            got = out.strip().splitlines()[0].strip() if out.strip() else ""
            if rc != 0 or got != expected:
                raise SystemExit(
                    f"CHECK_FAILED {label}: rc={rc}, got={got!r}, expected={expected!r}, err={err[:1000]!r}"
                )
            print("CHECK_OK", label, got)

        pm2_cmd = (
            "env PATH=/usr/local/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin "
            + PM2_BIN + " restart alphagym-api"
        )
        rc, out, err = run_remote(
            client, pm2_cmd, sudo=True, sudo_password=cfg.sudo_password, timeout=90
        )
        if rc != 0:
            raise SystemExit(f"PM2_RESTART_FAILED: rc={rc}, out={out[:1500]!r}, err={err[:1500]!r}")
        print("PM2_RESTART_OK")
        print("FINALIZE_OK AGFIX127 backend-only", "index-AGFIX125.js")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
