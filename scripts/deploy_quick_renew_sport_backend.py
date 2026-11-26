"""Deploy backend support for adding/changing a sport in quick renewal."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from common import (
    BACKEND_DIR,
    PM2_BIN,
    RemoteConfig,
    connect,
    run_remote,
    stamp,
    upload,
)
from make_backup import create_backup

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "local" / "live-attendanceScan.js"
OUTPUT = ROOT / "local" / "attendanceScan.agfix110.js"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"BACKEND_PATCH_ASSERT failed for {label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)


def build_source() -> str:
    text = SOURCE.read_bytes().decode("utf-8").replace("\r\n", "\n")

    text = replace_once(
        text,
        "      const sportId = Number(b.sport_id || b.member_sport_id || 0);\n",
        "      const sportId = Number(b.sport_id || b.member_sport_id || 0);\n"
        "      const addNew = b.add_new_sport === true || b.add_new_sport === 1 || b.add_new_sport === 'true';\n",
        "addNew flag",
    )

    text = replace_once(
        text,
        "      if (!sports.length) return res.status(400).json({ ok: false, error: 'رشته‌ای برای این عضو ثبت نشده است' });\n",
        "      if (!sports.length && !addNew) return res.status(400).json({ ok: false, error: 'رشته‌ای برای این عضو ثبت نشده است' });\n",
        "allow empty sports for addNew",
    )

    text = replace_once(
        text,
        "      let target = null;\n"
        "      if (sportId) target = sports.find((s) => Number(s.id) === sportId) || null;\n"
        "      if (!target && b.sport) target = sports.find((s) => String(s.sport || '').trim() === String(b.sport || '').trim()) || null;\n"
        "      if (!target) target = sports[0];\n",
        "      let target = null;\n"
        "      if (!addNew && sportId) target = sports.find((s) => Number(s.id) === sportId) || null;\n"
        "      if (!target && !addNew && b.sport) target = sports.find((s) => String(s.sport || '').trim() === String(b.sport || '').trim()) || null;\n"
        "      if (!target && !addNew) target = sports[0];\n"
        "      const newSportName = addNew ? String(b.sport || '').trim() : '';\n"
        "      if (addNew && !newSportName) return res.status(400).json({ ok: false, error: 'نام رشته جدید الزامی است' });\n",
        "target selection",
    )

    text = replace_once(
        text,
        "      const startDate = String(b.start_date || target.start_date || todayIso()).trim();\n",
        "      const startDate = String(b.start_date || (target && target.start_date) || todayIso()).trim();\n",
        "nullable target start",
    )

    text = replace_once(
        text,
        "      const totalSessions = Math.max(0, Number(b.total_sessions != null ? b.total_sessions : target.total_sessions) || 0);\n",
        "      const totalSessions = Math.max(0, Number(b.total_sessions != null ? b.total_sessions : (target && target.total_sessions)) || 0);\n",
        "nullable target sessions",
    )

    text = replace_once(
        text,
        "      const oldEnd = target.expiry_date || member.expiry_date || null;\n",
        "      const oldEnd = (target && target.expiry_date) || member.expiry_date || null;\n",
        "nullable target old end",
    )

    old_update = (
        "      const tx = db.transaction(() => {\n"
        "        db.prepare(`UPDATE member_sports SET start_date = ?, expiry_date = ?, total_sessions = ?, used_sessions = ?, class_type = ?, registration_type = ?, coach_name = ?, private_coach_id = ?, private_coach_name = ? WHERE id = ?`)\n"
        "          .run(startDate || null, expiryDate, totalSessions, usedSessions, regType, regType,\n"
        "            isPrivate ? (coachName || target.coach_name || null) : (target.coach_name || null),\n"
        "            null, isPrivate ? coachName : null, target.id);\n"
    )
    new_update = (
        "      const tx = db.transaction(() => {\n"
        "        if (!target) {\n"
        "          const ins = db.prepare(`INSERT INTO member_sports (member_id, sport, start_date, expiry_date, total_sessions, used_sessions, tuition_amount, unit_price, class_type, registration_type, coach_name, private_coach_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`)\n"
        "            .run(memberId, newSportName, startDate || null, expiryDate, totalSessions, usedSessions, amount, amount, regType, regType, coachName, isPrivate ? coachName : null);\n"
        "          target = db.prepare('SELECT * FROM member_sports WHERE id = ?').get(ins.lastInsertRowid);\n"
        "        }\n"
        "        db.prepare(`UPDATE member_sports SET sport = ?, start_date = ?, expiry_date = ?, total_sessions = ?, used_sessions = ?, class_type = ?, registration_type = ?, coach_name = ?, private_coach_id = ?, private_coach_name = ? WHERE id = ?`)\n"
        "          .run(String(b.sport || target.sport), startDate || null, expiryDate, totalSessions, usedSessions, regType, regType,\n"
        "            isPrivate ? (coachName || target.coach_name || null) : (target.coach_name || null),\n"
        "            null, isPrivate ? coachName : null, target.id);\n"
    )
    text = replace_once(text, old_update, new_update, "insert + update sport")

    return text


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm", help="Must be exactly WRITE")
    args = parser.parse_args()
    if args.confirm != "WRITE":
        raise SystemExit("--confirm WRITE is required")

    patched = build_source()
    OUTPUT.write_bytes(patched.encode("utf-8"))

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        sftp = client.open_sftp()
        live = sftp.open(BACKEND_DIR + "/attendanceScan.js").read().decode("utf-8")
        if live.replace("\r\n", "\n") != SOURCE.read_bytes().decode("utf-8").replace("\r\n", "\n"):
            raise SystemExit("Refusing deploy: live attendanceScan.js changed since snapshot")
        sftp.close()

        backup = create_backup(client, "quick-renew-sport-backend", persist=True,
                               sudo_password=cfg.sudo_password)
        print("BACKUP", json.dumps(backup, ensure_ascii=False))

        token = stamp()
        file_backup = f"/tmp/attendanceScan.js.bak-agfix110-{token}"
        rc, out, err = run_remote(
            client,
            f"cp -p {BACKEND_DIR}/attendanceScan.js {file_backup} && ls -l {file_backup}",
            sudo=True,
            sudo_password=cfg.sudo_password,
            timeout=30,
        )
        if rc != 0:
            raise SystemExit(f"File backup failed: rc={rc}, err={err[:1000]}")
        print("FILE_BACKUP_OK", out.strip())

        tmp = f"/tmp/attendanceScan.agfix110-{token}.js"
        upload(client, OUTPUT, tmp)
        rc, out, err = run_remote(client, f"node --check {tmp}", timeout=60)
        if rc != 0:
            raise SystemExit(f"Remote node --check failed: rc={rc}, out={out[:2000]}, err={err[:2000]}")
        print("REMOTE_NODE_CHECK_OK")

        rc, out, err = run_remote(
            client,
            f"cp {tmp} {BACKEND_DIR}/attendanceScan.js && grep -c 'add_new_sport' {BACKEND_DIR}/attendanceScan.js",
            sudo=True,
            sudo_password=cfg.sudo_password,
            timeout=30,
        )
        if rc != 0 or out.strip() != "1":
            raise SystemExit(f"Backend deploy verification failed: rc={rc}, out={out!r}, err={err[:1000]}")
        print("BACKEND_DEPLOY_OK")

        pm2_cmd = (
            "env PATH=/usr/local/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin "
            + PM2_BIN
            + " restart alphagym-api"
        )
        rc, out, err = run_remote(
            client,
            pm2_cmd,
            sudo=True,
            sudo_password=cfg.sudo_password,
            timeout=90,
        )
        if rc != 0:
            raise SystemExit(f"pm2 restart failed: rc={rc}, out={out[:2000]}, err={err[:2000]}")
        print("PM2_RESTART_OK", out.strip()[-500:])
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
