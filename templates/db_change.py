"""Template for a reviewed DB change script.

Copy to changes/YYYYMMDD_reason.py and edit every PLACEHOLDER value.
apply_change.py will create AG_BACKUP_PATH before running this script.
This template is intentionally inert: its assertions will fail until edited.
"""

from __future__ import annotations

import json
import os
import sqlite3

DB = "/var/www/alphagym/backend/gym.db"
BACKUP = os.environ.get("AG_BACKUP_PATH")

if not BACKUP or not os.path.exists(BACKUP):
    raise SystemExit("AG_BACKUP_PATH is missing or does not exist on the server")

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
con.execute("BEGIN")

try:

    def one(sql, args=()):
        return con.execute(sql, args).fetchone()

    # --- PLACEHOLDER: exact identity/counter assertions before any write ---
    member = one("SELECT id, name, member_code, used_sessions FROM members WHERE id = ?", (0,))
    assert member is None, "PLACEHOLDER: replace with the exact expected member state"

    # --- PLACEHOLDER: targeted write; never use a broad UPDATE ---
    cur = con.execute(
        "UPDATE members SET used_sessions = used_sessions WHERE id = ? AND used_sessions = ?",
        (-1, -1),
    )
    assert cur.rowcount == 0, "PLACEHOLDER: expected rowcount must be exactly 1 after editing"
    print("ROWCOUNT", cur.rowcount)

    # --- PLACEHOLDER: final counts, printed exactly once ---
    final = {
        "target_member_rows": one("SELECT COUNT(*) AS n FROM members WHERE id = ?", (0,))["n"],
    }
    print("FINAL_COUNTS", json.dumps(final, ensure_ascii=False, default=str))

    integrity = con.execute("PRAGMA integrity_check").fetchone()[0]
    assert integrity == "ok", f"integrity_check failed: {integrity}"
    print("INTEGRITY ok")

    con.execute("COMMIT")
    print("COMMITTED")
except Exception:
    con.execute("ROLLBACK")
    print("ROLLED_BACK")
    raise
finally:
    con.close()
