"""Deploy AGFIX132: drop renewed members from the renewals pending queue.

Bug: the "در انتظار تمدید" queue excluded only localStorage archive ids, so any
member renewed before AGFIX130 (or on another device) stayed in the queue while
also appearing in "آخرین تمدیدها". Fix: the queue now also excludes every member
id present in the server renewals list (status completed), so data-driven and
device-independent. Frontend-only immutable deploy from the live AGFIX131 snapshot.
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

FRONT_SOURCE = LOCAL / "index-AGFIX131.js"
FRONT_OUTPUT = LOCAL / "index-AGFIX132.js"
FRONT_INDEX_SOURCE = LOCAL / "agfix131-index.html"
FRONT_INDEX = LOCAL / "agfix132-index.html"

ASSET = "index-AGFIX132.js"
OLD_ASSET = "index-AGFIX131.js"

EXPECTED = {
    "server.js": "aeff717b6e00e863954106d40bc7cee59b5354ec02b864ee84867d2293d3fcb6",
    "personnelAttendance.js": "6dc263007578c87d307c445d35c5a0b5eb202b481eacbc84e8818c32d76f7e3c",
    "attendanceScan.js": "bc3e83601340fe4daf086ab04d96193f2cc2aecc8385ce03065d0f357bc3d869",
    "userApiGuards.js": "035a22cfb1b3d45f40a672f6530981131bbedb04a2acc5e4f7980bab9eeff568",
    OLD_ASSET: "0aaa5f726aa18f5d741540533cfa9ddc12215aef28c4cffb953ef49b445ab1b7",
    "index.html": "68546a76f6f800bb8eb67f5c9ba23088860e0f766fc384dc27b2a7268bb794c2",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_ASSERT {label}: expected 1, got {count}")
    return text.replace(old, new, 1)


OLD_MEMO = 'V=p.useMemo(()=>{const C=new Set(d);return(o||[]).filter(Z=>!C.has(Z.id)).sort((Z,T)=>String(T.end_date||"").localeCompare(String(Z.end_date||"")))},[o,d])'
NEW_MEMO = 'V=p.useMemo(()=>{const C=new Set(d);for(const G of agServerRenewals){if((!G.status||G.status==="completed")&&G.member_id!=null)C.add(G.member_id)}return(o||[]).filter(Z=>!C.has(Z.id)).sort((Z,T)=>String(T.end_date||"").localeCompare(String(Z.end_date||"")))},[o,d,agServerRenewals])'


def build_frontend() -> str:
    text = FRONT_SOURCE.read_bytes().decode("utf-8").replace("\r\n", "\n")
    if sha(FRONT_SOURCE) != EXPECTED[OLD_ASSET]:
        raise SystemExit(f"Frontend snapshot changed: {sha(FRONT_SOURCE)}")
    text = replace_once(text, OLD_MEMO, NEW_MEMO, "pending queue excludes renewed ids")
    if text.count("if(!agArc.includes(") != 2:
        raise SystemExit("FRONT_ASSERT prior archive patches lost")
    return text


def build_index() -> str:
    text = FRONT_INDEX_SOURCE.read_text(encoding="utf-8").replace("\r\n", "\n")
    if OLD_ASSET not in text:
        raise SystemExit("Index snapshot is not on AGFIX131")
    return text.replace(OLD_ASSET, ASSET, 1)


def write_outputs() -> dict[str, Path]:
    outputs = {ASSET: FRONT_OUTPUT, "index.html": FRONT_INDEX}
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
                f"{FRONTEND_DIR}/assets/{name}" if name.endswith(".js") and name.startswith("index-")
                else f"{FRONTEND_DIR}/index.html" if name == "index.html"
                else f"{BACKEND_DIR}/{name}"
            )
            live = sftp.open(remote, "rb").read()
            got = hashlib.sha256(live).hexdigest()
            if got != expected:
                raise SystemExit(f"Refusing deploy: live {remote} changed ({got})")
        sftp.close()
        print("LIVE_SNAPSHOTS_OK", len(EXPECTED))

        backup = create_backup(client, "renew-queue-agfix132", persist=True, sudo_password=cfg.sudo_password)
        print("BACKUP", json.dumps(backup, ensure_ascii=False))
        stamp = backup["persisted"].rsplit("-", 1)[-1]

        for name, remote in ((ASSET, f"{FRONTEND_DIR}/assets/{ASSET}"), ("index.html", f"{FRONTEND_DIR}/index.html")):
            backup_cmd = f"if [ -f {remote} ]; then cp -p {remote} /tmp/{name}.bak-agfix132-{stamp}; fi"
            rc, out, err = run_remote(client, "sh -c " + shlex.quote(backup_cmd), sudo=True, sudo_password=cfg.sudo_password, timeout=30)
            if rc != 0:
                raise SystemExit(f"File backup failed for {name}: rc={rc}, err={err[:900]}")
        print("FILE_BACKUPS_OK 2")

        tmp_files = {}
        for name, local in outputs.items():
            stem = name.rsplit(".", 1)[0]
            tmp = f"/tmp/{stem}.agfix132-{stamp}.{'js' if name.endswith('.js') else 'html'}"
            upload(client, local, tmp)
            if name.endswith(".js"):
                rc, out, err = run_remote(client, f"node --check {tmp}", timeout=60)
                if rc != 0:
                    raise SystemExit(f"Remote node --check failed for {name}: {err[:1500]}")
            tmp_files[name] = tmp
        print("REMOTE_CHECK_OK")

        copy_cmd = (
            "grep -q 'agServerRenewals' " + tmp_files[ASSET]
            + " && cp " + tmp_files[ASSET] + " " + FRONTEND_DIR + "/assets/" + ASSET
            + " && cp " + tmp_files["index.html"] + " " + FRONTEND_DIR + "/index.html"
        )
        rc, out, err = run_remote(client, "sh -c " + shlex.quote(copy_cmd), sudo=True, sudo_password=cfg.sudo_password, timeout=60)
        if rc != 0:
            raise SystemExit(f"Copy failed: rc={rc}, out={out[:900]!r}, err={err[:900]!r}")
        print("COPY_OK")

        verify_cmd = (
            f"grep -o 'index-AGFIX[0-9]*\\.js' {FRONTEND_DIR}/index.html | head -n 1"
        )
        rc, out, err = run_remote(client, verify_cmd, timeout=30)
        lines = [line.strip() for line in out.strip().splitlines() if line.strip()]
        if rc != 0 or lines != [ASSET]:
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
        print("DEPLOY_OK AGFIX132", ASSET)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
