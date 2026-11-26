"""Deploy AGFIX110: blank numeric defaults and sport-aware amount/ sport changes."""

from __future__ import annotations

import argparse
import json
import shlex
import subprocess
from pathlib import Path

from common import (
    FRONTEND_DIR,
    RemoteConfig,
    assert_readonly_command,
    connect,
    run_remote,
    upload,
)
from make_backup import create_backup

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "local" / "live-current-index-AGFIX107.js"
OUTPUT = ROOT / "local" / "index-AGFIX110.js"
INDEX = ROOT / "local" / "agfix110-index.html"
ASSET = "index-AGFIX110.js"
OLD_ASSET = "index-AGFIX107.js"


def esc(text: str) -> str:
    """Return a double-quoted JS string with literal UTF-8 Persian text."""
    return json.dumps(text, ensure_ascii=False)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_ASSERT failed for {label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)


def build_bundle() -> str:
    text = SOURCE.read_bytes().decode("utf-8")

    text = replace_once(
        text,
        r'value:g.total_sessions??0,onChange:he=>{const sv=Math.max(0,Number(he.target.value)||0);',
        r'value:g.total_sessions??"",onChange:he=>{const agRaw=he.target.value;const sv=agRaw===""?"":Math.max(0,Number(agRaw)||0);',
        "blank total sessions",
    )

    text = replace_once(
        text,
        'function Yn(s){const a=Kn.find(o=>o.id===s);return a?a.label:s||"—"}',
        'function agFee(s){const v=String(s||"").trim();const ex=Kn.find(o=>o.id===v||o.label===v);if(ex)return ex.monthly_fee;const rk=Kn.map(o=>({o,sc:Ei(v,o.id)})).sort((x,y)=>y.sc-x.sc)[0];return rk&&rk.sc>=50?rk.o.monthly_fee:0}'
        + 'function Yn(s){const a=Kn.find(o=>o.id===s);return a?a.label:s||"—"}',
        "price helper",
    )

    text = replace_once(
        text,
        r'[agSport,setAgSport]=p.useState(""),[agPrivate,setAgPrivate]=p.useState(!1),',
        r'[agSport,setAgSport]=p.useState(""),[agCustomSport,setAgCustomSport]=p.useState(""),[agPrivate,setAgPrivate]=p.useState(!1),',
        "renewal custom sport state",
    )

    text = replace_once(
        text,
        r'oe=C=>{w(C),$(1),D(Number(C.monthly_fee)||0),P(""),setAgDisc(""),setAgStartJ(null),setAgEndJ(null),setAgSport(String(C.sport||((C.sports||[])[0]||{}).sport||"")),',
        r'oe=C=>{const agSelSport=String(C.sport||((C.sports||[])[0]||{}).sport||"");w(C),$(1),D(agFee(agSelSport)),P(""),setAgDisc(""),setAgStartJ(null),setAgEndJ(null),setAgSport(agSelSport),setAgCustomSport(""),',
        "renewal amount by sport",
    )

    custom_renew = (
        r'n.jsxs("div",{children:['
        r'n.jsx("label",{className:"text-xs block mb-1",style:{color:"var(--text-secondary)"},children:'
        + esc("رشته جدید (اختیاری — اگر عضو تغییر رشته داده است)")
        + r'}),'
        r'n.jsx("input",{className:"input-field",value:agCustomSport,onChange:C=>{setAgCustomSport(C.target.value);if(C.target.value.trim())setAgSport("custom")},placeholder:'
        + esc("نام رشته جدید")
        + r'})]})'
    )
    text = replace_once(
        text,
        r'n.jsx("select",{className:"input-field",value:agSport,onChange:C=>setAgSport(C.target.value),children:Kn.map(K=>n.jsx("option",{value:K.id,children:K.label},K.id))})]}),',
        r'n.jsx("select",{className:"input-field",value:agSport,onChange:C=>{const agV=C.target.value;setAgSport(agV);D(agFee(agV))},children:Kn.map(K=>n.jsx("option",{value:K.id,children:K.label},K.id))})]}),'
        + custom_renew
        + r',',
        "renewal sport select + custom input",
    )

    text = replace_once(
        text,
        r'sport:agSport,private:agPrivate,',
        r'sport:(agCustomSport||"").trim()||agSport,private:agPrivate,',
        "renewal submit custom sport",
    )

    text = replace_once(
        text,
        r'[agFixSessions,setAgFixSessions]=p.useState(0)',
        r'[agFixSessions,setAgFixSessions]=p.useState("")',
        "correction sessions state",
    )
    text = replace_once(
        text,
        r'[agFixUsed,setAgFixUsed]=p.useState(0)',
        r'[agFixUsed,setAgFixUsed]=p.useState("")',
        "correction used state",
    )
    text = replace_once(
        text,
        r'setAgFixSessions(Number(((Z&&Z.sports&&Z.sports[0])||{}).total_sessions||0)),setAgFixUsed(Number(((Z&&Z.sports&&Z.sports[0])||{}).used_sessions||0))',
        r'setAgFixSessions(Number(((Z&&Z.sports&&Z.sports[0])||{}).total_sessions||0)||""),setAgFixUsed(Number(((Z&&Z.sports&&Z.sports[0])||{}).used_sessions||0)||"")',
        "correction prefills",
    )
    text = replace_once(
        text,
        r'onChange:agE=>setAgFixSessions(Number(agE.target.value||0))',
        r'onChange:agE=>setAgFixSessions(agE.target.value)',
        "correction sessions input",
    )
    text = replace_once(
        text,
        r'onChange:agE=>setAgFixUsed(Number(agE.target.value||0))',
        r'onChange:agE=>setAgFixUsed(agE.target.value)',
        "correction used input",
    )

    text = replace_once(
        text,
        r'total_sessions:12,amount:0,payment_method:"pos",is_private:!1,coach_name:"",payment_status:"paid"})',
        r'total_sessions:"",sport_new:"",amount:0,add_new_sport:!1,payment_method:"pos",is_private:!1,coach_name:"",payment_status:"paid"})',
        "quick initial form",
    )

    text = replace_once(
        text,
        r'total_sessions:Number(agSp&&agSp.total_sessions||12)||12,amount:0,payment_method:"pos",',
        r'total_sessions:Number(agSp&&agSp.total_sessions)||"",sport_new:"",amount:agFee(String(agSp?agSp.sport||"":(agHint||""))),add_new_sport:!1,payment_method:"pos",',
        "quick prefill and price",
    )

    text = replace_once(
        text,
        r'payment_status:agQuickForm.payment_status==="unpaid"?"unpaid":"paid",is_private:!!agQuickForm.is_private,',
        r'payment_status:agQuickForm.payment_status==="unpaid"?"unpaid":"paid",add_new_sport:!!agQuickForm.add_new_sport,is_private:!!agQuickForm.is_private,',
        "quick submit add flag",
    )

    quick_select_old = (
        'n.jsx("select",{className:"input-field",value:agQuickForm.sport_id||"",onChange:agE=>{const agId=Number(agE.target.value);const agSp=(agQuick.sports||[]).find(agX=>agX.id===agId);agSetQuickForm(agF=>({...agF,sport_id:agId,sport:agSp?agSp.sport:agF.sport,total_sessions:Number(agSp&&agSp.total_sessions||agF.total_sessions||12)}))},style:{marginTop:6,width:"100%"},children:(agQuick.sports||[]).map(agS=>n.jsxs("option",{value:agS.id,children:[agS.sport," (باقی ",Math.max(0,Number(agS.total_sessions||0)-Number(agS.used_sessions||0)),")"]},agS.id))})'
    )
    quick_select_new = (
        r'n.jsx("select",{className:"input-field",value:agQuickForm.sport_id||"",onChange:agE=>{' 
        r'const agV=agE.target.value;'
        r'if(agV.startsWith("sp:")){const agId=Number(agV.slice(3));const agSp=(agQuick.sports||[]).find(agX=>agX.id===agId);agSetQuickForm(agF=>({...agF,sport_id:agId,sport:agSp?agSp.sport:agF.sport,sport_new:"",total_sessions:Number(agSp&&agSp.total_sessions)||"",add_new_sport:!1}))}'
        r'else if(agV.startsWith("cat:")){const agCat=Kn.find(agX=>agX.id===agV.slice(4));agSetQuickForm(agF=>({...agF,sport_id:0,sport:agCat?agCat.label:agF.sport,sport_new:"",total_sessions:"",amount:agCat?agCat.monthly_fee:agF.amount,add_new_sport:!0}))}'
        r'else{agSetQuickForm(agF=>({...agF,sport_id:0,sport:"",sport_new:"",add_new_sport:!1}))}'
        r'},style:{marginTop:6,width:"100%"},children:['
        + r'n.jsx("option",{value:"",children:' + esc("انتخاب رشته") + r'},"empty"),'
        + '(agQuick.sports||[]).map(agS=>n.jsxs("option",{value:"sp:"+agS.id,children:[agS.sport," (باقی ",Math.max(0,Number(agS.total_sessions||0)-Number(agS.used_sessions||0)),")"]},"sp"+agS.id)),'
        + r'Kn.map(agK=>n.jsx("option",{value:"cat:"+agK.id,children:agK.label},"cat"+agK.id)),'
        + r'n.jsx("option",{value:"custom",children:' + esc("رشته جدید / تغییر رشته") + r'},"custom")'
        + r']})'
    )
    text = replace_once(text, quick_select_old, quick_select_new, "quick sport select")

    quick_custom = (
        r'n.jsxs("div",{style:{marginTop:8},children:['
        r'n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:'
        + esc("رشته جدید (اختیاری — برای تغییر رشته یا رشته دلخواه)")
        + r'}),'
        r'n.jsx("input",{className:"input-field",value:agQuickForm.sport_new||"",onChange:agE=>agSetQuickForm(agF=>({...agF,sport_new:agE.target.value,sport:agE.target.value,sport_id:0,add_new_sport:!!agE.target.value.trim()})),placeholder:'
        + esc("نام رشته جدید")
        + r',style:{marginTop:6,width:"100%"}})]})'
    )
    marker = r'}),n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:14},children:[n.jsx(Jt,{value:agQuickForm.start_date'
    text = replace_once(
        text,
        marker,
        r'})' + r',' + quick_custom + r',n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:14},children:[n.jsx(Jt,{value:agQuickForm.start_date',
        "quick custom sport input",
    )

    text = replace_once(
        text,
        r'onChange:agE=>agSetQuickForm(agF=>({...agF,total_sessions:Number(agE.target.value||0)}))',
        r'onChange:agE=>agSetQuickForm(agF=>({...agF,total_sessions:agE.target.value}))',
        "quick sessions input",
    )

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
    print("NODE_CHECK_OK", OUTPUT, len(bundle))

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
            raise SystemExit("Refusing deploy: live index.html is not on the expected AGFIX109 ref")
        sftp.close()

        backup = create_backup(client, "form-fields-agfix110", persist=True,
                               sudo_password=cfg.sudo_password)
        print("BACKUP", json.dumps(backup, ensure_ascii=False))

        tmp_asset = f"/tmp/{ASSET}"
        tmp_index = "/tmp/agfix110-index.html"
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
