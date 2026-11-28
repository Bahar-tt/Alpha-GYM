"""Read-only: inspect مریم موسوی renewal state and why she stays in pending list."""

from __future__ import annotations

from common import DB_PATH, RemoteConfig, connect, run_remote_python

PROBE = f'''
import json, sqlite3
db = sqlite3.connect("file:{DB_PATH}?mode=ro", uri=True)
db.row_factory = sqlite3.Row
def rows(sql, args=()):
    return [dict(r) for r in db.execute(sql, args).fetchall()]
def one(sql, args=()):
    r = db.execute(sql, args).fetchone()
    return dict(r) if r else None

out = {{}}
out["matches"] = rows("SELECT id,name,member_code,used_sessions,total_sessions,start_date,expiry_date FROM members WHERE name LIKE ?", ("%مریم%موسوی%",))
for m in out["matches"]:
    mid = m["id"]
    m["sports"] = rows("SELECT id,sport,used_sessions,total_sessions,start_date,expiry_date FROM member_sports WHERE member_id=? ORDER BY id", (mid,))
    m["renewals"] = rows("SELECT id,sport_id,membership_type,old_end_date,new_end_date,amount,status,renewed_by,created_at FROM renewals WHERE member_id=? ORDER BY id DESC LIMIT 10", (mid,))
    m["payments"] = rows("SELECT id,type,amount,method,created_at,note FROM payments WHERE member_id=? ORDER BY id DESC LIMIT 10", (mid,))
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
