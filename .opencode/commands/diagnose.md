---
description: Read-only diagnosis of Alpha GYM backend/scanner/DB
---

Diagnose: $ARGUMENTS

Use only read-first tools in this repo. Run `py -3 scripts\health_check.py`, then `py -3 scripts\snapshot_backend.py`, then targeted `py -3 scripts\db_query.py --sql "..."` queries. Do not write DB/code/frontend/club-PC files. Collect file:line and SQL evidence, rank hypotheses, explain why alternatives were rejected, and propose the smallest safe fix without applying it. Reply in Persian with a warm tone.
