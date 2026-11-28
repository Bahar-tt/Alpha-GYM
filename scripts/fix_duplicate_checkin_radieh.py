"""Delete one mistaken check-in pair for راضیه محبی (member_code 696).

Removes attendance ids 1606 (check_out 10:18:54) and 1607 (check_in 10:19:02),
keeps the legitimate check-in 1600 (09:12:58), and decrements used_sessions by 1.
Fresh DB backup is created before the transaction; scan_events audit rows stay.
"""

from __future__ import annotations

import argparse
import json

from common import DB_PATH, RemoteConfig, connect, run_remote_python
from make_backup import create_backup


PAYLOAD = f'''
import json, sqlite3, sys

DB = "{DB_PATH}"
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row

def one(sql, args=()):
    r = con.execute(sql, args).fetchone()
    return dict(r) if r else None

def rows(sql, args=()):
    return [dict(r) for r in con.execute(sql, args).fetchall()]

def counts():
    return one("SELECT (SELECT COUNT(*) FROM members) members,(SELECT COUNT(*) FROM member_sports) member_sports,(SELECT COUNT(*) FROM attendances) attendances,(SELECT COUNT(*) FROM scan_events) scan_events,(SELECT COUNT(*) FROM sport_scan_pending) sport_scan_pending")

member = one("SELECT id,name,member_code,used_sessions,total_sessions FROM members WHERE id=?", (1991,))
assert member == {{"id":1991,"name":"راضیه محبی","member_code":"696","used_sessions":11,"total_sessions":12}}, member
sports = rows("SELECT id,sport,used_sessions,total_sessions FROM member_sports WHERE member_id=? ORDER BY id", (1991,))
assert len(sports) == 1 and sports[0]["id"] == 3912 and sports[0]["sport"] == "بدنسازی" and sports[0]["used_sessions"] == 11, sports
day = rows("SELECT id,direction,attended_at,sport FROM attendances WHERE member_id=? AND substr(attended_at,1,10)=? ORDER BY id", (1991, "2026-11-28"))
expected_day = [
  {{"id":1600,"direction":"check_in","attended_at":"2026-11-28 09:12:58","sport":"بدنسازی"}},
  {{"id":1606,"direction":"check_out","attended_at":"2026-11-28 10:18:54","sport":"بدنسازی"}},
  {{"id":1607,"direction":"check_in","attended_at":"2026-11-28 10:19:02","sport":"بدنسازی"}},
]
assert day == expected_day, day
assert one("SELECT COUNT(*) n FROM attendances WHERE id IN (1606,1607)")["n"] == 2
assert one("SELECT COUNT(*) n FROM attendances WHERE id=1854")["n"] == 0

before = counts()
dry = dict(before)
dry["attendances"] = before["attendances"] - 2
print("DRY_DIFF", json.dumps({{"before":before,"after":dry,"delete_ids":[1606,1607],"used_before":11,"used_after":10}}, ensure_ascii=False))

con.execute("BEGIN IMMEDIATE")
try:
    cur = con.execute("DELETE FROM attendances WHERE id IN (?,?) AND member_id=?", (1606, 1607, 1991))
    assert cur.rowcount == 2, cur.rowcount
    cur = con.execute("UPDATE member_sports SET used_sessions=used_sessions-1 WHERE id=? AND member_id=? AND used_sessions=11", (3912, 1991))
    assert cur.rowcount == 1, cur.rowcount
    cur = con.execute("UPDATE members SET used_sessions=used_sessions-1 WHERE id=? AND member_code=? AND used_sessions=11", (1991, "696"))
    assert cur.rowcount == 1, cur.rowcount
    con.commit()
except Exception:
    con.rollback()
    raise

after = counts()
assert after == dry, {{"expected":dry,"actual":after}}
final_day = rows("SELECT id,direction,attended_at,sport FROM attendances WHERE member_id=? AND substr(attended_at,1,10)=? ORDER BY id", (1991, "2026-11-28"))
assert len(final_day) == 1 and final_day[0]["id"] == 1600 and final_day[0]["direction"] == "check_in", final_day
assert one("SELECT used_sessions FROM member_sports WHERE id=?", (3912,))["used_sessions"] == 10
assert one("SELECT used_sessions FROM members WHERE id=?", (1991,))["used_sessions"] == 10
assert one("SELECT integrity_check FROM pragma_integrity_check")["integrity_check"] == "ok"
print("FINAL_COUNTS", json.dumps(after, ensure_ascii=False))
print("FINAL_DAY", json.dumps(final_day, ensure_ascii=False))
print("APPLY_OK duplicate_checkin_radieh")
con.close()
'''


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm", help="Must be exactly APPLY_DUPLICATE_FIX")
    args = parser.parse_args()
    if args.confirm != "APPLY_DUPLICATE_FIX":
        raise SystemExit("--confirm APPLY_DUPLICATE_FIX is required")

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        backup = create_backup(
            client, "duplicate-radieh-agfix129", persist=True,
            sudo_password=cfg.sudo_password, timeout=120,
        )
        print("BACKUP", json.dumps(backup, ensure_ascii=False))
        rc, out, err = run_remote_python(
            client, PAYLOAD, sudo=True, sudo_password=cfg.sudo_password, timeout=120,
        )
    finally:
        client.close()
    print("OUT", out.strip())
    if err.strip():
        print("ERR", err.strip()[:2000])
    if rc != 0 or "APPLY_OK duplicate_checkin_radieh" not in out:
        raise SystemExit(f"Duplicate fix failed: rc={rc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
