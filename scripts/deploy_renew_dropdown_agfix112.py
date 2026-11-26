"""Deploy AGFIX112: renewal sport dropdown + blank sessions field."""

from __future__ import annotations

import argparse
import json
import shlex
import subprocess
from pathlib import Path

from common import (
    FRONTEND_DIR,
    RemoteConfig,
    connect,
    run_remote,
    upload,
)
from make_backup import create_backup

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "local" / "live-current-AGFIX111.js"
OUTPUT = ROOT / "local" / "index-AGFIX112.js"
INDEX = ROOT / "local" / "agfix112-index.html"
ASSET = "index-AGFIX112.js"
OLD_ASSET = "index-AGFIX111.js"


def fa(text: str) -> str:
    """Return a JS double-quoted string with literal UTF-8 Persian."""
    return json.dumps(text, ensure_ascii=False)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_ASSERT failed for {label}: expected 1, got {count}")
    return text.replace(old, new, 1)


def build_bundle() -> str:
    text = SOURCE.read_bytes().decode("utf-8")

    text = replace_once(
        text,
        '[agSport,setAgSport]=p.useState(""),[agCustomSport,setAgCustomSport]=p.useState(""),[agPrivate,setAgPrivate]=p.useState(!1),',
        '[agSport,setAgSport]=p.useState(""),[agRenewSessions,setAgRenewSessions]=p.useState(""),[agPrivate,setAgPrivate]=p.useState(!1),',
        "renewal sessions state",
    )

    text = replace_once(
        text,
        'setAgSport(agSelSport),setAgCustomSport(""),setAgPrivate(',
        'setAgSport(agSelSport),setAgRenewSessions(""),setAgPrivate(',
        "renewal open defaults",
    )

    text = replace_once(
        text,
        'start_date:_s,end_date:agEndJ?Z:void 0,sport:(agCustomSport||"").trim()||agSport,private:agPrivate,coach_name:agCoachName,paid:agPaid});',
        'start_date:_s,end_date:agEndJ?Z:void 0,total_sessions:agRenewSessions===""?void 0:Number(agRenewSessions),sport:agSport,private:agPrivate,coach_name:agCoachName,paid:agPaid});',
        "renewal submit sessions",
    )

    old_sport_block = (
        'n.jsxs("div",{children:[n.jsx("label",{className:"text-xs block mb-1",style:{color:"var(--text-secondary)"},children:'
        + fa("رشته جدید (اختیاری — اگر عضو تغییر رشته داده است)")
        + '}),n.jsx("input",{className:"input-field",value:agCustomSport,onChange:C=>{setAgCustomSport(C.target.value);if(C.target.value.trim())setAgSport("custom")},placeholder:'
        + fa("نام رشته جدید")
        + '})]})'
    )
    new_sport_block = (
        'n.jsxs("div",{children:[n.jsx("label",{className:"text-xs block mb-1",style:{color:"var(--text-secondary)"},children:'
        + fa("رشته ورزشی / تغییر رشته")
        + '}),n.jsx("select",{className:"input-field",value:agSport,onChange:C=>{const agV=C.target.value;setAgSport(agV);D(agFee(agV))},children:[n.jsx("option",{value:"",children:'
        + fa("انتخاب رشته")
        + '},"empty"),Kn.map(K=>n.jsx("option",{value:K.id,children:K.label},K.id))]})]})'
    )
    sessions_block = (
        'n.jsxs("div",{children:[n.jsx("label",{className:"text-xs block mb-1",style:{color:"var(--text-secondary)"},children:'
        + fa("تعداد جلسات")
        + '}),n.jsx("input",{type:"number",min:0,className:"input-field",value:agRenewSessions,onChange:C=>setAgRenewSessions(C.target.value),placeholder:""})]})'
    )
    text = replace_once(
        text,
        old_sport_block,
        new_sport_block + "," + sessions_block,
        "renewal dropdown + sessions field",
    )

    if "agCustomSport" in text:
        raise SystemExit("PATCH_ASSERT failed: agCustomSport still present")
    for token in ('agRenewSessions', 'agFee(', 'agSecretaryAccounting'):
        if token not in text:
            raise SystemExit(f"PATCH_ASSERT failed: missing {token}")
    return text


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm", help="Must be exactly WRITE")
    args = parser.parse_args()
    if args.confirm != "WRITE":
        raise SystemExit("--confirm WRITE is required")

    bundle = build_bundle()
    OUTPUT.write_bytes(bundle.encode("utf-8"))
    check = subprocess.run(["node", "--check", str(OUTPUT)], capture_output=True, text=True)
    if check.returncode != 0:
        raise SystemExit("node --check failed:\n" + check.stderr[:4000])
    print("NODE_CHECK_OK", OUTPUT, len(bundle.encode("utf-8")))

    html = (
        '<!doctype html>\n'
        '<html lang="fa" dir="rtl">\n'
        '  <head>\n'
        '    <meta charset="UTF-8" />\n'
        '    <link rel="icon" type="image/png" href="/v5.png" />\n'
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n'
        '    <title>آلفا جیم | مدیریت باشگاه</title>\n'
        '    <meta name="theme-color" content="#f4f6fb" />\n'
        f'    <script type="module" crossorigin src="/assets/{ASSET}"></script>\n'
        '    <link rel="stylesheet" crossorigin href="/assets/index-DMwX9_UD.css">\n'
        '    <link rel="stylesheet" href="/assets/dark-fix.css">\n'
        '    <link rel="stylesheet" href="/assets/v40-modal-fix.css">\n'
        '  </head>\n'
        '  <body>\n'
        '    <div id="root"></div>\n'
        '  </body>\n'
        '</html>\n'
    )
    INDEX.write_text(html, encoding="utf-8")

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        sftp = client.open_sftp()
        current_html = sftp.open(FRONTEND_DIR + "/index.html").read().decode("utf-8")
        if OLD_ASSET not in current_html:
            raise SystemExit("Refusing deploy: live index.html is not on expected AGFIX111")
        live_asset = sftp.open(FRONTEND_DIR + "/assets/" + OLD_ASSET).read()
        if live_asset.decode("utf-8") != SOURCE.read_bytes().decode("utf-8"):
            raise SystemExit("Refusing deploy: live AGFIX111 asset changed since snapshot")
        sftp.close()

        backup = create_backup(
            client,
            "renew-dropdown-agfix112",
            persist=True,
            sudo_password=cfg.sudo_password,
        )
        print("BACKUP", json.dumps(backup, ensure_ascii=False))

        tmp_asset = "/tmp/" + ASSET
        tmp_index = "/tmp/agfix112-index.html"
        upload(client, OUTPUT, tmp_asset)
        upload(client, INDEX, tmp_index)

        copy_cmd = (
            f"grep -q '{OLD_ASSET}' {FRONTEND_DIR}/index.html "
            f"&& cp {tmp_asset} {FRONTEND_DIR}/assets/{ASSET} "
            f"&& cp {tmp_index} {FRONTEND_DIR}/index.html"
        )
        rc, out, err = run_remote(
            client,
            "sh -c " + shlex.quote(copy_cmd),
            sudo=True,
            sudo_password=cfg.sudo_password,
            timeout=60,
        )
        if rc != 0:
            raise SystemExit(f"Frontend copy failed: rc={rc}, out={out!r}, err={err!r}")

        rc, out, err = run_remote(
            client,
            f"grep -o 'index-AGFIX[0-9]*\\.js' {FRONTEND_DIR}/index.html | head -n 1",
            timeout=30,
        )
        if rc != 0 or ASSET not in out:
            raise SystemExit(f"Frontend ref verification failed: rc={rc}, out={out!r}, err={err!r}")
        print("FRONTEND_REF_OK", out.strip())
        print("DEPLOY_OK", ASSET)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
