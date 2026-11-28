"""Deploy AGFIX137: compact dashboard banner + modal list + Jalali birthday calendar.

Changes vs AGFIX136:
- Dashboard no longer sprawls the flagged list; it shows one compact amber card
  ("n عضو نیازمند تکمیل") with a "مشاهده لیست اصلاح" button that opens the list modal.
- The list modal shows name/code rows (no issue-description text under names).
- Quick-edit modal: birthday set via the shared Jalali calendar (Jt) with min/max
  bounds for the 6-70 age rule; issue text under the member name removed.
- Jt year dropdown extended from -60..+19 to -100..+9 so all valid birth years selectable.
- Identical for admin and secretary (no role gating).
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

FRONT_SOURCE = LOCAL / "index-AGFIX136.js"
FRONT_OUTPUT = LOCAL / "index-AGFIX137.js"
FRONT_INDEX_SOURCE = LOCAL / "agfix136-index.html"
FRONT_INDEX = LOCAL / "agfix137-index.html"

ASSET = "index-AGFIX137.js"
OLD_ASSET = "index-AGFIX136.js"

EXPECTED = {
    "server.js": "b732ca4174b64043da4c9ea0a7aad2b18ec13cd55e93cff94a4cf6891be47f22",
    "personnelAttendance.js": "6dc263007578c87d307c445d35c5a0b5eb202b481eacbc84e8818c32d76f7e3c",
    "attendanceScan.js": "bc3e83601340fe4daf086ab04d96193f2cc2aecc8385ce03065d0f357bc3d869",
    "userApiGuards.js": "035a22cfb1b3d45f40a672f6530981131bbedb04a2acc5e4f7980bab9eeff568",
    OLD_ASSET: "eac0ff24341a45db09448d28b1d580d5dae79212bc7bd6d15d0c4006733b9b88",
    "index.html": "d2182bdccd108ffdc198730fd84ab341de6bfab6124f9a069b0ebe524d7d0966",
}

PANEL_OLD_HEAD = "function agInfoPanel({rows,total,q,setQ,lim,setLim,onFix}){"
PANEL_END = "function Nv(){var z;const{isAdmin:s,profile:a}=Tt()"

PANEL_AND_HELPERS_NEW = (
    'function agInfoPanel({total,onOpen}){return total?n.jsxs("div",{className:"panel-card p-4 flex flex-wrap items-center justify-between gap-3",style:{border:"1px solid rgba(245,158,11,.5)",background:"rgba(245,158,11,.08)"},children:[n.jsxs("div",{className:"flex items-center gap-3",children:[n.jsx("div",{className:"w-10 h-10 rounded-xl flex items-center justify-center",style:{background:"rgba(245,158,11,.18)",color:"#b45309"},children:n.jsx(an,{size:20})}),n.jsxs("div",{children:[n.jsx("p",{className:"text-sm font-bold",style:{color:"var(--text)"},children:"تکمیل اطلاعات اعضا"}),n.jsxs("p",{className:"text-xs",style:{color:"var(--text-muted)"},children:[total.toLocaleString("fa-IR")," عضو شماره تماس یا تاریخ تولد ناقص/غیرطبیعی دارند"]})]})]}),n.jsx("button",{type:"button",className:"btn-primary",onClick:onOpen,children:"مشاهده لیست اصلاح"})]}):null}'
    'function agParseBirth(x){const s=String(x==null?"":x).trim();if(!s)return null;let m=s.match(/^(\\d{4})\\/(\\d{1,2})\\/(\\d{1,2})$/);if(m){const y=Number(m[1]);if(y>=1200&&y<1600)return{year:y,month:Number(m[2]),day:Number(m[3])};return null}m=s.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/);if(m){const y=Number(m[1]);if(y>=1900&&y<=2100){try{return Jn(s)}catch(e){return null}}}return null}'
    'function agInfoListModal({rows,total,q,setQ,lim,setLim,onFix,onClose}){return n.jsx("div",{style:{position:"fixed",inset:0,zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"rgba(2,6,23,.8)",backdropFilter:"blur(8px)"},onClick:onClose,children:n.jsxs("div",{onClick:e=>e.stopPropagation(),style:{width:"min(720px,100%)",maxHeight:"88vh",overflow:"auto",borderRadius:16,border:"1px solid rgba(148,163,184,.25)",background:"var(--bg-card,#0f172a)",padding:20},children:[n.jsxs("div",{className:"flex items-center justify-between gap-3 mb-3",children:[n.jsxs("div",{children:[n.jsx("h3",{style:{margin:0,fontSize:18,fontWeight:800,color:"var(--text)"},children:"لیست اصلاح اطلاعات اعضا"}),n.jsx("p",{style:{fontSize:12,color:"var(--text-muted)",margin:"4px 0 0"},children:[total.toLocaleString("fa-IR")," عضو نیازمند تکمیل"]})]}),n.jsx("button",{type:"button",className:"btn-outline py-1.5 px-3 text-xs",onClick:onClose,children:"بستن"})]}),n.jsx("input",{className:"input-field",placeholder:"جستجو: نام، کد عضویت یا شماره...",value:q,onChange:e=>setQ(e.target.value),style:{marginBottom:10}}),rows.length===0?n.jsx("p",{className:"text-sm",style:{color:"var(--text-muted)"},children:"موردی یافت نشد"}):n.jsx("div",{style:{maxHeight:"52vh",overflow:"auto",display:"flex",flexDirection:"column",gap:6},children:rows.map(m=>n.jsxs("div",{className:"flex items-center justify-between gap-3 p-2.5 rounded-xl",style:{border:"1px solid var(--border)",background:"var(--bg)"},children:[n.jsx("p",{className:"text-sm font-semibold truncate",style:{color:"var(--text)",margin:0},children:[m.full_name," · کد ",m.personnel_code||m.member_code||"—"]}),n.jsx("button",{type:"button",className:"btn-primary py-1.5 px-3 text-xs",onClick:()=>onFix(m),children:"اصلاح"})]},m.id))}),total>rows.length?n.jsx("button",{type:"button",className:"btn-outline w-full mt-2",onClick:()=>setLim(lim+100),children:"نمایش موارد بیشتر"}):null]})})}'
)

BD_INPUT_OLD = (
    'n.jsx("label",{style:{fontSize:12,color:"var(--text-secondary)"},children:"تاریخ تولد (شمسی، مثال 1370/05/12)"}),'
    'n.jsx("input",{className:"input-field",value:bd,onChange:e=>agSetBd(e.target.value),placeholder:"1370/05/12",style:{margin:"4px 0 6px"}}),'
)
BD_INPUT_NEW = (
    'n.jsx("div",{style:{margin:"4px 0 6px"},children:n.jsx(Jt,{label:"تاریخ تولد",value:bdJ,onChange:agSetBdJ,allowClear:!0,placeholder:"تقویم شمسی",min:Fl(Lt(),-840),max:Fl(Lt(),-72)})}),'
)

IS_BLOCK_OLD = 'is.length?n.jsx("div",{style:{marginBottom:10},children:is.map((s2,i)=>n.jsx("p",{style:{fontSize:12,color:"#b45309"},children:s2},i))}):null,'


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_ASSERT {label}: expected 1, got {count}")
    return text.replace(old, new, 1)


def replace_panel(text: str) -> str:
    i = text.find(PANEL_OLD_HEAD)
    j = text.find(PANEL_END, i)
    if i < 0 or j < 0:
        raise SystemExit("PATCH_ASSERT panel slice not found")
    old = text[i:j]
    for must in ["نمایش موارد بیشتر", 'is.join(" • ")', "جستجو: نام، کد عضویت یا شماره..."]:
        if must not in old:
            raise SystemExit(f"PATCH_ASSERT panel slice missing {must!r}")
    return text[:i] + PANEL_AND_HELPERS_NEW + text[j:]


def build_frontend() -> str:
    text = FRONT_SOURCE.read_bytes().decode("utf-8").replace("\r\n", "\n")
    if sha(FRONT_SOURCE) != EXPECTED[OLD_ASSET]:
        raise SystemExit(f"Frontend snapshot changed: {sha(FRONT_SOURCE)}")

    # 1) compact banner panel + parse helper + list modal (replaces old inline panel)
    text = replace_panel(text)
    # 2) dashboard list-open state
    text = replace_once(
        text,
        "[agInfoFixM,agSetInfoFixM]=p.useState(null)",
        "[agInfoFixM,agSetInfoFixM]=p.useState(null),[agInfoList,agSetInfoList]=p.useState(!1)",
        "dashboard list state",
    )
    # 3) dashboard panel usage -> compact banner
    text = replace_once(
        text,
        "agBadInfo.length?n.jsx(agInfoPanel,{rows:agInfoShown,total:agInfoF.length,q:agInfoQ,setQ:agSetInfoQ,lim:agInfoLim,setLim:agSetInfoLim,onFix:agSetInfoFixM}):null",
        "agBadInfo.length?n.jsx(agInfoPanel,{total:agBadInfo.length,onOpen:()=>agSetInfoList(!0)}):null",
        "dashboard banner usage",
    )
    # 4) dashboard end: render list modal + fix modal
    text = replace_once(
        text,
        "}),agInfoFixM?n.jsx(agInfoFixModal,{member:agInfoFixM,onClose:()=>agSetInfoFixM(null),onSaved:()=>void j()}):null]})}",
        "}),agInfoList?n.jsx(agInfoListModal,{rows:agInfoShown,total:agInfoF.length,q:agInfoQ,setQ:agSetInfoQ,lim:agInfoLim,setLim:agSetInfoLim,onFix:agSetInfoFixM,onClose:()=>agSetInfoList(!1)}):null,agInfoFixM?n.jsx(agInfoFixModal,{member:agInfoFixM,onClose:()=>agSetInfoFixM(null),onSaved:()=>void j()}):null]})}",
        "dashboard modals insert",
    )
    # 5) fix modal birthday state -> Jalali object
    text = replace_once(
        text,
        '[bd,agSetBd]=p.useState(String(member.birthday||""))',
        "[bdJ,agSetBdJ]=p.useState(agParseBirth(member.birthday))",
        "fix modal bday state",
    )
    # 6) remove issue text under member name in fix modal
    text = replace_once(text, IS_BLOCK_OLD, "", "fix modal issue text removal")
    # 7) birthday input -> Jalali calendar with 6-70 bounds
    text = replace_once(text, BD_INPUT_OLD, BD_INPUT_NEW, "fix modal bday calendar")
    # 8) save: serialize picked Jalali date
    text = replace_once(
        text,
        'const p0=String(member.phone||"").trim(),b0=String(member.birthday||"").trim(),p1=ph.trim(),b1=bd.trim();',
        'const p0=String(member.phone||"").trim(),b0=String(member.birthday||"").trim(),p1=ph.trim(),b1=bdJ?cf(bdJ):"";',
        "fix modal save bday",
    )
    # 9) calendar year range: cover ages up to 100
    text = replace_once(
        text,
        "F=Array.from({length:80},(S,C)=>x.year-60+C)",
        "F=Array.from({length:110},(S,C)=>x.year-100+C)",
        "calendar year range",
    )

    for must in ["agInfoListModal", "agParseBirth", "agInfoPanel({total,onOpen})", 'n.jsx(Jt,{label:"تاریخ تولد"', "min:Fl(Lt(),-840)", "{length:110}"]:
        if must not in text:
            raise SystemExit(f"FRONT_ASSERT missing {must}")
    for gone in ['value:bd,onChange:e=>agSetBd', 'is.join(" • ")', "rows,total,q,setQ,lim,setLim,onFix}){"]:
        if gone in text:
            raise SystemExit(f"FRONT_ASSERT leftover {gone}")
    return text


def build_index() -> str:
    text = FRONT_INDEX_SOURCE.read_text(encoding="utf-8").replace("\r\n", "\n")
    if OLD_ASSET not in text:
        raise SystemExit("Index snapshot is not on AGFIX136")
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

        backup = create_backup(client, "member-info-agfix137", persist=True, sudo_password=cfg.sudo_password)
        print("BACKUP", json.dumps(backup, ensure_ascii=False))
        stamp = backup["persisted"].rsplit("-", 1)[-1]

        for name, remote in ((ASSET, f"{FRONTEND_DIR}/assets/{ASSET}"), ("index.html", f"{FRONTEND_DIR}/index.html")):
            backup_cmd = f"if [ -f {remote} ]; then cp -p {remote} /tmp/{name}.bak-agfix137-{stamp}; fi"
            rc, out, err = run_remote(client, "sh -c " + shlex.quote(backup_cmd), sudo=True, sudo_password=cfg.sudo_password, timeout=30)
            if rc != 0:
                raise SystemExit(f"File backup failed for {name}: rc={rc}, err={err[:900]}")
        print("FILE_BACKUPS_OK 2")

        tmp_files = {}
        for name, local in outputs.items():
            stem = name.rsplit(".", 1)[0]
            tmp = f"/tmp/{stem}.agfix137-{stamp}.{'js' if name.endswith('.js') else 'html'}"
            upload(client, local, tmp)
            if name.endswith(".js"):
                rc, out, err = run_remote(client, f"node --check {tmp}", timeout=60)
                if rc != 0:
                    raise SystemExit(f"Remote node --check failed for {name}: {err[:1500]}")
            tmp_files[name] = tmp
        print("REMOTE_CHECK_OK")

        copy_cmd = (
            "grep -q 'agInfoListModal' " + tmp_files[ASSET]
            + " && grep -q 'agParseBirth' " + tmp_files[ASSET]
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
        print("DEPLOY_OK AGFIX137", ASSET)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
