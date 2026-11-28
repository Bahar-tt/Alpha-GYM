"""Deploy AGFIX126: open guided check-in/out to secretary as well.

AGFIX125 opened the manual-correction endpoint but the "ثبت ورود / ثبت خروج"
buttons call /personnel-attendance/check-in and /check-out, which still used
the old mayAct() guard. This backend-only fix lets staff/secretary, manager
and admin record guided attendance for personnel, while leaves keep their
existing self-only rule and reports/payslips stay manager/admin only.

The live frontend AGFIX125 is verified but not changed, so no new asset name
is needed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shlex
import subprocess
from pathlib import Path

from common import (
    BACKEND_DIR,
    FRONTEND_DIR,
    PM2_BIN,
    RemoteConfig,
    connect,
    run_remote,
    stamp,
    upload,
)
from make_backup import create_backup

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / "local"

BACK_SOURCE = LOCAL / "personnelAttendance.agfix125.js"
BACK_OUTPUT = LOCAL / "personnelAttendance.agfix126.js"
BACK_SHA = "a6087116017398dc93ea450879d8fb2f7605d85f35a4176ff97deb16a997026b"
FRONT_ASSET = "index-AGFIX125.js"
FRONT_SHA = "e79f99f7fd7f37f4cdc2021cbbc79e7ba2de06479116d86ee980d0523b7c1c16"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_ASSERT failed for {label}: expected 1, got {count}")
    return text.replace(old, new, 1)


def build_backend() -> str:
    raw = BACK_SOURCE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != BACK_SHA:
        raise SystemExit("Backend AGFIX125 snapshot hash mismatch")
    text = raw.decode("utf-8").replace("\r\n", "\n")

    old_editor = (
        "  const requireAttendanceEditor = (req, res, next) => {\n"
        "    const role = String(req.staff?.role || '');\n"
        "    if (!(role === 'admin' || role === 'staff' || isPrivilegedReq(req)))\n"
        "      return res.status(403).json({ error: 'دسترسی ثبت تردد پرسنل فعال نیست' });\n"
        "    next();\n"
        "  };\n"
    )
    new_editor = (
        "  const canEditAttendanceReq = (req) => {\n"
        "    const role = String(req.staff?.role || '');\n"
        "    return role === 'admin' || role === 'staff' || isPrivilegedReq(req);\n"
        "  };\n"
        "  const requireAttendanceEditor = (req, res, next) => {\n"
        "    if (!canEditAttendanceReq(req))\n"
        "      return res.status(403).json({ error: 'دسترسی ثبت تردد پرسنل فعال نیست' });\n"
        "    next();\n"
        "  };\n"
    )
    text = replace_once(text, old_editor, new_editor, "shared attendance editor check")

    old_guard = (
        "    if (!mayAct(req, p)) return res.status(403).json({ error: 'دسترسی ثبت تردد پرسنل فعال نیست' });\n"
    )
    new_guard = (
        "    if (!canEditAttendanceReq(req) && !selfPersonnelIds(req).includes(Number(p && p.id)))\n"
        "      return res.status(403).json({ error: 'دسترسی ثبت تردد پرسنل فعال نیست' });\n"
    )
    text = replace_once(text, old_guard, new_guard, "guided check-in/out guard")

    text = replace_once(
        text,
        "  // Manual attendance correction: admin only.\n",
        "  // Manual attendance correction: secretary, manager and admin.\n",
        "manual comment",
    )

    for token in (
        "const canEditAttendanceReq = (req) => {",
        "if (!canEditAttendanceReq(req) && !selfPersonnelIds(req).includes(Number(p && p.id)))",
        "app.post('/personnel-attendance/check-in', requireAuth, (req, res) => selfCheck(req, res, 'check_in'));",
        "app.post('/personnel-attendance/manual', requireAuth, requireAttendanceEditor,",
        "app.get('/personnel-attendance/monthly-report', requireAuth, requireReportManager,",
        "app.put('/personnel-leaves/:id/status', requireAuth, requireRealAdmin,",
        "AGFIX116",
    ):
        if token not in text:
            raise SystemExit(f"BACKEND_ASSERT failed: missing {token}")
    return text


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm", help="Must be exactly WRITE")
    args = parser.parse_args()
    if args.confirm != "WRITE":
        raise SystemExit("--confirm WRITE is required")

    backend = build_backend()
    BACK_OUTPUT.write_bytes(backend.replace("\n", "\r\n").encode("utf-8"))
    check = subprocess.run(["node", "--check", str(BACK_OUTPUT)], capture_output=True, text=True)
    if check.returncode != 0:
        raise SystemExit("node --check failed:\n" + check.stderr[:4000])
    print("NODE_CHECK_OK", len(BACK_OUTPUT.read_bytes()))

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        sftp = client.open_sftp()
        live_back = sftp.open(BACKEND_DIR + "/personnelAttendance.js").read()
        if hashlib.sha256(live_back).hexdigest() != BACK_SHA:
            raise SystemExit("Refusing deploy: live personnelAttendance.js changed")
        live_html = sftp.open(FRONTEND_DIR + "/index.html").read().decode("utf-8")
        if FRONT_ASSET not in live_html:
            raise SystemExit("Refusing deploy: live index.html is not on AGFIX125")
        live_front = sftp.open(FRONTEND_DIR + "/assets/" + FRONT_ASSET).read()
        if hashlib.sha256(live_front).hexdigest() != FRONT_SHA:
            raise SystemExit("Refusing deploy: live AGFIX125 asset changed")
        sftp.close()

        backup = create_backup(
            client, "staff-attendance-guided-agfix126", persist=True,
            sudo_password=cfg.sudo_password,
        )
        print("BACKUP", json.dumps(backup, ensure_ascii=False))

        token = stamp()
        file_backup = f"/tmp/personnelAttendance.js.bak-agfix126-{token}"
        rc, out, err = run_remote(
            client,
            f"cp -p {BACKEND_DIR}/personnelAttendance.js {file_backup} && ls -l {file_backup}",
            sudo=True, sudo_password=cfg.sudo_password, timeout=30,
        )
        if rc != 0:
            raise SystemExit(f"File backup failed: rc={rc}, err={err[:1000]}")
        print("FILE_BACKUP_OK", out.strip())

        tmp_back = f"/tmp/personnelAttendance.agfix126-{token}.js"
        upload(client, BACK_OUTPUT, tmp_back)
        rc, out, err = run_remote(client, f"node --check {tmp_back}", timeout=60)
        if rc != 0:
            raise SystemExit(f"Remote node --check failed: rc={rc}, out={out[:2000]}, err={err[:2000]}")
        print("REMOTE_NODE_CHECK_OK")

        copy_cmd = (
            f"grep -q '{FRONT_ASSET}' {FRONTEND_DIR}/index.html "
            f"&& grep -q 'requireAttendanceEditor' {BACKEND_DIR}/personnelAttendance.js "
            f"&& cp {tmp_back} {BACKEND_DIR}/personnelAttendance.js"
        )
        rc, out, err = run_remote(
            client, "sh -c " + shlex.quote(copy_cmd),
            sudo=True, sudo_password=cfg.sudo_password, timeout=60,
        )
        if rc != 0:
            raise SystemExit(f"Copy failed: rc={rc}, out={out!r}, err={err!r}")
        print("COPY_OK")

        verify_cmd = (
            f"grep -c 'canEditAttendanceReq' {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -c 'requireAttendanceEditor' {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -c 'requireReportManager' {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -c \"if (!mayAct(req, p)) return res.status(403).json({{ error: 'دسترسی ثبت تردد پرسنل فعال نیست'\" {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -o 'index-AGFIX[0-9]*\\.js' {FRONTEND_DIR}/index.html | head -n 1"
        )
        rc, out, err = run_remote(client, verify_cmd, timeout=30)
        lines = [line.strip() for line in out.strip().splitlines() if line.strip()]
        if rc != 0 or lines[:4] != ["3", "2", "4", "0"] or lines[-1:] != [FRONT_ASSET]:
            raise SystemExit(f"Deploy verification failed: rc={rc}, lines={lines!r}, err={err!r}")
        print("BACKEND_GUARDS_OK", lines[:4])
        print("FRONTEND_REF_OK", lines[-1])

        pm2_cmd = (
            "env PATH=/usr/local/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin "
            + PM2_BIN + " restart alphagym-api"
        )
        rc, out, err = run_remote(
            client, pm2_cmd, sudo=True, sudo_password=cfg.sudo_password, timeout=90,
        )
        if rc != 0:
            raise SystemExit(f"pm2 restart failed: rc={rc}, out={out[:2000]}, err={err[:2000]}")
        print("PM2_RESTART_OK")
        print("DEPLOY_OK backend-only", FRONT_ASSET)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
