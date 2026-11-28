"""Read-only: dry count of members flagged by the AGFIX136 info rules."""

from __future__ import annotations

from common import DB_PATH, RemoteConfig, connect, run_remote_python

PROBE = f'''
import json, sqlite3
db = sqlite3.connect("file:{DB_PATH}?mode=ro", uri=True)
row = db.execute("""
SELECT COUNT(*) FROM members m WHERE
  TRIM(COALESCE(m.phone,''))='' OR TRIM(COALESCE(m.phone,''))='0'
  OR TRIM(COALESCE(m.phone,''))=TRIM(COALESCE(m.member_code,''))
  OR NOT (TRIM(COALESCE(m.phone,'')) GLOB '09[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
       OR TRIM(COALESCE(m.phone,'')) GLOB '0[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')
  OR TRIM(COALESCE(m.birthday,''))='' OR TRIM(COALESCE(m.birthday,''))='0'
  OR (TRIM(COALESCE(m.birthday,'')) LIKE '%/%' AND
      (CAST(substr(TRIM(m.birthday),1,instr(TRIM(m.birthday),'/')-1) AS INTEGER) < 1335
       OR CAST(substr(TRIM(m.birthday),1,instr(TRIM(m.birthday),'/')-1) AS INTEGER) > 1399))
""").fetchone()[0]
print(json.dumps({{"flagged_members": row}}))
'''


def main() -> int:
    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        rc, out, err = run_remote_python(client, PROBE, timeout=60)
        print(out.strip() or err.strip())
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
