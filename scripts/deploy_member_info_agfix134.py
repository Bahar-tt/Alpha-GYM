"""Deploy AGFIX136: flag members with missing/abnormal phone or birthday.

Rules (per owner):
- phone: empty, '0', equal to member_code (placeholder), or invalid format
  (valid: 09xxxxxxxxx mobile or 0xxxxxxxxxx landline) -> needs completion.
- birthday: empty/'0' -> missing; bare 1-2 digit number outside 6..70 -> abnormal;
  full Jalali (13xx) or Gregorian (19xx) date whose age is outside 6..70 -> abnormal.
  (placeholder 1310/01/01 -> age 95 -> flagged; two-digit year alone is fine if in range)

Surface:
- dashboard banner panel (top) listing flagged members with quick edit; shows on
  every login until each member is fixed (data-driven, no localStorage).
- on the scanner page, when a member checks in and is flagged, the quick-edit
  dialog opens automatically for the member currently present.
Quick edit saves phone + birthday via PUT /members/:id (partial, untouched fields kept).
Identical for secretary and manager (no role gating).
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

FRONT_SOURCE = LOCAL / "index-AGFIX135.js"
FRONT_OUTPUT = LOCAL / "index-AGFIX136.js"
FRONT_INDEX_SOURCE = LOCAL / "agfix135-index.html"
FRONT_INDEX = LOCAL / "agfix136-index.html"

ASSET = "index-AGFIX136.js"
OLD_ASSET = "index-AGFIX135.js"

EXPECTED = {
    "server.js": "d0131cf26f84b293e30826d03e32a86709d7929296625f4f618358f81cdb1d60",
    "personnelAttendance.js": "6dc263007578c87d307c445d35c5a0b5eb202b481eacbc84e8818c32d76f7e3c",
    "attendanceScan.js": "bc3e83601340fe4daf086ab04d96193f2cc2aecc8385ce03065d0f357bc3d869",
    "userApiGuards.js": "035a22cfb1b3d45f40a672f6530981131bbedb04a2acc5e4f7980bab9eeff568",
    OLD_ASSET: "4e247fd08676ebf907a7958fcab9c08e4b6322a92deecdf0721abd8577bbf2f9",
    "index.html": "76d86e07eee34d5e5774e465d58bf070098b11ba0997842c3b39c584ddc5e834",
}

HELPERS = r'''function agBirthIssue(x){const s=String(x==null?"":x).trim();if(!s||s==="0")return "تاریخ تولد ثبت نشده";const parts=s.split(/[\/\-.\s]+/).filter(Boolean).map(Number);const jy=new Date().getFullYear()-621,gy=new Date().getFullYear();let age=null;if(parts.length>=3&&parts.every(v=>Number.isFinite(v)&&v>0)){const y=parts[0];if(y>=1200&&y<1600)age=jy-y;else if(y>=1900&&y<=gy)age=gy-y;else return "تاریخ تولد غیرطبیعی"}else if(parts.length===1&&Number.isFinite(parts[0])){const v=parts[0];if(v<100)return v<6||v>70?"تاریخ تولد غیرطبیعی":"";if(v>=1200&&v<1600)age=jy-y;else if(v>=1900&&v<=gy)age=gy-v;else return "تاریخ تولد غیرطبیعی"}else return "تاریخ تولد غیرطبیعی";return age<6||age>70?`سن ${age} خارج از بازه ۶ تا ۷۰ سال`:""}function agPhoneIssue(x,code){const raw=String(x==null?"":x).trim(),c=String(code==null?"":code).trim();if(!raw||raw==="0")return "شماره تماس ثبت نشده";if(c&&raw===c)return "شماره تماس باید واقعی باشد (کد عضویت)";if(!/^(09\d{9}|0\d{10})$/.test(raw.replace(/[\s\-]/g,"")))return "شماره تماس نامعتبر";return ""}function agInfoIssues(m){const out=[];if(!m)return out;const codes=[String(m.personnel_code==null?"":m.personnel_code).trim(),String(m.member_code==null?"":m.member_code).trim()].filter(Boolean);const raw=String(m.phone==null?"":m.phone).trim();let pErr="";if(!raw||raw==="0")pErr="شماره تماس ثبت نشده";else if(codes.indexOf(raw)>=0)pErr="شماره تماس باید واقعی باشد (کد عضویت)";else if(!/^(09\d{9}|0\d{10})$/.test(raw.replace(/[\s\-]/g,"")))pErr="شماره تماس نامعتبر";if(pErr)out.push(pErr);const bErr=agBirthIssue(m.birthday);if(bErr)out.push(bErr);return out}const agInfoSeen=new Set();let agInfoPrimed=!1,agInfoOpen=!1;function agInfoAutoCheck(rows,onOpen){try{const all=rows||[];const fresh=all.filter(r=>String(r.direction||"")!=="check_out"&&r.member_id!=null&&!agInfoSeen.has(String(r.id)));all.forEach(r=>agInfoSeen.add(String(r.id)));if(!agInfoPrimed){agInfoPrimed=!0;return}if(agInfoOpen||!onOpen||!fresh.length)return;(async()=>{for(const r of fresh){const res=await cv(String(r.member_id));const m=res&&res.data;if(m&&agInfoIssues(m).length){agInfoOpen=!0;onOpen(m);break}}})()}catch(e){}}function agInfoFixModal({member,onClose,onSaved}){const[ph,agSetPh]=p.useState(String(member.phone||"")),[bd,agSetBd]=p.useState(String(member.birthday||"")),[msg,agSetMsg]=p.useState(""),[busy,agSetBusy]=p.useState(!1);const codeA=String(member.personnel_code||"").trim(),codeB=String(member.member_code||"").trim(),is=agInfoIssues(member);const save=async()=>{const p0=String(member.phone||"").trim(),b0=String(member.birthday||"").trim(),p1=ph.trim(),b1=bd.trim();let err="";if(p1!==p0)err=agPhoneIssue(p1,codeA)||agPhoneIssue(p1,codeB);if(!err&&b1!==b0)err=agBirthIssue(b1);if(err){agSetMsg(err);return}if(p1===p0&&b1===b0){agSetMsg("تغییری برای ذخیره نیست");return}agSetBusy(!0),agSetMsg("");try{const r=await ua("/members/"+String(member.id),{phone:p1,birthday:b1});if(r&&r.error){agSetMsg(String(r.error));return}onSaved&&onSaved(),onClose&&onClose()}catch(e){agSetMsg("ذخیره ناموفق بود")}finally{agSetBusy(!1)}};return n.jsx("div",{style:{position:"fixed",inset:0,zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"rgba(2,6,23,.8)",backdropFilter:"blur(8px)"},onClick:()=>!busy&&onClose&&onClose(),children:n.jsxs("div",{onClick:e=>e.stopPropagation(),style:{width:"min(480px,100%)",maxHeight:"92vh",overflow:"auto",borderRadius:16,border:"1px solid rgba(148,163,184,.25)",background:"var(--bg-card,#0f172a)",padding:20},children:[n.jsx("h3",{style:{margin:"0 0 4px",fontSize:18,fontWeight:800,color:"var(--text)"},children:"تکمیل اطلاعات عضو"}),n.jsx("p",{style:{fontSize:12,color:"var(--text-muted)",margin:"0 0 10px"},children:[member.full_name," · کد ",member.personnel_code||member.member_code||"—"]}),is.length?n.jsx("div",{style:{marginBottom:10},children:is.map((s2,i)=>n.jsx("p",{style:{fontSize:12,color:"#b45309"},children:s2},i))}):null,n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"شماره تماس"}),n.jsx("input",{className:"input-field",dir:"ltr",value:ph,onChange:e=>agSetPh(e.target.value),placeholder:"09xxxxxxxxx",style:{margin:"4px 0 10px"}}),n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"تاریخ تولد (شمسی، مثال 1370/05/12)"}),n.jsx("input",{className:"input-field",value:bd,onChange:e=>agSetBd(e.target.value),placeholder:"1370/05/12",style:{margin:"4px 0 6px"}}),n.jsx("p",{style:{fontSize:11,color:"var(--text-muted)",marginBottom:10},children:"سن مجاز: ۶ تا ۷۰ سال — مقادیر خالی/۰ یا سن خارج از بازه غیرطبیعی است"}),msg?n.jsx("p",{style:{fontSize:12,color:"var(--danger)"},children:msg}):null,n.jsxs("div",{style:{display:"flex",gap:8,marginTop:12},children:[n.jsx("button",{type:"button",className:"btn-primary",disabled:busy,onClick:()=>void save(),style:{flex:1},children:busy?"در حال ذخیره...":"ذخیره"}),n.jsx("button",{type:"button",className:"btn-outline",disabled:busy,onClick:onClose,children:"بعداً"})]})]})})}function agInfoPanel({rows,total,q,setQ,lim,setLim,onFix}){return n.jsxs("div",{className:"panel-card p-5",style:{border:"1px solid rgba(245,158,11,.5)",background:"rgba(245,158,11,.08)"},children:[n.jsxs("div",{className:"flex items-center justify-between gap-3 mb-3",children:[n.jsxs("div",{children:[n.jsx("h3",{className:"section-title",style:{color:"#b45309"},children:"نیاز به تکمیل اطلاعات"}),n.jsx("p",{className:"text-xs mt-1",style:{color:"var(--text-muted)"},children:total.toLocaleString("fa-IR")+" عضو شماره تماس یا تاریخ تولد ناقص/غیرطبیعی دارند؛ تا اصلاح کامل، این پیام در هر ورود نمایش داده می‌شود"})]})]}),n.jsx("input",{className:"input-field",placeholder:"جستجو: نام، کد عضویت یا شماره...",value:q,onChange:e=>setQ(e.target.value),style:{marginBottom:10}}),rows.length===0?n.jsx("p",{className:"text-sm",style:{color:"var(--text-muted)"},children:"موردی یافت نشد"}):n.jsx("div",{style:{maxHeight:420,overflow:"auto",display:"flex",flexDirection:"column",gap:6},children:rows.map(m=>{const is=agInfoIssues(m);return n.jsxs("div",{className:"flex items-center justify-between gap-3 p-2.5 rounded-xl",style:{border:"1px solid var(--border)",background:"var(--bg)"},children:[n.jsxs("div",{className:"min-w-0",children:[n.jsx("p",{className:"text-sm font-semibold truncate",style:{color:"var(--text)"},children:[m.full_name," · کد ",m.personnel_code||m.member_code||"—"]}),n.jsx("p",{className:"text-xs",style:{color:"#b45309"},children:is.join(" • ")})]}),n.jsx("button",{type:"button",className:"btn-primary py-1.5 px-3 text-xs",onClick:()=>onFix(m),children:"اصلاح"})]},m.id)})}),total>rows.length?n.jsx("button",{type:"button",className:"btn-outline w-full mt-2",onClick:()=>setLim(lim+100),children:"نمایش موارد بیشتر"}):null]})}
'''


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

    # 1) helper + modal + panel components before dashboard component
    text = replace_once(
        text,
        "function Nv(){var z;const{isAdmin:s,profile:a}=Tt()",
        HELPERS + "function Nv(){var z;const{isAdmin:s,profile:a}=Tt()",
        "helpers insert",
    )
    # 2) dashboard state
    text = replace_once(
        text,
        "[v,w]=p.useState(!0);p.useEffect(()=>{j()},[s]);",
        "[v,w]=p.useState(!0),[agInfoLim,agSetInfoLim]=p.useState(50),[agInfoFixM,agSetInfoFixM]=p.useState(null),[agInfoQ,agSetInfoQ]=p.useState(\"\");p.useEffect(()=>{j()},[s]);",
        "dashboard state",
    )
    # 3) dashboard computed lists
    text = replace_once(
        text,
        'gold:{bg:"var(--gold-soft)",color:"var(--gold)"}};return n.jsxs("div",{className:"space-y-6 animate-fade-in",children:[',
        'gold:{bg:"var(--gold-soft)",color:"var(--gold)"}};const agBadInfo=(x||[]).filter(g=>agInfoIssues(g).length>0).sort((a2,b2)=>String(a2.full_name||"").localeCompare(String(b2.full_name||""))),agInfoQs=agInfoQ.trim().toLowerCase(),agInfoF=agBadInfo.filter(g=>!agInfoQs||String(g.full_name||"").toLowerCase().includes(agInfoQs)||String(g.personnel_code||"").toLowerCase().includes(agInfoQs)||String(g.phone||"").includes(agInfoQs)),agInfoShown=agInfoF.slice(0,agInfoLim);return n.jsxs("div",{className:"space-y-6 animate-fade-in",children:[',
        "dashboard computed",
    )
    # 4) dashboard banner panel at top
    text = replace_once(
        text,
        'children:[n.jsx("div",{className:"page-hero hero-lg',
        'children:[agBadInfo.length?n.jsx(agInfoPanel,{rows:agInfoShown,total:agInfoF.length,q:agInfoQ,setQ:agSetInfoQ,lim:agInfoLim,setLim:agSetInfoLim,onFix:agSetInfoFixM}):null,n.jsx("div",{className:"page-hero hero-lg',
        "dashboard panel insert",
    )
    # 5) dashboard modal at end
    text = replace_once(
        text,
        "n.jsx(_v,{members:x,loading:v})]})]})}",
        "n.jsx(_v,{members:x,loading:v})]}),agInfoFixM?n.jsx(agInfoFixModal,{member:agInfoFixM,onClose:()=>agSetInfoFixM(null),onSaved:()=>void j()}):null]})}",
        "dashboard modal insert",
    )
    # 6) scanner page state
    text = replace_once(
        text,
        "orig_amount:0}),E=et(x)",
        "orig_amount:0}),[agInfoAuto,agSetInfoAuto]=p.useState(null),E=et(x)",
        "scanner state",
    )
    # 7) scanner auto-check hook on each poll
    text = replace_once(
        text,
        "f(L[0]||null),agSetPend(",
        "f(L[0]||null),void agInfoAutoCheck(L,agSetInfoAuto),agSetPend(",
        "scanner hook",
    )
    # 8) scanner auto dialog
    text = replace_once(
        text,
        'return n.jsxs("div",{className:"space-y-6",dir:"rtl",children:[n.jsxs("div",{className:"flex flex-wrap items-start justify-between gap-4"',
        'return n.jsxs("div",{className:"space-y-6",dir:"rtl",children:[agInfoAuto?n.jsx(agInfoFixModal,{member:agInfoAuto,onClose:()=>{agInfoOpen=!1,agSetInfoAuto(null)},onSaved:()=>void k(!0)}):null,n.jsxs("div",{className:"flex flex-wrap items-start justify-between gap-4"',
        "scanner dialog insert",
    )
    for must in ["agInfoFixModal", "agInfoPanel", "agInfoAutoCheck", "agBirthIssue", "agPhoneIssue"]:
        if must not in text:
            raise SystemExit(f"FRONT_ASSERT missing {must}")
    return text


def build_index() -> str:
    text = FRONT_INDEX_SOURCE.read_text(encoding="utf-8").replace("\r\n", "\n")
    if OLD_ASSET not in text:
        raise SystemExit("Index snapshot is not on AGFIX133")
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

        backup = create_backup(client, "member-info-agfix134", persist=True, sudo_password=cfg.sudo_password)
        print("BACKUP", json.dumps(backup, ensure_ascii=False))
        stamp = backup["persisted"].rsplit("-", 1)[-1]

        for name, remote in ((ASSET, f"{FRONTEND_DIR}/assets/{ASSET}"), ("index.html", f"{FRONTEND_DIR}/index.html")):
            backup_cmd = f"if [ -f {remote} ]; then cp -p {remote} /tmp/{name}.bak-agfix134-{stamp}; fi"
            rc, out, err = run_remote(client, "sh -c " + shlex.quote(backup_cmd), sudo=True, sudo_password=cfg.sudo_password, timeout=30)
            if rc != 0:
                raise SystemExit(f"File backup failed for {name}: rc={rc}, err={err[:900]}")
        print("FILE_BACKUPS_OK 2")

        tmp_files = {}
        for name, local in outputs.items():
            stem = name.rsplit(".", 1)[0]
            tmp = f"/tmp/{stem}.agfix134-{stamp}.{'js' if name.endswith('.js') else 'html'}"
            upload(client, local, tmp)
            if name.endswith(".js"):
                rc, out, err = run_remote(client, f"node --check {tmp}", timeout=60)
                if rc != 0:
                    raise SystemExit(f"Remote node --check failed for {name}: {err[:1500]}")
            tmp_files[name] = tmp
        print("REMOTE_CHECK_OK")

        copy_cmd = (
            "grep -q 'agInfoFixModal' " + tmp_files[ASSET]
            + " && grep -q 'agInfoAutoCheck' " + tmp_files[ASSET]
            + " && cp " + tmp_files[ASSET] + " " + FRONTEND_DIR + "/assets/" + ASSET
            + " && cp " + tmp_files["index.html"] + " " + FRONTEND_DIR + "/index.html"
        )
        rc, out, err = run_remote(client, "sh -c " + shlex.quote(copy_cmd), sudo=True, sudo_password=cfg.sudo_password, timeout=60)
        if rc != 0:
            raise SystemExit(f"Copy failed: rc={rc}, out={out[:900]!r}, err={err[:900]!r}")
        print("COPY_OK")

        verify_cmd = f"grep -o 'index-AGFIX[0-9]*\\.js' {FRONTEND_DIR}/index.html | head -n 1"
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
        print("DEPLOY_OK AGFIX134", ASSET)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
