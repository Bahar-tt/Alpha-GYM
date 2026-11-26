---
description: Check VPS health, pm2, API, frontend asset and DB integrity
---

Run `py -3 scripts\health_check.py` and summarize $ARGUMENTS. Treat HTTP 401 on /api/members as a live service requiring auth, not a crash. Treat old SQLITE_ERROR log lines without fresh timestamp as historical. Report exact outputs, not assumptions.
