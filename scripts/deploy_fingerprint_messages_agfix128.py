"""Deploy AGFIX128: professional fingerprint messages + personnel UI badges.

Backend: only userApiGuards.js changes (server/personnel/scan already delegate).
Frontend: immutable index-AGFIX128.js + index.html, built from the exact live
index-AGFIX125.js snapshot. Nothing else is touched.
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

GUARD = ROOT / "backend" / "userApiGuards.js"
GUARD_BASE = LOCAL / "userApiGuards.agfix127.js"
FRONT_SOURCE = LOCAL / "index-AGFIX125.js"
FRONT_OUTPUT = LOCAL / "index-AGFIX128.js"
FRONT_INDEX_SOURCE = LOCAL / "agfix125-index.html"
FRONT_INDEX = LOCAL / "agfix128-index.html"

ASSET = "index-AGFIX128.js"
OLD_ASSET = "index-AGFIX125.js"

EXPECTED = {
    "server.js": "5def9d0eb0856b1cb7e0311e836669fbd8542506a4d24dbf0840fde7c7d6e295",
    "personnelAttendance.js": "77ea7ebc25be29a2b36a0b0840fc8ed2d35b8bf0952138813c536b3b14d427dd",
    "attendanceScan.js": "bd54509a9f93186459bc0c4bc766feeeb73181460d914b51242c9ce07cf2b1e7",
    "userApiGuards.js": "ae6e2b58387d26b57034504629b970e7f55c5b41077bfa326098cada544536a0",
    OLD_ASSET: "e79f99f7fd7f37f4cdc2021cbbc79e7ba2de06479116d86ee980d0523b7c1c16",
    "index.html": "f1f078380a2b2bfd7fc9b175c19c4b39a3229b83a08a953737b26e46a4e34ae2",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_ASSERT {label}: expected 1, got {count}")
    return text.replace(old, new, 1)


def build_frontend() -> str:
    text = FRONT_SOURCE.read_bytes().decode("utf-8").replace("\r\n", "\n")
    if sha(FRONT_SOURCE) != EXPECTED[OLD_ASSET]:
        raise SystemExit(f"Frontend snapshot changed: {sha(FRONT_SOURCE)}")

    text = replace_once(
        text,
        'else{const D=R.data||R;agSetEnr({enrollment_id:D.id,personnel_id:C.id,personnel_name:C.full_name,status:"pending",instructions:D.instructions||"انگشت را روی سنسور دستگاه بگذارید (۳ بار)",expires_at:D.expires_at})}',
        'else{const D=R.data||R;agSetEnr({enrollment_id:D.id,personnel_id:C.id,personnel_name:C.full_name,status:"pending",instructions:D.instructions||"انگشت را روی سنسور دستگاه بگذارید (۳ بار)",expires_at:D.expires_at,fingerprint:D.fingerprint||null,message:D.fingerprint&&D.fingerprint.message||null})}',
        "enroll response fingerprint",
    )
    text = replace_once(
        text,
        'catch(_e){q("ثبت اثر انگشت ناموفق بود");alert("ثبت اثر انگشت ناموفق بود")}',
        'catch(_e){const agMsg="ثبت اثر انگشت ناموفق بود؛ دستگاه پاسخ نداد یا کد از قبل ثبت شده است. لطفاً Agent را ریاستارت کرده و دوباره تلاش کنید.";q(agMsg);alert(agMsg)}',
        "enroll error message",
    )
    text = replace_once(
        text,
        'C.error?q(C.error):(q("پرسنل جدید ثبت شد"),setNp(npEmpty()));',
        'C.error?q(C.error):(q(String(np.fingerprint_id||"").trim()?"پرسنل جدید با کد اثر انگشت ثبت شد.":"پرسنل ثبت شد، ولی اثر انگشتی برای آن ثبت نشده است. لطفاً دکمهٔ «ثبت اثر انگشت» را بزنید."),setNp(npEmpty()));',
        "create success message",
    )
    text = replace_once(
        text,
        'C.fingerprint_id&&n.jsx("span",{className:"badge badge-success",children:"انگشت"}),',
        'C.fingerprint_id?n.jsx("span",{className:"badge badge-success",children:"انگشت ثبت شده"}):n.jsx("span",{className:"badge",style:{background:"rgba(245,158,11,.15)",color:"#f59e0b",border:"1px solid rgba(245,158,11,.35)"},children:"فاقد اثر انگشت"}),',
        "personnel fingerprint badge",
    )
    text = replace_once(
        text,
        'n.jsx("input",{className:"input-field mt-3",placeholder:"یادداشت اختیاری",value:np.notes,onChange:C=>npSet("notes",C.target.value)})',
        'n.jsx("input",{className:"input-field mt-3",placeholder:"یادداشت اختیاری",value:np.notes,onChange:C=>npSet("notes",C.target.value)}),\n'
        '        n.jsx("p",{className:"text-xs mt-2",style:{color:"var(--text-secondary)"},children:"اگر کد اثر انگشت وارد نکنید، پرسنل بدون اثر انگشت ثبت میشود؛ سپس دکمهٔ «ثبت اثر انگشت» را بزنید."})',
        "create form hint",
    )
    text = replace_once(
        text,
        'agEnr.status==="failed"?"ثبت اثر انگشت ناموفق بود.":agEnr.instructions',
        'agEnr.status==="failed"?(agEnr.message||"اثر انگشت ثبت نشد؛ دستگاه پاسخ نداد یا کد از قبل ثبت شده است. لطفاً Agent را ریاستارت کرده و دوباره تلاش کنید."):agEnr.instructions',
        "modal failed message",
    )
    for token in (
        "فاقد اثر انگشت",
        "ثبت نشده است. لطفاً دکمهٔ",
        "لطفاً Agent را ریاستارت کرده",
        "agEnr.message||",
    ):
        if token not in text:
            raise SystemExit(f"FRONT_ASSERT missing {token}")
    return text


def build_index() -> str:
    text = FRONT_INDEX_SOURCE.read_text(encoding="utf-8").replace("\r\n", "\n")
    if OLD_ASSET not in text:
        raise SystemExit("Index snapshot is not on AGFIX125")
    return text.replace(OLD_ASSET, ASSET, 1)


def write_outputs() -> dict[str, Path]:
    outputs = {
        "userApiGuards.js": LOCAL / "userApiGuards.agfix128.js",
        ASSET: FRONT_OUTPUT,
        "index.html": FRONT_INDEX,
    }
    guard = GUARD.read_bytes()
    if sha(GUARD) == sha(GUARD_BASE):
        raise SystemExit("Guard unchanged: nothing to build")
    outputs["userApiGuards.js"].write_bytes(guard)
    FRONT_OUTPUT.write_bytes(build_frontend().replace("\n", "\r\n").encode("utf-8"))
    FRONT_INDEX.write_text(build_index(), encoding="utf-8", newline="")
    for name, path in outputs.items():
        if name.endswith(".js"):
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
                f"{FRONTEND_DIR}/assets/{name}" if name == OLD_ASSET
                else f"{FRONTEND_DIR}/index.html" if name == "index.html"
                else f"{BACKEND_DIR}/{name}"
            )
            live = sftp.open(remote, "rb").read()
            got = hashlib.sha256(live).hexdigest()
            if got != expected:
                raise SystemExit(f"Refusing deploy: live {remote} changed ({got})")
        sftp.close()
        print("LIVE_SNAPSHOTS_OK", len(EXPECTED))

        backup = create_backup(client, "fingerprint-ui-agfix128", persist=True, sudo_password=cfg.sudo_password)
        print("BACKUP", json.dumps(backup, ensure_ascii=False))

        stamp = backup["persisted"].rsplit("-", 1)[-1]
        backups = []
        for name, remote_name in (
            ("userApiGuards.js", "userApiGuards.js"),
            (ASSET, None),
            ("index.html", "index.html"),
        ):
            target = f"{FRONTEND_DIR}/{ASSET}" if remote_name is None else f"{BACKEND_DIR}/{remote_name}" if remote_name == "userApiGuards.js" else f"{FRONTEND_DIR}/index.html"
            backup_cmd = f"if [ -f {target} ]; then cp -p {target} /tmp/{name}.bak-agfix128-{stamp}; fi"
            rc, out, err = run_remote(
                client, "sh -c " + shlex.quote(backup_cmd),
                sudo=True, sudo_password=cfg.sudo_password, timeout=30,
            )
            if rc != 0:
                raise SystemExit(f"File backup failed for {name}: rc={rc}, err={err[:900]}")
            backups.append(target)
        print("FILE_BACKUPS_OK", len(backups))

        tmp_files = {}
        for name, local in outputs.items():
            stem, ext = name.rsplit(".", 1)
            tmp = f"/tmp/{stem}.agfix128-{stamp}.{ext}"
            upload(client, local, tmp)
            if name.endswith(".js"):
                rc, out, err = run_remote(client, f"node --check {tmp}", timeout=60)
                if rc != 0:
                    raise SystemExit(f"Remote node --check failed for {name}: {err[:1500]}")
            tmp_files[name] = tmp
        print("REMOTE_CHECK_OK", len(tmp_files))

        copy_cmd = (
            f"grep -q '{OLD_ASSET}' {FRONTEND_DIR}/index.html "
            f"&& grep -q 'FINGERPRINT_NOT_ENROLLED' {tmp_files['userApiGuards.js']} "
            f"&& grep -q 'فاقد اثر انگشت' {tmp_files[ASSET]} "
            f"&& cp {tmp_files['userApiGuards.js']} {BACKEND_DIR}/userApiGuards.js "
            f"&& cp {tmp_files[ASSET]} {FRONTEND_DIR}/assets/{ASSET} "
            f"&& cp {tmp_files['index.html']} {FRONTEND_DIR}/index.html"
        )
        rc, out, err = run_remote(
            client, "sh -c " + shlex.quote(copy_cmd),
            sudo=True, sudo_password=cfg.sudo_password, timeout=60,
        )
        if rc != 0:
            raise SystemExit(f"Copy failed: rc={rc}, out={out[:900]!r}, err={err[:900]!r}")
        print("COPY_OK")

        verify_cmd = (
            f"grep -Fc 'FINGERPRINT_NOT_ENROLLED' {BACKEND_DIR}/userApiGuards.js; "
            f"grep -Fc 'فاقد اثر انگشت' {FRONTEND_DIR}/assets/{ASSET}; "
            f"grep -o 'index-AGFIX[0-9]*\\.js' {FRONTEND_DIR}/index.html | head -n 1"
        )
        rc, out, err = run_remote(client, verify_cmd, timeout=30)
        lines = [line.strip() for line in out.strip().splitlines() if line.strip()]
        if rc != 0 or lines != ["1", "1", ASSET]:
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
        print("DEPLOY_OK AGFIX128", ASSET)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
