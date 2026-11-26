---
description: Verify no secrets/data leaked into Git and scripts compile
---

Run `py -3 scripts\verify_repo.py` and fix only safe issues in this repo. Report any blocked filename, hardcoded credential pattern, or script syntax error. Do not add `.env`, DB files, backups, agent key/config, or AnyDesk credentials.
