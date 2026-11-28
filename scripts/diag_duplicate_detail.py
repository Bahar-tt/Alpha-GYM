"""Read-only detail + dry count diff for the 2026-11-28 duplicate check-in."""

from __future__ import annotations

import argparse
import json

from common import DB_PATH, RemoteConfig, connect, run_remote_python


MAKE_PROBE = f'''
import json, sqlite3
db = sqlite3.connect("file:{DB_PATH}?mode=ro", uri=True)
db.row_factory = sqlite3.Row
def one(sql, args=()):
    r = db.execute(sql, args).fetchone()
    return dict(r) if r else None
def rows(sql, args=()):
    return [dict(r) for r in db.execute(sql, args).fetchall()]
out = {{}}
out["member"] = one("SELECT id,name,member_code,used_sessions,total_sessions,start_date,expiry_date FROM members WHERE id=?", (1991,))
out["sports"] = rows("SELECT id,sport,used_sessions,total_sessions,start_date,expiry_date FROM member_sports WHERE member_id=? ORDER BY id", (1991,))
out["day_attendance"] = rows("SELECT id,sport,direction,attended_at,source,device_id,credential_kind FROM attendances WHERE member_id=? AND substr(attended_at,1,10)=? ORDER BY id", (1991, "2026-11-28"))
ids = [r["id"] for r in out["day_attendance"]]
out["scan_events"] = rows("SELECT id,attendance_id,status,direction,sport,message,created_at FROM scan_events WHERE member_id=? AND created_at LIKE ? ORDER BY id", (1991, "2026-11-28%"))
out["pending"] = rows("SELECT id,status,selected_sport,scan_time,created_at FROM sport_scan_pending WHERE member_id=? AND scan_date=? ORDER BY id", (1991, "2026-11-28"))
out["counts"] = one("SELECT (SELECT COUNT(*) FROM members) members,(SELECT COUNT(*) FROM member_sports) member_sports,(SELECT COUNT(*) FROM attendances) attendances,(SELECT COUNT(*) FROM scan_events) scan_events,(SELECT COUNT(*) FROM sport_scan_pending) sport_scan_pending")
out["delete_ids"] = [1606, 1607]
out["after_counts"] = {{**out["counts"], "attendances": out["counts"]["attendances"] - 2}}
out["after_used"] = {{
    "member_used_sessions": out["member"]["used_sessions"] - 1,
    "sport_used_sessions": out["sports"][0]["used_sessions"] - 1,
}}
print(json.dumps(out, ensure_ascii=False, default=str, indent=2))
'''


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.parse_args()
    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        rc, out, err = run_remote_python(client, MAKE_PROBE, timeout=60)
        print("rc=", rc)
        print(out.strip() or err.strip())
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
