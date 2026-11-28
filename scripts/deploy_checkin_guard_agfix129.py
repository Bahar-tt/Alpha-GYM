"""Deploy AGFIX129: same-day check-in guard for two-sport members only.

Backend-only change, built from the exact live AGFIX128 snapshots:
- userApiGuards.js: pure decideCheckInDuplicate() helper;
- attendanceScan.js: replaces the old "open check-in blocks all check-ins" rule
  with one-check-in-per-sport/day, allowing a second check-in only for a
  two-sport member, for a different sport, in a different hour.
Frontend is untouched.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shlex
import subprocess
from pathlib import Path

from common import BACKEND_DIR, FRONTEND_DIR, PM2_BIN, RemoteConfig, connect, run_remote, upload
from make_backup import create_backup

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / "local"

GUARD_SOURCE = ROOT / "backend" / "userApiGuards.js"
SCAN_BASE = LOCAL / "attendanceScan.agfix127.js"
GUARD_OUTPUT = LOCAL / "userApiGuards.agfix129.js"
SCAN_OUTPUT = LOCAL / "attendanceScan.agfix129.js"

ASSET = "index-AGFIX128.js"

EXPECTED = {
    "server.js": "5def9d0eb0856b1cb7e0311e836669fbd8542506a4d24dbf0840fde7c7d6e295",
    "personnelAttendance.js": "77ea7ebc25be29a2b36a0b0840fc8ed2d35b8bf0952138813c536b3b14d427dd",
    "attendanceScan.js": "bd54509a9f93186459bc0c4bc766feeeb73181460d914b51242c9ce07cf2b1e7",
    "userApiGuards.js": "78a81c4aa36bd576519ea4fc348a695b9d75421565fab015d9d2141c03957de1",
    ASSET: "5979402045ae6c7c22e2c1b2d17a5f650efc63e443d1237cad99045b3106b5ac",
    "index.html": "7686e6c0a96a445f8a5caf5cc39bc4ad25625ac5508173fbac0c7344a2d92ee4",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_ASSERT {label}: expected 1, got {count}")
    return text.replace(old, new, 1)


def build_scan() -> str:
    text = SCAN_BASE.read_bytes().decode("utf-8").replace("\r\n", "\n")
    if sha(SCAN_BASE) != EXPECTED["attendanceScan.js"]:
        raise SystemExit(f"Attendance snapshot changed: {sha(SCAN_BASE)}")

    text = replace_once(
        text,
        "const { decideEnrollFailure, fingerprintSummary, classifyCreateError } = require('./userApiGuards');",
        "const { decideEnrollFailure, fingerprintSummary, classifyCreateError, decideCheckInDuplicate } = require('./userApiGuards');",
        "require guard",
    )

    old = '''      // Prevent duplicate manual/scanner direction: same-day open check-in cannot be checked in again,
      // and check-out requires an open check-in.
      const agLastToday = db.prepare(
        `SELECT id, direction, attended_at FROM attendances
         WHERE member_id = ? AND substr(COALESCE(attended_at,''),1,10) = ?
         ORDER BY id DESC LIMIT 1`
      ).get(member.id, todayIso());
      if (direction === 'check_in' && agLastToday && agLastToday.direction === 'check_in') {
        const agDupMsg = `ورود ${member.name} امروز قبلاً ثبت شده است و هنوز خروج ثبت نشده`;
        logScanEvent({
          member_id: member.id, member_name: member.name, member_code: member.member_code, phone: member.phone,
          sport: sportRow ? sportRow.sport || '' : '', credential_kind: resolved.kind || rawKind,
          credential_value: rawValue || null, device_id: deviceId, device_name: deviceNameFor(deviceId),
          status: 'duplicate', duplicate: true, direction: 'check_in', message: agDupMsg,
        });
        return res.status(409).json({ ok: false, success: false, duplicate: true, error: agDupMsg + agWarn, message: agDupMsg + agWarn, unpaid_payment: agPay.unpaid_payment, payment_status: agPay.payment_status, latest_renewal_id: agPay.latest_renewal_id, member: memberPayload(member), direction: 'check_in' });
      }
      if (direction === 'check_out' && (!agLastToday || agLastToday.direction !== 'check_in')) {
        const agNoInMsg = `برای ${member.name} امروز ورود فعالی ثبت نشده است`;
        logScanEvent({
          member_id: member.id, member_name: member.name, member_code: member.member_code, phone: member.phone,
          sport: sportRow ? sportRow.sport || '' : '', credential_kind: resolved.kind || rawKind,
          credential_value: rawValue || null, device_id: deviceId, device_name: deviceNameFor(deviceId),
          status: 'duplicate', duplicate: true, direction: 'check_out', message: agNoInMsg,
        });
        return res.status(409).json({ ok: false, success: false, duplicate: true, error: agNoInMsg + agWarn, message: agNoInMsg + agWarn, unpaid_payment: agPay.unpaid_payment, payment_status: agPay.payment_status, latest_renewal_id: agPay.latest_renewal_id, member: memberPayload(member), direction: 'check_out' });
      }

      let attendedAt = null;
      if (b.scan_time && !Number.isNaN(Date.parse(b.scan_time))) {
        attendedAt = new Date(b.scan_time).toISOString();
      }
'''
    new = '''      let attendedAt = null;
      if (b.scan_time && !Number.isNaN(Date.parse(b.scan_time))) {
        attendedAt = new Date(b.scan_time).toISOString();
      }
      const agScanDay = attendedAt ? attendedAt.slice(0, 10) : todayIso();

      // Same-day rule: one check-in per sport. A second check-in is allowed only
      // for a two-sport member, for a different sport, in a different hour.
      const agLastToday = db.prepare(
        `SELECT id, direction, attended_at FROM attendances
         WHERE member_id = ? AND substr(COALESCE(attended_at,''),1,10) = ?
         ORDER BY id DESC LIMIT 1`
      ).get(member.id, agScanDay);
      if (direction === 'check_in') {
        const agTodayCheckIns = db.prepare(
          `SELECT sport, attended_at FROM attendances
           WHERE member_id = ? AND direction = 'check_in'
             AND substr(COALESCE(attended_at,''),1,10) = ?
           ORDER BY id ASC`
        ).all(member.id, agScanDay);
        const agSportCountRow = db.prepare(
          'SELECT COUNT(*) AS n FROM member_sports WHERE member_id = ?'
        ).get(member.id);
        const agDecision = decideCheckInDuplicate({
          existing: agTodayCheckIns.map((r) => ({ sport: r.sport, at: r.attended_at })),
          newSport: sportRow ? sportRow.sport || '' : '',
          sportCount: Number(agSportCountRow && agSportCountRow.n) || 0,
          newTime: attendedAt || nowIso(),
        });
        if (agDecision.status !== 200) {
          const agDupMsg = agDecision.body.error;
          logScanEvent({
            member_id: member.id, member_name: member.name, member_code: member.member_code, phone: member.phone,
            sport: sportRow ? sportRow.sport || '' : '', credential_kind: resolved.kind || rawKind,
            credential_value: rawValue || null, device_id: deviceId, device_name: deviceNameFor(deviceId),
            status: 'duplicate', duplicate: true, direction: 'check_in', message: agDupMsg,
          });
          return res.status(409).json({ ok: false, success: false, duplicate: true,
            error_code: agDecision.body.error_code, error: agDupMsg + agWarn, message: agDupMsg + agWarn,
            unpaid_payment: agPay.unpaid_payment, payment_status: agPay.payment_status,
            latest_renewal_id: agPay.latest_renewal_id, member: memberPayload(member), direction: 'check_in' });
        }
      }
      if (direction === 'check_out' && (!agLastToday || agLastToday.direction !== 'check_in')) {
        const agNoInMsg = `برای ${member.name} امروز ورود فعالی ثبت نشده است`;
        logScanEvent({
          member_id: member.id, member_name: member.name, member_code: member.member_code, phone: member.phone,
          sport: sportRow ? sportRow.sport || '' : '', credential_kind: resolved.kind || rawKind,
          credential_value: rawValue || null, device_id: deviceId, device_name: deviceNameFor(deviceId),
          status: 'duplicate', duplicate: true, direction: 'check_out', message: agNoInMsg,
        });
        return res.status(409).json({ ok: false, success: false, duplicate: true, error: agNoInMsg + agWarn, message: agNoInMsg + agWarn, unpaid_payment: agPay.unpaid_payment, payment_status: agPay.payment_status, latest_renewal_id: agPay.latest_renewal_id, member: memberPayload(member), direction: 'check_out' });
      }
'''
    text = replace_once(text, old, new, "check-in guard block")

    for token in (
        "decideCheckInDuplicate",
        "two-sport member",
        "agScanDay",
    ):
        if token not in text:
            raise SystemExit(f"SCAN_ASSERT missing {token}")
    if "OPEN_CHECKIN_BLOCKS_ALL" in text:
        raise SystemExit("SCAN_ASSERT old rule still present")
    return text


def write_outputs() -> dict[str, Path]:
    outputs = {
        "userApiGuards.js": GUARD_OUTPUT,
        "attendanceScan.js": SCAN_OUTPUT,
    }
    GUARD_OUTPUT.write_bytes(GUARD_SOURCE.read_bytes())
    SCAN_OUTPUT.write_bytes(build_scan().replace("\n", "\r\n").encode("utf-8"))
    for name, path in outputs.items():
        chk = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
        if chk.returncode != 0:
            raise SystemExit(f"node --check failed for {name}: {chk.stderr[:1800]}")
        print("LOCAL_OK", name, len(path.read_bytes()), sha(path))
    return outputs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm", help="Must be exactly WRITE")
    args = parser.parse_args()
    if args.confirm != "WRITE":
        raise SystemExit("--confirm WRITE is required")

    outputs = write_outputs()

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        sftp = client.open_sftp()
        for name, expected in EXPECTED.items():
            remote = (
                f"{FRONTEND_DIR}/assets/{name}" if name == ASSET
                else f"{FRONTEND_DIR}/index.html" if name == "index.html"
                else f"{BACKEND_DIR}/{name}"
            )
            live = sftp.open(remote, "rb").read()
            got = hashlib.sha256(live).hexdigest()
            if got != expected:
                raise SystemExit(f"Refusing deploy: live {remote} changed ({got})")
        sftp.close()
        print("LIVE_SNAPSHOTS_OK", len(EXPECTED))

        backup = create_backup(client, "checkin-guard-agfix129", persist=True, sudo_password=cfg.sudo_password)
        print("BACKUP", json.dumps(backup, ensure_ascii=False))
        stamp = backup["persisted"].rsplit("-", 1)[-1]

        for name in outputs:
            target = f"{BACKEND_DIR}/{name}"
            backup_cmd = f"cp -p {target} /tmp/{name}.bak-agfix129-{stamp}"
            rc, out, err = run_remote(
                client, "sh -c " + shlex.quote(backup_cmd),
                sudo=True, sudo_password=cfg.sudo_password, timeout=30,
            )
            if rc != 0:
                raise SystemExit(f"File backup failed for {name}: rc={rc}, err={err[:900]}")
        print("FILE_BACKUPS_OK", len(outputs))

        tmp_files = {}
        for name, local in outputs.items():
            stem = name.rsplit(".", 1)[0]
            tmp = f"/tmp/{stem}.agfix129-{stamp}.js"
            upload(client, local, tmp)
            rc, out, err = run_remote(client, f"node --check {tmp}", timeout=60)
            if rc != 0:
                raise SystemExit(f"Remote node --check failed for {name}: {err[:1500]}")
            tmp_files[name] = tmp
        print("REMOTE_CHECK_OK", len(tmp_files))

        copy_cmd = (
            "grep -q 'decideCheckInDuplicate' " + tmp_files["userApiGuards.js"]
            + " && grep -q 'agScanDay' " + tmp_files["attendanceScan.js"]
            + " && cp " + tmp_files["userApiGuards.js"] + " " + BACKEND_DIR + "/userApiGuards.js"
            + " && cp " + tmp_files["attendanceScan.js"] + " " + BACKEND_DIR + "/attendanceScan.js"
        )
        rc, out, err = run_remote(
            client, "sh -c " + shlex.quote(copy_cmd),
            sudo=True, sudo_password=cfg.sudo_password, timeout=60,
        )
        if rc != 0:
            raise SystemExit(f"Copy failed: rc={rc}, out={out[:900]!r}, err={err[:900]!r}")
        print("COPY_OK")

        verify_cmd = (
            f"grep -Fc 'CHECKIN_SAME_HOUR' {BACKEND_DIR}/userApiGuards.js; "
            f"grep -Fc 'decideCheckInDuplicate' {BACKEND_DIR}/attendanceScan.js; "
            f"grep -o 'index-AGFIX[0-9]*\\.js' {FRONTEND_DIR}/index.html | head -n 1"
        )
        rc, out, err = run_remote(client, verify_cmd, timeout=30)
        lines = [line.strip() for line in out.strip().splitlines() if line.strip()]
        if rc != 0 or lines != ["1", "2", ASSET]:
            raise SystemExit(f"Verify failed: rc={rc}, lines={lines!r}, err={err[:900]!r}")
        print("VERIFY_OK", json.dumps(lines, ensure_ascii=False))

        pm2_cmd = (
            "env PATH=/usr/local/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin "
            + PM2_BIN + " restart alphagym-api"
        )
        rc, out, err = run_remote(client, pm2_cmd, sudo=True, sudo_password=cfg.sudo_password, timeout=90)
        if rc != 0:
            raise SystemExit(f"pm2 restart failed: rc={rc}, err={err[:1200]}")
        print("PM2_RESTART_OK")
        print("DEPLOY_OK AGFIX129", ASSET)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
