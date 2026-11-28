"""Deploy AGFIX125: open personnel attendance entry to secretary and manager.

- Secretary (staff) and manager/admin can manually correct attendance and see
  today's personnel list (the list was already visible; the edit gate is opened).
- Monthly report, payroll columns and payslips remain manager/admin only.
- Built from the exact live AGFIX124 frontend and live personnelAttendance.js.
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

FRONT_SOURCE = LOCAL / "live-current-index-AGFIX124.js"
FRONT_OUTPUT = LOCAL / "index-AGFIX125.js"
FRONT_INDEX_SOURCE = LOCAL / "live-current-index-20261128.html"
FRONT_INDEX = LOCAL / "agfix125-index.html"
BACK_SOURCE = LOCAL / "live-current-personnelAttendance-20261128.js"
BACK_OUTPUT = LOCAL / "personnelAttendance.agfix125.js"

ASSET = "index-AGFIX125.js"
OLD_ASSET = "index-AGFIX124.js"
FRONT_SHA = "8a369e71f475ae3d13151dba2540f7a3bf857e40274a15c328f5ae2c9ab97765"
BACK_SHA = "61dad2d3e2f7a1a8fcc4614e47f889f6c3c9770e80a0d7317279df37c7d9cd65"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_ASSERT failed for {label}: expected 1, got {count}")
    return text.replace(old, new, 1)


def build_backend() -> str:
    raw = BACK_SOURCE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != BACK_SHA:
        raise SystemExit("Backend live snapshot hash mismatch")
    text = raw.decode("utf-8").replace("\r\n", "\n")

    old_priv = (
        "  const isPrivilegedReq = (req) => {\n"
        "    const role = String(req.staff?.role || '');\n"
        "    return role === 'admin' || role === 'manager' || cleanName(req).includes('رهاخدهندهلو');\n"
        "  };\n"
        "  const isAdminReq = (req) => String(req.staff?.role || '') === 'admin';\n"
    )
    new_priv = (
        "  const isPrivilegedReq = (req) => {\n"
        "    const role = String(req.staff?.role || '');\n"
        "    return role === 'admin' || role === 'manager' || Number(req.staff?.id) === 10 || cleanName(req).includes('رهاخدهندهلو');\n"
        "  };\n"
        "  const isAdminReq = (req) => String(req.staff?.role || '') === 'admin';\n"
        "  const requireAttendanceEditor = (req, res, next) => {\n"
        "    const role = String(req.staff?.role || '');\n"
        "    if (!(role === 'admin' || role === 'staff' || isPrivilegedReq(req)))\n"
        "      return res.status(403).json({ error: 'دسترسی ثبت تردد پرسنل فعال نیست' });\n"
        "    next();\n"
        "  };\n"
        "  const requireReportManager = (req, res, next) => {\n"
        "    if (!isPrivilegedReq(req)) return res.status(403).json({ error: 'گزارشگیری فقط برای مدیر است' });\n"
        "    next();\n"
        "  };\n"
    )
    text = replace_once(text, old_priv, new_priv, "attendance editor + report guards")

    text = replace_once(
        text,
        "app.get('/personnel-attendance/monthly-report', requireAuth, requireRealAdmin,",
        "app.get('/personnel-attendance/monthly-report', requireAuth, requireReportManager,",
        "monthly report manager gate",
    )
    text = replace_once(
        text,
        "app.post('/personnel-attendance/manual', requireAuth, requireRealAdmin,",
        "app.post('/personnel-attendance/manual', requireAuth, requireAttendanceEditor,",
        "manual attendance editor gate",
    )
    text = replace_once(
        text,
        "app.get('/personnel-payslips', requireAuth, requireAdmin,",
        "app.get('/personnel-payslips', requireAuth, requireReportManager,",
        "payslip list manager gate",
    )
    text = replace_once(
        text,
        "app.post('/personnel-payslips/generate', requireAuth, requireAdmin,",
        "app.post('/personnel-payslips/generate', requireAuth, requireReportManager,",
        "payslip generate manager gate",
    )

    for token in (
        "requireAttendanceEditor",
        "requireReportManager",
        "Number(req.staff?.id) === 10",
        "app.post('/personnel-attendance/manual', requireAuth, requireAttendanceEditor,",
        "app.get('/personnel-payslips', requireAuth, requireReportManager,",
        "app.put('/personnel-leaves/:id/status', requireAuth, requireRealAdmin,",
        "AGFIX116",
    ):
        if token not in text:
            raise SystemExit(f"BACKEND_ASSERT failed: missing {token}")
    return text


def build_frontend() -> str:
    raw = FRONT_SOURCE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != FRONT_SHA:
        raise SystemExit("Frontend live snapshot hash mismatch")
    text = raw.decode("utf-8").replace("\r\n", "\n")

    old_flags = (
        "  const agCanManualEdit=String(agRole||'')==='admin';const agCanLeave=adm||String(agRole||'')==='staff';const agPayslipAdmin=String(agRole||'')==='admin';\n"
        "  const agIsRealAdmin=String(agRole||'')==='admin';const agIsManager=isMgrName(agUser&&agUser.full_name,null,String(agRole||''));const agSelfUid=Number(agUser&&agUser.id)||0;const agSelfName=String((agUser&&agUser.full_name)||'').trim();const agCanSeeAllLeaves=agIsRealAdmin||agIsManager;\n"
    )
    new_flags = (
        "  const agIsRealAdmin=String(agRole||'')==='admin';const agIsManager=isMgrName(agUser&&agUser.full_name,null,String(agRole||''));const agSelfUid=Number(agUser&&agUser.id)||0;const agSelfName=String((agUser&&agUser.full_name)||'').trim();const agCanSeeAllLeaves=agIsRealAdmin||agIsManager;\n"
        "  const agCanManualEdit=agIsRealAdmin||agIsManager||String(agRole||'')==='staff';const agCanLeave=adm||String(agRole||'')==='staff';const agCanReport=agIsRealAdmin||agIsManager;const agPayslipAdmin=agCanReport;\n"
    )
    text = replace_once(text, old_flags, new_flags, "frontend role flags")

    for token in (
        "agCanManualEdit=agIsRealAdmin||agIsManager||String(agRole||'')==='staff'",
        "agCanReport=agIsRealAdmin||agIsManager",
        "agPayslipAdmin=agCanReport",
        "agTab===\"today\"&&agCanManualEdit",
        "agTab===\"payroll\"&&agPayslipAdmin",
        "...(agPayslipAdmin?[[\"personnel\",\"پرسنل\"],[\"payroll\",\"حقوق و گزارش\"]]:[])",
    ):
        if token not in text:
            raise SystemExit(f"FRONTEND_ASSERT failed: missing {token}")
    return text


def build_index() -> str:
    text = FRONT_INDEX_SOURCE.read_text(encoding="utf-8").replace("\r\n", "\n")
    if OLD_ASSET not in text:
        raise SystemExit("Live index.html is not on expected AGFIX124")
    return text.replace(OLD_ASSET, ASSET, 1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm", help="Must be exactly WRITE")
    args = parser.parse_args()
    if args.confirm != "WRITE":
        raise SystemExit("--confirm WRITE is required")

    backend = build_backend()
    BACK_OUTPUT.write_bytes(backend.replace("\n", "\r\n").encode("utf-8"))
    frontend = build_frontend()
    FRONT_OUTPUT.write_bytes(frontend.replace("\n", "\r\n").encode("utf-8"))
    index = build_index()
    FRONT_INDEX.write_text(index, encoding="utf-8", newline="")

    for path, label in ((BACK_OUTPUT, "backend"), (FRONT_OUTPUT, "frontend")):
        check = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
        if check.returncode != 0:
            raise SystemExit(f"{label} node --check failed:\n" + check.stderr[:4000])
        print("NODE_CHECK_OK", label, len(path.read_bytes()))

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        sftp = client.open_sftp()
        live_html = sftp.open(FRONTEND_DIR + "/index.html").read().decode("utf-8")
        if OLD_ASSET not in live_html:
            raise SystemExit("Refusing deploy: live index.html changed")
        live_front = sftp.open(FRONTEND_DIR + "/assets/" + OLD_ASSET).read()
        if hashlib.sha256(live_front).hexdigest() != FRONT_SHA:
            raise SystemExit("Refusing deploy: live AGFIX124 asset changed")
        live_back = sftp.open(BACKEND_DIR + "/personnelAttendance.js").read()
        if hashlib.sha256(live_back).hexdigest() != BACK_SHA:
            raise SystemExit("Refusing deploy: live personnelAttendance.js changed")
        sftp.close()

        backup = create_backup(
            client, "staff-attendance-editor-agfix125", persist=True,
            sudo_password=cfg.sudo_password,
        )
        print("BACKUP", json.dumps(backup, ensure_ascii=False))

        token = stamp()
        file_backup = f"/tmp/personnelAttendance.js.bak-agfix125-{token}"
        rc, out, err = run_remote(
            client,
            f"cp -p {BACKEND_DIR}/personnelAttendance.js {file_backup} && ls -l {file_backup}",
            sudo=True, sudo_password=cfg.sudo_password, timeout=30,
        )
        if rc != 0:
            raise SystemExit(f"File backup failed: rc={rc}, err={err[:1000]}")
        print("FILE_BACKUP_OK", out.strip())

        tmp_back = f"/tmp/personnelAttendance.agfix125-{token}.js"
        tmp_asset = f"/tmp/{ASSET}"
        tmp_index = f"/tmp/agfix125-index-{token}.html"
        upload(client, BACK_OUTPUT, tmp_back)
        upload(client, FRONT_OUTPUT, tmp_asset)
        upload(client, FRONT_INDEX, tmp_index)

        for tmp_name, label in ((tmp_back, "backend"), (tmp_asset, "frontend")):
            rc, out, err = run_remote(client, f"node --check {tmp_name}", timeout=60)
            if rc != 0:
                raise SystemExit(f"Remote {label} node --check failed: rc={rc}, out={out[:2000]}, err={err[:2000]}")
            print("REMOTE_NODE_CHECK_OK", label)

        copy_cmd = (
            f"grep -q '{OLD_ASSET}' {FRONTEND_DIR}/index.html "
            f"&& cp {tmp_back} {BACKEND_DIR}/personnelAttendance.js "
            f"&& cp {tmp_asset} {FRONTEND_DIR}/assets/{ASSET} "
            f"&& cp {tmp_index} {FRONTEND_DIR}/index.html"
        )
        rc, out, err = run_remote(
            client, "sh -c " + shlex.quote(copy_cmd),
            sudo=True, sudo_password=cfg.sudo_password, timeout=60,
        )
        if rc != 0:
            raise SystemExit(f"Copy failed: rc={rc}, out={out!r}, err={err!r}")
        print("COPY_OK")

        verify_cmd = (
            f"grep -c 'requireAttendanceEditor' {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -c 'requireReportManager' {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -c \"app.put('/personnel-leaves/:id/status', requireAuth, requireRealAdmin\" {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -o 'index-AGFIX[0-9]*\\.js' {FRONTEND_DIR}/index.html | head -n 1"
        )
        rc, out, err = run_remote(client, verify_cmd, timeout=30)
        lines = [line.strip() for line in out.strip().splitlines() if line.strip()]
        if rc != 0 or lines[:3] != ["2", "4", "1"] or lines[-1:] != [ASSET]:
            raise SystemExit(f"Deploy verification failed: rc={rc}, lines={lines!r}, err={err!r}")
        print("BACKEND_GUARDS_OK", lines[:3])
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
        print("DEPLOY_OK", ASSET)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
