"""Read-only health/integrity check for Alpha GYM."""

from __future__ import annotations

import argparse
import json

from common import (
    API_CHECK_URL,
    DB_PATH,
    FRONTEND_DIR,
    PM2_BIN,
    RemoteConfig,
    connect,
    print_block,
    run_remote,
    run_remote_python,
)

COUNT_TABLES = (
    "members",
    "member_sports",
    "attendances",
    "scan_events",
    "devices",
    "member_credentials",
    "credential_enrollments",
    "unknown_scans",
    "sport_scan_pending",
)


def remote_payload() -> str:
    tables = json.dumps(COUNT_TABLES)
    return f'''import datetime, json, re, sqlite3, urllib.request
from pathlib import Path

result = {{"api": {{}}, "frontend": {{}}, "db": {{}}}}

try:
    with urllib.request.urlopen("{API_CHECK_URL}", timeout=5) as response:
        result["api"]["status"] = response.status
except Exception as exc:
    code = getattr(exc, "code", None)
    result["api"]["status"] = code if isinstance(code, int) else None
    result["api"]["note"] = ("auth required / alive" if code == 401 else type(exc).__name__)

try:
    html = Path("{FRONTEND_DIR}/index.html").read_text(encoding="utf-8", errors="replace")
    match = re.search(r"index-AGFIX\\d+\\.js", html)
    result["frontend"]["asset"] = match.group(0) if match else None
except Exception as exc:
    result["frontend"]["error"] = type(exc).__name__ + ": " + str(exc)

con = sqlite3.connect("file:{DB_PATH}?mode=ro", uri=True)
con.row_factory = sqlite3.Row
result["db"]["counts"] = {{}}
for table in {tables}:
    try:
        result["db"]["counts"][table] = con.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
    except Exception as exc:
        result["db"]["counts"][table] = {{"error": str(exc)}}

try:
    result["db"]["integrity_check"] = con.execute("PRAGMA integrity_check").fetchone()[0]
except Exception as exc:
    result["db"]["integrity_check"] = {{"error": str(exc)}}

try:
    result["db"]["foreign_key_violations"] = [dict(r) for r in con.execute("PRAGMA foreign_key_check").fetchmany(20)]
except Exception as exc:
    result["db"]["foreign_key_violations"] = {{"error": str(exc)}}

try:
    result["db"]["duplicate_national_id"] = con.execute(
        "SELECT COUNT(*) FROM (SELECT national_id FROM members WHERE national_id IS NOT NULL AND national_id <> '' GROUP BY national_id HAVING COUNT(*) > 1)"
    ).fetchone()[0]
except Exception as exc:
    result["db"]["duplicate_national_id"] = {{"error": str(exc)}}

try:
    result["db"]["duplicate_finger_values"] = [dict(r) for r in con.execute(
        "SELECT value, COUNT(*) AS n FROM member_credentials WHERE kind = 'finger' AND value IS NOT NULL AND value <> '' GROUP BY value HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 20"
    )]
except Exception as exc:
    result["db"]["duplicate_finger_values"] = {{"error": str(exc)}}

today = datetime.datetime.utcnow().strftime("%Y-%m-%d")
result["db"]["today_attendance"] = [dict(r) for r in con.execute(
    "SELECT sport, direction, COUNT(*) AS n FROM attendances WHERE substr(attended_at,1,10)=? GROUP BY sport, direction ORDER BY sport, direction",
    (today,),
)]
result["db"]["today"] = today

try:
    result["db"]["recent_scans"] = [dict(r) for r in con.execute(
        "SELECT id, member_id, status, duplicate, attendance_id, direction, sport, created_at FROM scan_events ORDER BY id DESC LIMIT 10"
    )]
except Exception as exc:
    result["db"]["recent_scans"] = {{"error": str(exc)}}

con.close()
print(json.dumps(result, ensure_ascii=False, default=str))
'''


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only Alpha GYM health check")
    parser.add_argument("--show-pm2", action="store_true", help="Include pm2 list line for alphagym-api")
    args = parser.parse_args()

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        rc, out, err = run_remote_python(client, remote_payload(), timeout=60)
        if rc != 0:
            print_block("DB_HEALTH_FAILED", out, err, rc)
            return rc
        data = json.loads(out.strip().splitlines()[-1])

        if args.show_pm2:
            pm2_cmd = (
                "env PATH=/usr/local/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin "
                + PM2_BIN
                + " list | grep alphagym-api || true"
            )
            prc, pout, perr = run_remote(
                client, pm2_cmd, sudo=True,
                sudo_password=cfg.sudo_password, timeout=30,
            )
            data["pm2"] = {"rc": prc, "output": pout.strip(), "stderr": perr.strip()}
    finally:
        client.close()

    print(json.dumps(data, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
