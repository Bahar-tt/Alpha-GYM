"""Deploy AGFIX118: quick-renew previous sport readonly + change dropdown.

- First sport field is read-only and keeps the member's previous sport.
- Second field is a dropdown for changing sport (Kn categories).
- Choosing a bodybuilding category pre-fills 8/16/24 sessions; the sessions
  field stays editable for every renewal (e.g. 12 this month, 8 next month).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shlex
import subprocess
from pathlib import Path

from common import FRONTEND_DIR, RemoteConfig, connect, run_remote, upload
from make_backup import create_backup

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "local" / "index-AGFIX117.js"
OUTPUT = ROOT / "local" / "index-AGFIX118.js"
INDEX = ROOT / "local" / "agfix118-index.html"
ASSET = "index-AGFIX118.js"
OLD_ASSET = "index-AGFIX117.js"
EXPECTED_SHA = "ef9bb3c7469129531e2996e49175f139ab80c802ab65722c69bad4b292c4318a"

OLD_INITIAL = (
    ',[agQuickForm,agSetQuickForm]=p.useState({sport:"",sport_id:null,'
    'start_date:"",expiry_date:"",total_sessions:"",sport_new:"",amount:0,'
    'add_new_sport:!1,payment_method:"pos",is_private:!1,coach_name:"",payment_status:"paid"})'
)
NEW_INITIAL = (
    ',[agQuickForm,agSetQuickForm]=p.useState({sport:"",sport_id:null,'
    'start_date:"",expiry_date:"",total_sessions:"",sport_new:"",amount:0,'
    'add_new_sport:!1,payment_method:"pos",is_private:!1,coach_name:"",payment_status:"paid",'
    'change_sport:"",orig_sport:"",orig_sport_id:null,orig_total_sessions:"",orig_amount:0})'
)

OLD_OPEN_TAIL = (
    ',coach_name:String((agSp||{}).private_coach_name||(agSp||{}).coach_name||""),payment_status:"paid"})'
)
NEW_OPEN_TAIL = (
    ',coach_name:String((agSp||{}).private_coach_name||(agSp||{}).coach_name||""),payment_status:"paid",'
    'change_sport:"",orig_sport:agSp?agSp.sport||"":(agHint||""),'
    'orig_sport_id:agSp?agSp.id:null,orig_total_sessions:Number(agSp&&agSp.total_sessions)||"",'
    'orig_amount:agFee(String(agSp?agSp.sport||"":(agHint||"")))})'
)

OLD_SPORT_FIRST = (
    'n.jsxs("div",{style:{marginTop:14},children:[n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"رشته ورزشی"}),'
    'n.jsx("select",{className:"input-field",value:agQuickForm.sport_id||"",onChange:agE=>{const agV=agE.target.value;'
    'if(agV.startsWith("sp:")){const agId=Number(agV.slice(3));const agSp=(agQuick.sports||[]).find(agX=>agX.id===agId);'
    'agSetQuickForm(agF=>({...agF,sport_id:agId,sport:agSp?agSp.sport:agF.sport,sport_new:"",total_sessions:Number(agSp&&agSp.total_sessions)||"",add_new_sport:!1}))}'
    'else if(agV.startsWith("cat:")){const agCat=Kn.find(agX=>agX.id===agV.slice(4));'
    'agSetQuickForm(agF=>({...agF,sport_id:0,sport:agCat?agCat.label:agF.sport,sport_new:"",total_sessions:"",amount:agCat?agCat.monthly_fee:agF.amount,add_new_sport:!0}))}'
    'else{agSetQuickForm(agF=>({...agF,sport_id:0,sport:"",sport_new:"",add_new_sport:!1}))}},style:{marginTop:6,width:"100%"},'
    'children:[n.jsx("option",{value:"",children:"انتخاب رشته"},"empty"),'
    '(agQuick.sports||[]).map(agS=>n.jsxs("option",{value:"sp:"+agS.id,children:[agS.sport," (باقی ",'
    'Math.max(0,Number(agS.total_sessions||0)-Number(agS.used_sessions||0)),")"]},"sp"+agS.id)),'
    'Kn.map(agK=>n.jsx("option",{value:"cat:"+agK.id,children:agK.label},"cat"+agK.id)),'
    'n.jsx("option",{value:"custom",children:"رشته جدید / تغییر رشته"},"custom")]})]})'
)
NEW_SPORT_FIRST = (
    'n.jsxs("div",{style:{marginTop:14},children:[n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"رشته ورزشی"}),'
    'n.jsx("input",{className:"input-field",value:String(agQuickForm.orig_sport||agQuickForm.sport||""),'
    'readOnly:!0,style:{marginTop:6,width:"100%",opacity:.8}})]})'
)

OLD_SPORT_SECOND = (
    'n.jsxs("div",{style:{marginTop:8},children:[n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"رشته جدید (اختیاری — برای تغییر رشته یا رشته دلخواه)"}),'
    'n.jsx("input",{className:"input-field",value:agQuickForm.sport_new||"",'
    'onChange:agE=>agSetQuickForm(agF=>({...agF,sport_new:agE.target.value,sport:agE.target.value,sport_id:0,add_new_sport:!!agE.target.value.trim()})),'
    'placeholder:"نام رشته جدید",style:{marginTop:6,width:"100%"}})]})'
)
NEW_SPORT_SECOND = (
    'n.jsxs("div",{style:{marginTop:8},children:[n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"تغییر رشته (اختیاری)"}),'
    'n.jsx("select",{className:"input-field",value:agQuickForm.change_sport||"",onChange:agE=>{const agV=agE.target.value;'
    'if(!agV)agSetQuickForm(agF=>({...agF,change_sport:"",sport:agF.orig_sport||"",sport_id:agF.orig_sport_id||null,'
    'total_sessions:agF.orig_total_sessions||"",amount:agF.orig_amount||0,add_new_sport:!1,sport_new:""}));'
    'else{const agCat=Kn.find(agX=>agX.id===agV),agN=agCat&&/bodybuilding_(\\d+)$/.exec(agCat.id);'
    'agSetQuickForm(agF=>({...agF,change_sport:agV,sport:agCat?agCat.label:agF.sport,sport_id:0,sport_new:"",'
    'total_sessions:agN?Number(agN[1]):"",amount:agCat?agCat.monthly_fee:agF.amount,add_new_sport:!0}))}},'
    'style:{marginTop:6,width:"100%"},children:[n.jsx("option",{value:"",children:"همان رشته فعلی (بدون تغییر)"},"keep"),'
    'Kn.map(agK=>n.jsx("option",{value:agK.id,children:agK.label},"cat"+agK.id))]})]})'
)

OLD_SESSIONS = (
    'n.jsxs("div",{children:[n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"تعداد جلسات"}),'
    'n.jsx("input",{type:"number",className:"input-field",value:agQuickForm.total_sessions,'
    'onChange:agE=>agSetQuickForm(agF=>({...agF,total_sessions:agE.target.value})),style:{marginTop:6,width:"100%"}})]})'
)
NEW_SESSIONS = (
    'n.jsxs("div",{children:[n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"تعداد جلسات (قابل تغییر هر تمدید)"}),'
    'n.jsx("input",{type:"number",min:0,className:"input-field",value:agQuickForm.total_sessions,'
    'onChange:agE=>agSetQuickForm(agF=>({...agF,total_sessions:agE.target.value})),'
    'placeholder:"مثلاً 12",style:{marginTop:6,width:"100%"}})]})'
)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_ASSERT failed for {label}: expected 1, got {count}")
    return text.replace(old, new, 1)


def build_bundle() -> str:
    raw = SOURCE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != EXPECTED_SHA:
        raise SystemExit("Source snapshot hash mismatch")
    text = raw.decode("utf-8").replace("\r\n", "\n")
    text = replace_once(text, OLD_INITIAL, NEW_INITIAL, "quick form initial state")
    text = replace_once(text, OLD_OPEN_TAIL, NEW_OPEN_TAIL, "quick open defaults")
    text = replace_once(text, OLD_SPORT_FIRST, NEW_SPORT_FIRST, "quick previous sport readonly")
    text = replace_once(text, OLD_SPORT_SECOND, NEW_SPORT_SECOND, "quick sport change dropdown")
    text = replace_once(text, OLD_SESSIONS, NEW_SESSIONS, "quick sessions field")
    for token in (
        'value:String(agQuickForm.orig_sport||agQuickForm.sport||"")',
        'value:agQuickForm.change_sport||""',
        '/bodybuilding_(\\d+)$/',
        'orig_total_sessions',
        'add_new_sport:!!agQuickForm.add_new_sport',
        'sport:agQuickForm.sport',
        'agSecretaryAccounting',
        'agFixSessions',
    ):
        if token not in text:
            raise SystemExit(f"BUNDLE_ASSERT failed: missing {token}")
    if 'value:agQuickForm.sport_new' in text:
        raise SystemExit("BUNDLE_ASSERT failed: custom sport text field still present")
    return text


def index_html() -> str:
    return (
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
    print("FRONTEND_NODE_CHECK_OK", OUTPUT, len(bundle.encode("utf-8")))
    INDEX.write_text(index_html(), encoding="utf-8")

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        sftp = client.open_sftp()
        html = sftp.open(FRONTEND_DIR + "/index.html").read().decode("utf-8")
        if OLD_ASSET not in html:
            raise SystemExit("Refusing deploy: live index.html is not on expected AGFIX117")
        live = sftp.open(FRONTEND_DIR + "/assets/" + OLD_ASSET).read()
        if hashlib.sha256(live).hexdigest() != EXPECTED_SHA:
            raise SystemExit("Refusing deploy: live AGFIX117 asset changed since snapshot")
        sftp.close()

        backup = create_backup(
            client, "quick-renew-sport-fields-agfix118", persist=True,
            sudo_password=cfg.sudo_password,
        )
        print("BACKUP", json.dumps(backup, ensure_ascii=False))

        tmp_asset = "/tmp/" + ASSET
        tmp_index = "/tmp/agfix118-index.html"
        upload(client, OUTPUT, tmp_asset)
        upload(client, INDEX, tmp_index)
        copy_cmd = (
            f"grep -q '{OLD_ASSET}' {FRONTEND_DIR}/index.html "
            f"&& cp {tmp_asset} {FRONTEND_DIR}/assets/{ASSET} "
            f"&& cp {tmp_index} {FRONTEND_DIR}/index.html"
        )
        rc, out, err = run_remote(
            client, "sh -c " + shlex.quote(copy_cmd), sudo=True,
            sudo_password=cfg.sudo_password, timeout=60,
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
