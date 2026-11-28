"""Read-only personnel/enrollment diagnostic after AGFIX127.

Never writes: only pm2 logs, sha256sum and a mode=ro SQLite query.
"""

from __future__ import annotations

import json

from common import BACKEND_DIR, DB_PATH, FRONTEND_DIR, PM2_BIN, RemoteConfig, connect, run_remote, run_remote_python

DB_PROBE = f'''
import json, sqlite3
db = sqlite3.connect("file:{DB_PATH}?mode=ro", uri=True)
db.row_factory = sqlite3.Row
def rows(sql):
    return [dict(r) for r in db.execute(sql).fetchall()]
out = {{
    "personnel_last": rows("SELECT id,full_name,fingerprint_id,is_active FROM personnel ORDER BY id DESC LIMIT 8"),
    "enroll_personnel": rows("SELECT id,personnel_id,member_id,foh_member_id,status,note,created_at,completed_at FROM credential_enrollments WHERE personnel_id>0 ORDER BY id DESC LIMIT 12"),
    "failed_events": rows("SELECT id,member_id,status,message,created_at FROM scan_events WHERE status='enroll_failed' ORDER BY id DESC LIMIT 8"),
    "pending": rows("SELECT id,personnel_id,member_id,foh_member_id,expires_at FROM credential_enrollments WHERE status='pending' ORDER BY id DESC LIMIT 8"),
}}
print(json.dumps(out, ensure_ascii=False, default=str))
'''


def main() -> int:
    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        rc, out, err = run_remote_python(client, DB_PROBE, timeout=60)
        print("DB_PROBE rc=", rc)
        print(out.strip() or err.strip())

        hashes = (
            f"sha256sum {BACKEND_DIR}/server.js {BACKEND_DIR}/personnelAttendance.js "
            f"{BACKEND_DIR}/attendanceScan.js {BACKEND_DIR}/userApiGuards.js "
            f"{FRONTEND_DIR}/index.html"
        )
        rc, out, err = run_remote(client, hashes, timeout=30)
        print("HASHES rc=", rc)
        print(out.strip() or err.strip())

        logs = (
            "env PATH=/usr/local/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin "
            + PM2_BIN + " logs alphagym-api --lines 150 --nostream 2>&1 | tail -n 150"
        )
        rc, out, err = run_remote(client, logs, timeout=60)
        print("PM2_LOGS rc=", rc)
        print((out.strip() or err.strip())[-12000:])
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
