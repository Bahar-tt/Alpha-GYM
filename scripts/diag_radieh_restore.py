"""Read-only: reconstruct deleted check-out 1606 from pre-delete backup + current state."""

from __future__ import annotations

from common import DB_PATH, RemoteConfig, connect, run_remote_python

BACKUP = DB_PATH + ".bak-agops-duplicate-radieh-agfix129-20261128105402"

PROBE = f'''
import json, sqlite3
cur = sqlite3.connect("file:{DB_PATH}?mode=ro", uri=True)
bak = sqlite3.connect("file:{BACKUP}?immutable=1", uri=True)
cur.row_factory = sqlite3.Row
bak.row_factory = sqlite3.Row
def rows(db, sql, args=()):
    return [dict(r) for r in db.execute(sql, args).fetchall()]
def one(db, sql, args=()):
    r = db.execute(sql, args).fetchone()
    return dict(r) if r else None

out = {{}}
out["schema"] = rows(cur, "PRAGMA table_info(attendances)")
out["current_member"] = one(cur, "SELECT id,name,member_code,used_sessions,total_sessions FROM members WHERE id=?", (1991,))
out["current_sport"] = rows(cur, "SELECT id,sport,used_sessions,total_sessions FROM member_sports WHERE member_id=? ORDER BY id", (1991,))
out["current_day"] = rows(cur, "SELECT * FROM attendances WHERE member_id=? AND substr(attended_at,1,10)=? ORDER BY id", (1991, "2026-11-28"))
out["backup_row_1606"] = one(bak, "SELECT * FROM attendances WHERE id=?", (1606,))
out["backup_row_1607"] = one(bak, "SELECT * FROM attendances WHERE id=?", (1607,))
out["backup_day"] = rows(bak, "SELECT id,direction,attended_at,sport,source,device_id,credential_kind FROM attendances WHERE member_id=? AND substr(attended_at,1,10)=? ORDER BY id", (1991, "2026-11-28"))
out["current_counts"] = one(cur, "SELECT (SELECT COUNT(*) FROM members) members,(SELECT COUNT(*) FROM member_sports) member_sports,(SELECT COUNT(*) FROM attendances) attendances,(SELECT COUNT(*) FROM scan_events) scan_events,(SELECT COUNT(*) FROM sport_scan_pending) sport_scan_pending")
out["orphan_scan_events"] = rows(cur, "SELECT id,attendance_id,status,direction,sport,created_at FROM scan_events WHERE attendance_id IN (1606,1607) ORDER BY id")
print(json.dumps(out, ensure_ascii=False, default=str, indent=2))
'''


def main() -> int:
    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        rc, out, err = run_remote_python(client, PROBE, timeout=60)
        print("rc=", rc)
        print(out.strip() or err.strip())
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
