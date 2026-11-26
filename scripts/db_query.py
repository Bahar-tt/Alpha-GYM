"""Read-only SQL runner for the live SQLite DB.

Only SELECT / WITH / EXPLAIN / read-only PRAGMA are accepted. The remote
connection opens the DB with `mode=ro`, so writes fail even if validation misses.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
from pathlib import Path

from common import (
    DB_PATH,
    RemoteConfig,
    connect,
    print_block,
    redact_row,
    run_remote_python,
)

ALLOWED_START = re.compile(r"^\s*(select|with|explain)\b", re.IGNORECASE)
ALLOWED_PRAGMA = re.compile(
    r"^\s*pragma\s+(integrity_check|quick_check|foreign_key_check|table_info|table_xinfo|index_list)\s*(?:\([^)]*\))?\s*;?\s*$",
    re.IGNORECASE,
)
DENY_WORDS = re.compile(
    r"\b(insert|update|delete|replace|create|drop|alter|attach|detach|vacuum|reindex|begin|commit|rollback|savepoint|release)\b",
    re.IGNORECASE,
)


def validate_sql(sql: str) -> None:
    if not sql.strip():
        raise SystemExit("Empty SQL.")
    if re.search(r";\s*\S", sql):
        raise SystemExit("Only one SQL statement is allowed.")
    if DENY_WORDS.search(sql):
        raise SystemExit("Write/DDL/transaction keywords are not allowed in db_query.py.")
    if not (ALLOWED_START.match(sql) or ALLOWED_PRAGMA.match(sql)):
        raise SystemExit("Only SELECT, WITH, EXPLAIN, and read-only PRAGMA are allowed.")


def remote_payload(sql_b64: str, limit: int) -> str:
    return f'''import base64, json, sqlite3
sql = base64.b64decode("{sql_b64}").decode("utf-8")
limit = {limit}
con = sqlite3.connect("file:{DB_PATH}?mode=ro", uri=True)
con.row_factory = sqlite3.Row
cur = con.execute(sql)
columns = [d[0] for d in cur.description] if cur.description else []
rows = [dict(r) for r in cur.fetchmany(limit + 1)]
result = {{
    "columns": columns,
    "rows": rows[:limit],
    "count": len(rows[:limit]),
    "truncated": len(rows) > limit,
}}
print(json.dumps(result, ensure_ascii=False, default=str))
con.close()
'''


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only SQL query")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--sql", help="SQL text")
    source.add_argument("--file", help="Local file containing SQL")
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--no-redact", action="store_true", help="Do not mask phone/national_id")
    args = parser.parse_args()

    if args.limit < 1 or args.limit > 1000:
        raise SystemExit("--limit must be between 1 and 1000")

    sql = Path(args.file).read_text(encoding="utf-8") if args.file else args.sql
    validate_sql(sql)
    encoded = base64.b64encode(sql.encode("utf-8")).decode("ascii")

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        rc, out, err = run_remote_python(client, remote_payload(encoded, args.limit), timeout=60)
    finally:
        client.close()

    if rc != 0:
        print_block("SQL_FAILED", out, err, rc)
        return rc

    try:
        data = json.loads(out.strip().splitlines()[-1])
    except Exception:
        print_block("SQL_OUTPUT", out, err, rc)
        return 1

    if not args.no_redact:
        data["rows"] = [redact_row(row) for row in data.get("rows", [])]

    print(json.dumps(data, ensure_ascii=False, indent=2, default=str))
    if err.strip():
        print_block("STDERR", "", err)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
