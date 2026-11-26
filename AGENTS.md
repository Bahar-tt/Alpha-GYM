# Alpha GYM Ops — project instructions

This repository is an **ops/review repo**, not the full production project. Never copy the live DB, backups, secrets, or club-PC agent files into Git.

## Default posture

1. Start read-only. Use `scripts/health_check.py`, `scripts/snapshot_backend.py`, and `scripts/db_query.py` before proposing any change.
2. Never write to the DB, backend code, frontend assets, or club-PC files unless the user explicitly asks and confirms.
3. If asked to change DB: make a fresh SQLite backup with `scripts/make_backup.py`, then use a reviewed script under `changes/`.
4. If asked to change backend code: back up the target file first, patch minimally, verify with grep, restart `alphagym-api` only after verification.
5. Report evidence before opinion: file:line, SQL row, HTTP status, or exact output. Then rank hypotheses and propose the smallest safe fix.
6. Reply in Persian, warm tone («عزیزم» / «عزیزکم»). Women-only context.

## Forbidden

- Do not commit or print: `.env`, `agent.config.json`, `agent_key`/`AGENT_KEY`, AnyDesk credentials, passwords, tokens, `*.db`, `*.bak*`, raw logs.
- Do not touch the club-PC package at `C:\alpha-gym-module-native\` unless explicitly asked; it is READ-ONLY by default.
- Do not rename columns/tables broadly, change fingerprints, or update dates/sessions without a validated member/sport mapping.
- Do not trust numeric fingerprint values as `members.id`. The scanner fix removed the numeric DB-id fallback in `resolveMember`.
- Do not use the old «قبلاً کامل ثبت شده است» full-cycle guard. A completed check-in/check-out cycle must not block a second sport; keep only the same-direction duplicate guard.
- Do not overwrite a newer `index.html` asset reference blindly. Live frontend was AGFIX98 at last check; re-read `index.html` before deploy.

## Approved sources and paths

- Approved historical DB source: `D:\opencode-work\rar-extract\Bk_140508220528.bak`.
- Ignore Men UFS/backup files and any unrelated backup.
- Live DB: `/var/www/alphagym/backend/gym.db`.
- Scanner backend: `/var/www/alphagym/backend/attendanceScan.js` (contains AGFIX100 resolveMember guard and AGFIX101 dual-sport guard).
- Frontend entry: `/var/www/alphagym/frontend/index.html`.
- pm2 service: `alphagym-api`; executable `/usr/local/node/bin/pm2`.
- `401` on `http://127.0.0.1:3001/api/members` means the API is alive but auth is required; it is not a crash.
- The SQLITE_ERROR tail in `/root/.pm2/logs/alphagym-api-error.log` dated 2026-11-23 is old; do not treat it as a fresh regression without new evidence.

## Domain rules

- Roles: `admin`, `staff`, `coach`. Coach cannot freeze/accounting/manual check-in. Secretary/staff has manager-like options except reports, manual personnel attendance correction/details, and payslip issuance. Real admin only when `String(role) === 'admin'`.
- SMS sections all available to staff/secretary.
- UI: Jalali dates everywhere; dark dropdown/options; modals/calendars fully visible; Jalali quick-renew picker without writing «جلالی» in box labels.
- Dual-sport check-in modal: top «ورود», bottom «خروج». Exit box shows نام، رشته، ساعت ورود، ساعت خروج، جلسات باقیمانده.
- Manual member check-in/out: `admin`/`staff` only. Operator recorded in `scan_events.message` as `(ثبت دستی: ...)`. Manual search accepts name/code/phone. Quick renew only when subscription ends same day or sessions are exhausted. Scanner quick manual checkout uses a small confirm dialog.
- `national_id` optional; if present, validate format and uniqueness.
- Bodybuilding packages: 8/16/24. Coaches: رها خدابنده لو / فاطمه طباطبایی. Raha diet 1,000,000 with 60/40 share. Private tuition includes training program. Registration enforces private/sport constraints for انسیه/مریم/رها.
- Personnel: fingerprint attendance; monthly delay total deducted proportionally from salary; leave entitlement 2 days/month; over-entitlement deducted from requester and added to replacement.
- Discount codes: `AG-XXXXX`; visible to admin/secretary; percent/fixed; single-use; applies to whole invoice except insurance; log usage in registration/renewal.
- Contradiction report: rows 1–71 approved for correction; all remaining rows keep current DB info.

## DB write protocol

Every DB-changing script must:

- create a fresh backup via SQLite backup API before `BEGIN`;
- assert exact identity/counter state before updating;
- use targeted `WHERE` clauses, never broad updates;
- print `ROWCOUNT`, `FINAL_COUNTS`, `INTEGRITY ok`, and `COMMITTED`;
- `ROLLBACK` on any exception;
- be reviewed by a human before `scripts/apply_change.py --confirm "APPLY ..."` is run.

## Script rules

- `remote_run.py` blocks dangerous commands unless `--allow-write --confirm WRITE` is passed.
- `db_query.py` allows only `SELECT`, `WITH`, `PRAGMA integrity_check/table_info/foreign_key_check/quick_check`, and `EXPLAIN`; it opens the DB with `mode=ro`.
- `snapshot_backend.py` fetches only allowlisted source files and schema SQL; it skips DB/backups/logs/secrets and redacts output.
- `verify_repo.py` must pass before commit.

## Useful commands

```powershell
py -3 scripts\verify_repo.py
py -3 scripts\health_check.py
py -3 scripts\snapshot_backend.py
py -3 scripts\db_query.py --sql "select 1"
py -3 scripts\make_backup.py --reason diag --persist --confirm BACKUP
```
