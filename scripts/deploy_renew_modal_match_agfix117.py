"""Deploy AGFIX117: make list-renewal modal match quick renewal exactly.

- Same overlay, panel size, colours, header and inner field styling.
- First sport box is read-only and pre-filled with the member's previous sport.
- Second sport box is the dropdown used to change the sport.
"""

from __future__ import annotations

import hashlib
import json
import shlex
import subprocess
from pathlib import Path

from common import FRONTEND_DIR, RemoteConfig, connect, run_remote, upload
from make_backup import create_backup

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "local" / "index-AGFIX113.js"
OUTPUT = ROOT / "local" / "index-AGFIX117.js"
INDEX = ROOT / "local" / "agfix117-index.html"
ASSET = "index-AGFIX117.js"
OLD_ASSET = "index-AGFIX113.js"
EXPECTED_SHA = "5cb0b2ff6f6dc4624e65d2fec07edf2d41c13adb04c353523d8c5e401029488d"

START = (
    'v&&n.jsx("div",{className:"fixed inset-0 z-[60] flex items-center justify-center p-4",'
    'style:{background:"rgba(15,23,42,0.45)"},onClick:C=>C.target===C.currentTarget&&w(null),'
)
TAIL = ']})}const xm="alpha_gym_broadcast_draft"'

NEW_MODAL = '''v&&n.jsx("div",{style:{position:"fixed",inset:0,zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"rgba(2,6,23,.80)",backdropFilter:"blur(8px)"},onClick:()=>w(null),children:n.jsxs("div",{onClick:ev=>ev.stopPropagation(),style:{width:"min(560px,100%)",maxHeight:"92vh",overflow:"auto",borderRadius:24,padding:"24px",background:"linear-gradient(160deg,#111827,#0f172a)",border:"1px solid rgba(245,158,11,.35)",boxShadow:"0 30px 90px rgba(0,0,0,.60)",color:"var(--text)"},children:[n.jsxs("div",{className:"px-5 py-4 flex items-start justify-between gap-3",style:{background:"linear-gradient(135deg,rgba(59,130,246,.14),rgba(16,185,129,.08))",borderBottom:"1px solid rgba(148,163,184,.18)"},children:[n.jsxs("div",{className:"flex items-center gap-3",children:[n.jsx("div",{className:"w-10 h-10 rounded-xl flex items-center justify-center shrink-0",style:{background:"var(--accent)",color:"#fff"},children:n.jsx(Sr,{size:20})}),n.jsxs("div",{children:[n.jsx("div",{className:"text-[10px] font-semibold tracking-wider",style:{color:"var(--accent)"},children:"تمدید عضویت"}),n.jsx("h2",{className:"text-xl font-extrabold mt-0.5",style:{color:"var(--text)",letterSpacing:"-0.02em"},children:"تأیید تمدید"}),n.jsx("p",{className:"text-xs mt-1",style:{color:"var(--text-muted)"},children:[v.full_name," · کد ",v.member_code||"—"]})]})]}),n.jsx("button",{type:"button",onClick:()=>w(null),className:"p-1.5 rounded-lg hover:opacity-80",style:{color:"var(--text-muted)"},children:n.jsx(ct,{size:18})})]}),n.jsxs("div",{style:{marginTop:14},children:z?n.jsxs("div",{style:{padding:16,borderRadius:16,background:"rgba(16,185,129,.10)",border:"1px solid rgba(16,185,129,.35)"},children:[n.jsx("p",{style:{fontSize:13,fontWeight:800,color:"#6ee7b7"},children:"تمدید ثبت شد — فیش آنلاین:"}),n.jsxs("a",{href:z,target:"_blank",rel:"noreferrer",style:{display:"block",marginTop:10,fontSize:12,color:"var(--accent)",wordBreak:"break-all"},children:[n.jsx(Vi,{size:12})," ",z]}),n.jsx("button",{type:"button",className:"btn-primary",style:{width:"100%",padding:"12px",marginTop:14},onClick:()=>w(null),children:"بستن"})]}):n.jsxs(n.Fragment,{children:[n.jsxs("div",{children:[n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"رشته ورزشی"}),n.jsx("input",{className:"input-field",value:String(v.sport||((v.sports||[])[0]||{}).sport||""),readOnly:!0,style:{marginTop:6,width:"100%",opacity:.8}})]}),n.jsxs("div",{style:{marginTop:8},children:[n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"تغییر رشته (اختیاری)"}),n.jsx("select",{className:"input-field",value:agSport,onChange:C=>{const agV=C.target.value;setAgSport(agV);D(agFee(agV))},style:{marginTop:6,width:"100%"},children:[n.jsx("option",{value:"",children:"انتخاب رشته"},"empty"),Kn.map(K=>n.jsx("option",{value:K.id,children:K.label},K.id))]})]}),n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:14},children:[n.jsx(Jt,{value:agStartJ,onChange:C=>setAgStartJ(C),allowClear:!0,placeholder:"تاریخ شروع",required:!0}),n.jsx(Jt,{value:agEndJ,onChange:C=>setAgEndJ(C),min:agStartJ,allowClear:!0,placeholder:"تاریخ پایان",required:!0})]}),n.jsx("p",{style:{marginTop:8,fontSize:12,color:"var(--text-muted)"},children:["پایان جدید: ",n.jsx("strong",{style:{color:"var(--success)"},children:agEndJ?Je(et(agEndJ)):Je(uf(v.end_date,j))})]}),n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:14},children:[n.jsxs("div",{children:[n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"تعداد جلسات"}),n.jsx("input",{type:"number",min:0,className:"input-field",value:agRenewSessions,onChange:C=>setAgRenewSessions(C.target.value),style:{marginTop:6,width:"100%"}})]}),n.jsxs("div",{children:[n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"مبلغ (تومان)"}),n.jsx("input",{type:"number",className:"input-field",value:M,onChange:C=>D(Number(C.target.value)||0),style:{marginTop:6,width:"100%"}})]})]}),n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:12},children:[n.jsxs("label",{style:{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--text-secondary)"},children:[n.jsx("input",{type:"checkbox",checked:agPrivate,onChange:C=>setAgPrivate(C.target.checked)}),"کلاس خصوصی"]}),n.jsxs("div",{children:[n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"مربی خصوصی (اختیاری)"}),n.jsx("input",{className:"input-field",value:agCoachName,onChange:C=>setAgCoachName(C.target.value),placeholder:"نام مربی",style:{marginTop:6,width:"100%"}})]})]}),n.jsxs("div",{style:{marginTop:12},children:[n.jsx("label",{style:{display:"block",fontSize:12,color:"var(--text-secondary)",marginBottom:6},children:"وضعیت پرداخت"}),n.jsx("select",{className:"input-field",value:agPaid?"paid":"unpaid",onChange:C=>setAgPaid(C.target.value==="paid"),style:{width:"100%"},children:[n.jsx("option",{value:"paid",children:"پرداخت شد"}),n.jsx("option",{value:"unpaid",children:"پرداخت نشد"})]})]}),n.jsxs("div",{style:{marginTop:12},children:[n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"روش پرداخت"}),n.jsxs("select",{className:"input-field",value:rpm,onChange:C=>setRpm(C.target.value),style:{marginTop:6,width:"100%"},children:payOpts.map(g=>n.jsx("option",{value:g[0],children:g[1]},g[0]))})]}),n.jsxs("div",{style:{marginTop:12},children:[n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"کد تخفیف (اختیاری)"}),n.jsx("input",{className:"input-field",dir:"ltr",value:agDisc,onChange:C=>setAgDisc(C.target.value.toUpperCase()),placeholder:"AG-XXXXX",style:{marginTop:6,width:"100%"}}),n.jsx("p",{style:{marginTop:6,fontSize:11,color:"var(--text-muted)"},children:"تخفیف روی کل فاکتور به\u200cجز بیمه اعمال می\u200cشود"})]}),U&&n.jsx("p",{style:{marginTop:12,fontSize:13,color:"var(--danger)"},children:U}),n.jsxs("div",{style:{marginTop:16,display:"flex",gap:10},children:[n.jsx("button",{type:"button",disabled:E,onClick:S,className:"btn-primary",style:{flex:1,padding:"12px",opacity:E?.5:1},children:E?"در حال ثبت…":"تأیید تمدید"}),n.jsx("button",{type:"button",onClick:()=>w(null),style:{padding:"12px 16px",borderRadius:12,border:"1px solid rgba(148,163,184,.25)",background:"rgba(15,23,42,.7)",color:"var(--text-secondary)",cursor:"pointer"},children:"انصراف"})]})]})})]})})'''


def build_bundle() -> str:
    raw = SOURCE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != EXPECTED_SHA:
        raise SystemExit("Source snapshot hash mismatch")
    text = raw.decode("utf-8").replace("\r\n", "\n")
    if text.count(START) != 1:
        raise SystemExit(f"Modal start assertion failed: {text.count(START)}")
    if text.count(TAIL) != 1:
        raise SystemExit(f"Modal tail assertion failed: {text.count(TAIL)}")
    start = text.index(START)
    end = text.index(TAIL)
    if end <= start:
        raise SystemExit("Modal bounds assertion failed")
    old_modal = text[start:end]
    for token in (
        'className:"fixed inset-0 z-[60]',
        "رشته ورزشی / تغییر رشته",
        "agRenewSessions",
        "payOpts.map",
    ):
        if token not in old_modal:
            raise SystemExit(f"Old modal assertion failed: missing {token}")
    text = text[:start] + NEW_MODAL + text[end:]
    for token in (
        'width:"min(560px,100%)"',
        "readOnly:!0",
        "تغییر رشته (اختیاری)",
        "agRenewSessions",
        "fv(v.id",
        "agSecretaryAccounting",
        "agFixSessions",
    ):
        if token not in text:
            raise SystemExit(f"New bundle assertion failed: missing {token}")
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
    import argparse

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
            raise SystemExit("Refusing deploy: live index.html is not on expected AGFIX113")
        live = sftp.open(FRONTEND_DIR + "/assets/" + OLD_ASSET).read()
        if hashlib.sha256(live).hexdigest() != EXPECTED_SHA:
            raise SystemExit("Refusing deploy: live AGFIX113 asset changed since snapshot")
        sftp.close()

        backup = create_backup(
            client, "renew-modal-match-agfix117", persist=True,
            sudo_password=cfg.sudo_password,
        )
        print("BACKUP", json.dumps(backup, ensure_ascii=False))

        tmp_asset = "/tmp/" + ASSET
        tmp_index = "/tmp/agfix117-index.html"
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
