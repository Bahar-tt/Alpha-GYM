---
description: Run a read-only SQL query against the live DB
---

Run a read-only SQL query for: $ARGUMENTS

Use `py -3 scripts\db_query.py --sql "..."`. Only SELECT/WITH/read-only PRAGMA/EXPLAIN are allowed. Mask phone/national_id unless explicitly asked otherwise. Never modify rows. Show exact SQL and rows.
