"""Read-only: birthday/phone format survey + dry count of members needing info."""

from __future__ import annotations

from common import DB_PATH, RemoteConfig, connect, run_remote_python

PROBE = f'''
import json, re, sqlite3
db = sqlite3.connect("file:{DB_PATH}?mode=ro", uri=True)
db.row_factory = sqlite3.Row
def rows(sql, args=()):
    return [dict(r) for r in db.execute(sql, args).fetchall()]

bday = rows("SELECT CASE WHEN birthday IS NULL OR trim(birthday)='' THEN 'EMPTY' WHEN trim(birthday)='0' THEN 'ZERO' WHEN trim(birthday) GLOB '[0-9][0-9]' THEN 'TWO_DIGIT' WHEN trim(birthday) GLOB '[0-9]' THEN 'ONE_DIGIT' WHEN trim(birthday) GLOB '[0-9][0-9][0-9]' THEN 'THREE_DIGIT' WHEN trim(birthday) GLOB '[0-9][0-9][0-9][0-9]' THEN 'FOUR_DIGIT' WHEN trim(birthday) LIKE '%/%' OR trim(birthday) LIKE '%-%' THEN 'DATE' ELSE 'OTHER' END k, COUNT(*) n FROM members GROUP BY k ORDER BY n DESC")
two = rows("SELECT id,name,member_code,birthday,phone FROM members WHERE trim(birthday) GLOB '[0-9][0-9]' OR trim(birthday) GLOB '[0-9]' OR trim(birthday)='0' LIMIT 40")
four = rows("SELECT birthday, COUNT(*) n FROM members WHERE trim(birthday) GLOB '[0-9][0-9][0-9][0-9]' GROUP BY trim(birthday) ORDER BY n DESC LIMIT 15")
date_like = rows("SELECT birthday, COUNT(*) n FROM members WHERE trim(birthday) LIKE '%/%' OR trim(birthday) LIKE '%-%' GROUP BY trim(birthday) ORDER BY n DESC LIMIT 15")
phone = rows("SELECT CASE WHEN phone IS NULL OR trim(phone)='' THEN 'EMPTY' WHEN trim(phone)=(SELECT member_code FROM members m2 WHERE m2.id=members.id) THEN 'SAME_AS_CODE' WHEN trim(phone) GLOB '09[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' THEN 'MOBILE_OK' WHEN trim(phone) GLOB '0[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' THEN 'LANDLINE_OK' ELSE 'BAD_FORMAT' END k, COUNT(*) n FROM members GROUP BY k ORDER BY n DESC")
bad_phone = rows("SELECT id,name,member_code,phone FROM members WHERE NOT (trim(phone) GLOB '09[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' OR trim(phone) GLOB '0[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]') LIMIT 30")
print(json.dumps({{"bday_kinds": bday, "two_digit_samples": two, "four_digit_years": four, "date_like": date_like, "phone_kinds": phone, "bad_phone_samples": bad_phone}}, ensure_ascii=False, default=str, indent=2))
'''


def main() -> int:
    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        rc, out, err = run_remote_python(client, PROBE, timeout=90)
        print("rc=", rc)
        print(out.strip() or err.strip())
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
