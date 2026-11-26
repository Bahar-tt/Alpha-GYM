---
description: Prepare a reviewed DB change with mandatory backup and confirmation
---

Prepare a safe DB change for: $ARGUMENTS

First diagnose read-only. Then copy `templates\db_change.py` into `changes\`, add exact identity assertions, targeted updates, `ROWCOUNT`, `FINAL_COUNTS`, `PRAGMA integrity_check`, `COMMITTED`, and `ROLLBACK`. Run `py -3 scripts\verify_repo.py`. Explain the change and wait for explicit user confirmation before running `py -3 scripts\apply_change.py --confirm "APPLY <reason>"`. Never apply without confirmation.
