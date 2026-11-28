"""Read-only check-in duplicate diagnostic by member name (or member_code)."""

from __future__ import annotations

import argparse
import json

from common import DB_PATH, RemoteConfig, connect, run_remote_python


def make_probe(term: str, by_code: bool) -> str:
    clause = "member_code = ?" if by_code else "name LIKE ?"
    arg = json.dumps([term], ensure_ascii=False)
    return f'''
import json, sqlite3
db = sqlite3.connect("file:{DB_PATH}?mode=ro", uri=True)
db.row_factory = sqlite3.Row
def rows(sql, args=()):
    return [dict(r) for r in db.execute(sql, args).fetchall()]
out = {{}}
out["members"] = rows("SELECT id,name,member_code FROM members WHERE {clause} LIMIT 10", {arg})
ids = [r["id"] for r in out["members"]]
out["sports"] = rows("SELECT member_id,id,sport,start_date,expiry_date,total_sessions,used_sessions FROM member_sports WHERE member_id IN (%s) ORDER BY member_id,id" % ",".join("?" * len(ids)), ids) if ids else []
out["attendances"] = rows("SELECT id,member_id,member_code,sport,direction,attended_at,source,device_id,credential_kind FROM attendances WHERE member_id IN (%s) ORDER BY attended_at DESC,id DESC LIMIT 60" % ",".join("?" * len(ids)), ids) if ids else []
out["scans"] = rows("SELECT id,member_id,status,direction,sport,credential_value,device_id,created_at FROM scan_events WHERE member_id IN (%s) ORDER BY id DESC LIMIT 30" % ",".join("?" * len(ids)), ids) if ids else []
print(json.dumps(out, ensure_ascii=False, default=str))
'''


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="راضیه محبی")
    parser.add_argument("--code")
    args = parser.parse_args()
    term = args.code if args.code else f"%{args.name}%"
    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        rc, out, err = run_remote_python(client, make_probe(term, bool(args.code)), timeout=60)
        print("rc=", rc)
        print(out.strip() or err.strip())
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
