"""Read-only: simulate the AGFIX133 pending-queue filter over real renewals."""

from __future__ import annotations

from common import DB_PATH, RemoteConfig, connect, run_remote_python

PROBE = f'''
import json, sqlite3
db = sqlite3.connect("file:{DB_PATH}?mode=ro", uri=True)
db.row_factory = sqlite3.Row
def rows(sql, args=()):
    return [dict(r) for r in db.execute(sql, args).fetchall()]

ren = rows("SELECT r.id, r.member_id, r.status, r.created_at, r.new_end_date, m.name, m.member_code FROM renewals r LEFT JOIN members m ON m.id=r.member_id WHERE r.created_at >= '2026-11-24' ORDER BY r.id DESC")
# replicate frontend: C = Set(d.map(String)) + Set(renewals.completed member_id as String)
C = set()
for g in ren:
    if (not g["status"] or g["status"] == "completed") and g["member_id"] is not None:
        C.add(str(g["member_id"]))
pending = [g for g in ren if str(g["member_id"]) not in C]
print(json.dumps({{
  "recent_renewals": len(ren),
  "sample": [{{k: g[k] for k in ("member_id","member_code","name","status","new_end_date","created_at")}} for g in ren[:12]],
  "still_pending_after_fix": pending,
}}, ensure_ascii=False, default=str, indent=2))
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
