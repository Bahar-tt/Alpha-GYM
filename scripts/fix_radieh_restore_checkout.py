"""Restore راضیه محبی's legitimate check-out and leave exactly one session.

- Re-inserts attendance id 1606 (check_out 2026-11-28 10:18:54) exactly as it
  existed in the pre-delete backup; keeps 1600 check_in; keeps 1607 deleted.
- Sets used_sessions 10 -> 11 on members + member_sports so 12-11 = 1 remains.
- Fresh DB backup before the write; exact assertions; dry diff; integrity_check.
"""

from __future__ import annotations

import argparse
import json

from common import DB_PATH, RemoteConfig, connect, run_remote_python
from make_backup import create_backup

PAYLOAD = f'''
import json, sqlite3

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
assert member == {{"id":1991,"name":"راضیه محبی","member_code":"696","used_sessions":10,"total_sessions":12}}, member
sports = rows("SELECT id,sport,used_sessions,total_sessions FROM member_sports WHERE member_id=? ORDER BY id", (1991,))
assert len(sports) == 1 and sports[0] == {{"id":3912,"sport":"بدنسازی","used_sessions":10,"total_sessions":12}}, sports
day = rows("SELECT id,direction,attended_at,sport,source,device_id,credential_kind FROM attendances WHERE member_id=? AND substr(attended_at,1,10)=? ORDER BY id", (1991, "2026-11-28"))
expected_day_before = [
  {{"id":1600,"direction":"check_in","attended_at":"2026-11-28 09:12:58","sport":"بدنسازی","source":"scanner","device_id":"desktop-vakc25c-front-desk","credential_kind":"finger"}},
]
assert day == expected_day_before, day
assert one("SELECT COUNT(*) n FROM attendances WHERE id=1606")["n"] == 0
assert one("SELECT COUNT(*) n FROM attendances WHERE id=1607")["n"] == 0
assert one("SELECT COUNT(*) n FROM scan_events WHERE attendance_id=1606 AND direction='check_out'")["n"] == 1

row1606 = {{"id":1606,"member_id":1991,"member_code":"696","attended_at":"2026-11-28 10:18:54","source":"scanner","device_id":"desktop-vakc25c-front-desk","sport":"بدنسازی","credential_kind":"finger","direction":"check_out"}}

before = counts()
dry = dict(before)
dry["attendances"] = before["attendances"] + 1
print("DRY_DIFF", json.dumps({{"before":before,"after":dry,"insert_id":1606,"used_before":10,"used_after":11}}, ensure_ascii=False))

con.execute("BEGIN IMMEDIATE")
try:
    cur = con.execute(
        "INSERT INTO attendances (id,member_id,member_code,attended_at,source,device_id,sport,credential_kind,direction) VALUES (?,?,?,?,?,?,?,?,?)",
        (row1606["id"],row1606["member_id"],row1606["member_code"],row1606["attended_at"],row1606["source"],row1606["device_id"],row1606["sport"],row1606["credential_kind"],row1606["direction"]),
    )
    assert cur.rowcount == 1, cur.rowcount
    cur = con.execute("UPDATE member_sports SET used_sessions=used_sessions+1 WHERE id=? AND member_id=? AND used_sessions=10", (3912, 1991))
    assert cur.rowcount == 1, cur.rowcount
    cur = con.execute("UPDATE members SET used_sessions=used_sessions+1 WHERE id=? AND member_code=? AND used_sessions=10", (1991, "696"))
    assert cur.rowcount == 1, cur.rowcount
    con.commit()
except Exception:
    con.rollback()
    raise

after = counts()
assert after == dry, {{"expected":dry,"actual":after}}
restored = one("SELECT * FROM attendances WHERE id=?", (1606,))
assert restored == row1606, restored
final_day = rows("SELECT id,direction,attended_at,sport FROM attendances WHERE member_id=? AND substr(attended_at,1,10)=? ORDER BY id", (1991, "2026-11-28"))
expected_day_after = [
  {{"id":1600,"direction":"check_in","attended_at":"2026-11-28 09:12:58","sport":"بدنسازی"}},
  {{"id":1606,"direction":"check_out","attended_at":"2026-11-28 10:18:54","sport":"بدنسازی"}},
]
assert final_day == expected_day_after, final_day
assert one("SELECT used_sessions FROM member_sports WHERE id=?", (3912,))["used_sessions"] == 11
assert one("SELECT used_sessions FROM members WHERE id=?", (1991,))["used_sessions"] == 11
assert one("SELECT integrity_check FROM pragma_integrity_check")["integrity_check"] == "ok"
print("FINAL_COUNTS", json.dumps(after, ensure_ascii=False))
print("FINAL_DAY", json.dumps(final_day, ensure_ascii=False))
print("APPLY_OK radieh_restore_checkout")
con.close()
'''


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm", help="Must be exactly APPLY_RADIEH_RESTORE")
    args = parser.parse_args()
    if args.confirm != "APPLY_RADIEH_RESTORE":
        raise SystemExit("--confirm APPLY_RADIEH_RESTORE is required")

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        backup = create_backup(
            client, "radieh-restore-agfix130", persist=True,
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
    if rc != 0 or "APPLY_OK radieh_restore_checkout" not in out:
        raise SystemExit(f"Restore failed: rc={rc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
