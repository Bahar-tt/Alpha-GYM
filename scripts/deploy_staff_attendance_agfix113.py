"""Deploy AGFIX113: restore the complete personnel module and clean up its UI."""

from __future__ import annotations

import argparse
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
SNAPSHOT = ROOT / "snapshots" / "20261125114039" / "backend" / "personnelAttendance.js"

FRONT_SOURCE = LOCAL / "live-current-index-AGFIX112.js"
FRONT_OUTPUT = LOCAL / "index-AGFIX113.js"
FRONT_INDEX = LOCAL / "agfix113-index.html"
ASSET = "index-AGFIX113.js"
OLD_ASSET = "index-AGFIX112.js"

BACK_SOURCE = SNAPSHOT
LIVE_BACK_SOURCE = LOCAL / "live-current-personnelAttendance-20261126-v2.js"
BACK_OUTPUT = LOCAL / "personnelAttendance.agfix113.js"
SCAN_SOURCE = LOCAL / "live-current-attendanceScan.js"
SCAN_OUTPUT = LOCAL / "attendanceScan.agfix113.js"


def fa(text: str) -> str:
    """Return a JS double-quoted string with literal UTF-8 Persian."""
    return json.dumps(text, ensure_ascii=False)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_ASSERT failed for {label}: expected 1, got {count}")
    return text.replace(old, new, 1)


def build_backend() -> str:
    text = BACK_SOURCE.read_bytes().decode("utf-8").replace("\r\n", "\n")
    live = LIVE_BACK_SOURCE.read_bytes().decode("utf-8").replace("\r\n", "\n")

    # Restore advanced roster/leave features but keep the AGFIX114 payslip code,
    # including its protection for manually edited salary slips.
    pay_marker_old = "  // Payslip / salary slip generation\n"
    pay_marker_new = "  // === AGFIX116: reconcile cleared deductions into payslips + accounting salaries ===\n"
    if text.count(pay_marker_old) != 1 or live.count(pay_marker_new) != 1:
        raise SystemExit("PAYSLIP_MERGE_ASSERT failed: markers")
    old_start = text.index(pay_marker_old)
    old_end = text.rfind("\n};")
    new_start = live.index(pay_marker_new)
    new_end = live.rfind("\n};")
    if old_end < old_start or new_end < new_start:
        raise SystemExit("PAYSLIP_MERGE_ASSERT failed: bounds")
    text = text[:old_start] + live[new_start:new_end] + text[old_end:]

    old_now = """  const now = () => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const o = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
    return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour}:${o.minute}` };
  };
"""
    new_now = """  const now = () => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const o = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
    let hour = Number(o.hour);
    if (!Number.isFinite(hour) || hour === 24) hour = 0;
    return { date: `${o.year}-${o.month}-${o.day}`, time: `${String(hour).padStart(2, '0')}:${String(o.minute || '00').padStart(2, '0')}` };
  };
"""
    text = replace_once(text, old_now, new_now, "normalize Tehran hour")

    old_helpers = (
        "  // Self-service is limited to the caller's own personnel row; admins may act for anyone.\n"
        "  const mayAct = (req, p) => ['admin', 'staff'].includes(String(req.staff?.role || '')) || Number(p.staff_id) === Number(req.staff?.id);\n"
    )
    new_helpers = (
        "  const cleanName = (req) => String(req.staff?.full_name || '').replace(/\\s+/g, '');\n"
        "  const isPrivilegedReq = (req) => {\n"
        "    const role = String(req.staff?.role || '');\n"
        "    return role === 'admin' || role === 'manager' || cleanName(req).includes('" + "رهاخدهندهلو" + "');\n"
        "  };\n"
        "  const isAdminReq = (req) => String(req.staff?.role || '') === 'admin';\n"
        "  const selfPersonnelIds = (req) => db.prepare('SELECT id FROM personnel WHERE staff_id = ?')\n"
        "    .all(Number(req.staff?.id || 0)).map((r) => Number(r.id));\n"
        "  const mayAct = (req, p) => isPrivilegedReq(req) || selfPersonnelIds(req).includes(Number(p && p.id));\n"
        "  const canSeeLeave = (req, r, ownIds) => isPrivilegedReq(req)\n"
        "    || Number(r.created_by) === Number(req.staff?.id) || ownIds.has(Number(r.personnel_id));\n"
    )
    text = replace_once(text, old_helpers, new_helpers, "leave ownership helpers")

    old_hidden = "    const hidden = req.query.include_inactive_coaches === '1' ? new Set() : inactiveCoachIds();\n    const attendance = db.prepare(`SELECT a.*, p.full_name, p.personnel_type, p.fingerprint_id, p.coach_id, cb.full_name AS created_by_name, ub.full_name AS updated_by_name FROM personnel_attendance a JOIN personnel p ON p.id=a.personnel_id LEFT JOIN staff cb ON cb.id=a.created_by LEFT JOIN staff ub ON ub.id=a.updated_by WHERE a.work_date BETWEEN ? AND ? ORDER BY a.work_date DESC, a.id DESC`).all(from, to).filter((r) => coachVisible(r, hidden));\n"
    new_hidden = (
        "    const hidden = req.query.include_inactive_coaches === '1' ? new Set() : inactiveCoachIds();\n"
        "    const ownIds = new Set(selfPersonnelIds(req));\n"
        "    const canSee = (r) => canSeeLeave(req, r, ownIds);\n"
        "    const attendance = db.prepare(`SELECT a.*, p.full_name, p.personnel_type, p.fingerprint_id, p.coach_id, cb.full_name AS created_by_name, ub.full_name AS updated_by_name FROM personnel_attendance a JOIN personnel p ON p.id=a.personnel_id LEFT JOIN staff cb ON cb.id=a.created_by LEFT JOIN staff ub ON ub.id=a.updated_by WHERE a.work_date BETWEEN ? AND ? ORDER BY a.work_date DESC, a.id DESC`).all(from, to).filter((r) => coachVisible(r, hidden));\n"
    )
    text = replace_once(text, old_hidden, new_hidden, "overview visibility setup")

    text = replace_once(
        text,
        "WHERE l.leave_date BETWEEN ? AND ? ORDER BY l.leave_date ASC, l.id ASC`).all(from, to).filter((r) => coachVisible(r, hidden));",
        "WHERE l.leave_date BETWEEN ? AND ? ORDER BY l.leave_date ASC, l.id ASC`).all(from, to).filter((r) => coachVisible(r, hidden) && canSee(r));",
        "overview leave rows privacy",
    )

    text = replace_once(
        text,
        "status: r.status, leave_date: r.leave_date, from_date: r.leave_date,",
        "status: r.status, leave_date: r.leave_date, created_by: r.created_by, from_date: r.leave_date,",
        "grouped leave creator",
    )

    old_people = "    const people = db.prepare('SELECT * FROM personnel WHERE is_active=1 AND attendance_enabled=1 ORDER BY full_name COLLATE NOCASE').all().filter((p) => coachVisible(p, hidden)).map(publicPersonnel);\n    res.json({ ok: true, today: n.date, today_time: n.time, from, to, personnel: people, attendance, leaves });\n"
    new_people = (
        "    const people = db.prepare('SELECT * FROM personnel WHERE is_active=1 AND attendance_enabled=1 ORDER BY full_name COLLATE NOCASE').all().filter((p) => coachVisible(p, hidden)).map(publicPersonnel);\n"
        "    const leaveFlags = db.prepare(`SELECT l.personnel_id, l.leave_date, p.coach_id FROM personnel_leaves l JOIN personnel p ON p.id=l.personnel_id WHERE l.leave_date BETWEEN ? AND ? AND l.status='approved'`).all(from, to).filter((r) => coachVisible(r, hidden));\n"
        "    res.json({ ok: true, today: n.date, today_time: n.time, from, to, personnel: people, attendance, leaves, leave_flags: leaveFlags });\n"
    )
    text = replace_once(text, old_people, new_people, "today leave flags")

    old_self = (
        "    const existing = db.prepare('SELECT * FROM personnel_attendance WHERE personnel_id=? AND work_date=?').get(p.id, workDate);\n"
        "    if (action === 'check_in') {\n"
    )
    new_self = (
        "    const existing = db.prepare('SELECT * FROM personnel_attendance WHERE personnel_id=? AND work_date=?').get(p.id, workDate);\n"
        "    const onLeave = db.prepare(`SELECT id FROM personnel_leaves WHERE personnel_id=? AND leave_date=? AND status='approved'`).get(p.id, workDate);\n"
        "    if (onLeave) return res.status(409).json({ error: 'برای امروز مرخصی تأییدشده ثبت شده است' });\n"
        "    if (action === 'check_in') {\n"
    )
    text = replace_once(text, old_self, new_self, "block punch during approved leave")

    old_leave_create = (
        "    if (!p || !p.is_active || !p.attendance_enabled) return res.status(404).json({ error: 'پرسنل مشمول یافت نشد' });\n"
        "    if (!from || !to) return res.status(400).json({ error: 'تاریخ مرخصی معتبر نیست' });\n"
    )
    new_leave_create = (
        "    if (!p || !p.is_active || !p.attendance_enabled) return res.status(404).json({ error: 'پرسنل مشمول یافت نشد' });\n"
        "    if (!mayAct(req, p)) return res.status(403).json({ error: 'فقط میتوانید مرخصی خود را ثبت کنید' });\n"
        "    if (!from || !to) return res.status(400).json({ error: 'تاریخ مرخصی معتبر نیست' });\n"
    )
    text = replace_once(text, old_leave_create, new_leave_create, "leave create ownership")

    text = replace_once(
        text,
        "app.put('/personnel-leaves/:id/status', requireAuth, requireAttendanceManager,",
        "app.put('/personnel-leaves/:id/status', requireAuth, requireRealAdmin,",
        "leave approval admin only",
    )

    text = replace_once(
        text,
        "app.delete('/personnel-leaves/:id', requireAuth, requireAttendanceManager,",
        "app.delete('/personnel-leaves/:id', requireAuth,",
        "leave delete auth",
    )

    old_batch = (
        "    const batch = existing.request_id\n"
        "      ? db.prepare('SELECT * FROM personnel_leaves WHERE request_id=?').all(existing.request_id)\n"
        "      : [existing];\n"
        "    if (String(req.staff?.role || '') !== 'admin' && batch.some((r) => r.status !== 'pending'))\n"
    )
    new_batch = (
        "    const batch = existing.request_id\n"
        "      ? db.prepare('SELECT * FROM personnel_leaves WHERE request_id=?').all(existing.request_id)\n"
        "      : [existing];\n"
        "    const ownIds = new Set(selfPersonnelIds(req));\n"
        "    if (!batch.every((r) => canSeeLeave(req, r, ownIds))) return res.status(403).json({ error: 'دسترسی به این مرخصی مجاز نیست' });\n"
        "    if (!isPrivilegedReq(req) && batch.some((r) => r.status !== 'pending'))\n"
    )
    text = replace_once(text, old_batch, new_batch, "leave delete ownership")

    for token in (
        "app.post('/personnel-attendance/check-in'",
        "app.post('/personnel-attendance/check-out'",
        "app.delete('/personnel-leaves/:id'",
        "leave_flags",
        "canSeeLeave",
        "isPrivilegedReq",
        "hour === 24",
        "AGFIX116",
        "oldPs.get(p.id, month);",
    ):
        if token not in text:
            raise SystemExit(f"BACKEND_PATCH_ASSERT failed: missing {token}")
    return text


def build_scan() -> str:
    text = SCAN_SOURCE.read_bytes().decode("utf-8").replace("\r\n", "\n")

    old_time = """        const o = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
        const workDate = `${o.year}-${o.month}-${o.day}`;
        const time = `${o.hour}:${o.minute}`;
        const existing = db.prepare('SELECT * FROM personnel_attendance WHERE personnel_id=? AND work_date=?').get(staff.id, workDate);
"""
    new_time = """        const o = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
        const workDate = `${o.year}-${o.month}-${o.day}`;
        let hour = Number(o.hour);
        if (!Number.isFinite(hour) || hour === 24) hour = 0;
        const time = `${String(hour).padStart(2, '0')}:${String(o.minute || '00').padStart(2, '0')}`;
        const onLeave = db.prepare(`SELECT id FROM personnel_leaves WHERE personnel_id=? AND leave_date=? AND status='approved'`).get(staff.id, workDate);
        if (onLeave) return res.status(409).json({ ok: false, error: 'برای امروز مرخصی تأییدشده ثبت شده است' });
        const existing = db.prepare('SELECT * FROM personnel_attendance WHERE personnel_id=? AND work_date=?').get(staff.id, workDate);
"""
    text = replace_once(text, old_time, new_time, "scanner personnel time + leave guard")

    if text.count("hour === 24") != 1:
        raise SystemExit("SCAN_PATCH_ASSERT failed: hour normalization count")
    if "add_new_sport" not in text:
        raise SystemExit("SCAN_PATCH_ASSERT failed: quick-renew support missing")
    return text.replace("\n", "\r\n")


def build_frontend() -> str:
    text = FRONT_SOURCE.read_bytes().decode("utf-8").replace("\r\n", "\n")

    text = replace_once(
        text,
        "  const {role:agRole,isAdmin:adm}=Tt();\n",
        "  const {role:agRole,isAdmin:adm,user:agUser}=Tt();\n",
        "auth user access",
    )

    flag_line = (
        "  const agCanManualEdit=String(agRole||'')==='admin';const agCanLeave=adm||String(agRole||'')==='staff';const agPayslipAdmin=String(agRole||'')==='admin';\n"
    )
    text = replace_once(
        text,
        flag_line,
        flag_line
        + "  const agIsRealAdmin=String(agRole||'')==='admin';const agIsManager=isMgrName(agUser&&agUser.full_name,null,String(agRole||''));const agSelfUid=Number(agUser&&agUser.id)||0;const agSelfName=String((agUser&&agUser.full_name)||'').trim();const agCanSeeAllLeaves=agIsRealAdmin||agIsManager;\n",
        "identity flags",
    )

    text = replace_once(
        text,
        "  const [showInactiveCoaches,setShowInactiveCoaches]=p.useState(!1);\n",
        "  const showInactiveCoaches=!1;\n",
        "disable inactive coach toggle",
    )

    text = replace_once(
        text,
        '[N,v]=p.useState(s),[w,j]=p.useState("09:00"),[$,M]=p.useState("17:00"),',
        '[N,v]=p.useState(s),[w,j]=p.useState(""),[$,M]=p.useState(""),',
        "manual time defaults",
    )

    old_data = (
        "  const X=p.useMemo(()=>((f==null?void 0:f.attendance)||[]).filter(C=>C.work_date===(f==null?void 0:f.today)),[f]);\n"
        "  const PPL=p.useMemo(()=>(f==null?void 0:f.personnel)||[],[f]);\n"
    )
    new_data = (
        "  const X=p.useMemo(()=>((f==null?void 0:f.attendance)||[]).filter(C=>C.work_date===(f==null?void 0:f.today)&&C.source!==\"leave\"&&C.status!==\"leave\"),[f]);\n"
        "  const PPL=p.useMemo(()=>{const day=(f==null?void 0:f.today)||et(a);const onLeave=new Set(((f==null?void 0:f.leave_flags)||[]).filter(L=>L.leave_date===day).map(L=>Number(L.personnel_id)));return ((f==null?void 0:f.personnel)||[]).filter(C=>C.is_active!==0&&C.is_active!==!1&&C.attendance_enabled!==0&&C.attendance_enabled!==!1&&!onLeave.has(Number(C.id)))},[f,a]);\n"
        "  const agSelfPids=new Set(((f==null?void 0:f.personnel)||[]).filter(P=>Number(P.staff_id)===agSelfUid||(agSelfName&&String(P.full_name||'').trim()===agSelfName)).map(P=>Number(P.id)));\n"
        "  const agVisibleLeaveRows=p.useMemo(()=>leaveRows.filter(L=>agCanSeeAllLeaves||agSelfPids.has(Number(L.personnel_id))||String(L.created_by||0)===String(agSelfUid)||(agSelfName&&String(L.full_name||'').trim()===agSelfName)),[leaveRows,agCanSeeAllLeaves,agSelfUid,agSelfName,agSelfPids]);\n"
    )
    text = replace_once(text, old_data, new_data, "daily filters + leave visibility")

    old_stname = '  const stName=C=>t1[C]||C||"—";\n'
    new_stname = (
        old_stname
        + "  const agFmtTime=v=>{if(v==null||v==='')return'—';const s=String(v);if(/^\\d{2}:\\d{2}$/.test(s))return s;const d=new Date(s);return Number.isNaN(d.getTime())?s:new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Tehran'}).format(d)};\n"
    )
    text = replace_once(text, old_stname, new_stname, "safe time formatter")

    text = replace_once(
        text,
        '              "ورود ",(A0&&A0.check_in)||"—"," / خروج ",(A0&&A0.check_out)||"—",',
        '              "ورود ",A0?agFmtTime(A0.check_in):"—"," / خروج ",A0?agFmtTime(A0.check_out):"—",',
        "card time display",
    )

    text = replace_once(
        text,
        '      F&&n.jsx("p",{className:"text-xs mt-2",style:{color:"var(--text-muted)"},children:["رکورد فعلی: ",F.check_in||"—"," تا ",F.check_out||"—"," — منبع: ",srcName(F.source),F.updated_by_name||F.created_by_name?` — ثبت توسط: ${F.updated_by_name||F.created_by_name}`:""]})',
        '      F&&n.jsx("p",{className:"text-xs mt-2",style:{color:"var(--text-muted)"},children:["رکورد فعلی: ",agFmtTime(F.check_in)," تا ",agFmtTime(F.check_out)," — منبع: ",srcName(F.source),F.updated_by_name||F.created_by_name?` — ثبت توسط: ${F.updated_by_name||F.created_by_name}`:""]})',
        "manual record time display",
    )

    text = replace_once(
        text,
        '            n.jsx("td",{className:"px-4 py-3 text-sm",style:{color:"var(--success)"},children:C.check_in||"—"}),\n'
        '            n.jsx("td",{className:"px-4 py-3 text-sm",style:{color:"var(--accent)"},children:C.check_out||"—"}),',
        '            n.jsx("td",{className:"px-4 py-3 text-sm",style:{color:"var(--success)"},children:agFmtTime(C.check_in)}),\n'
        '            n.jsx("td",{className:"px-4 py-3 text-sm",style:{color:"var(--accent)"},children:agFmtTime(C.check_out)}),',
        "history time display",
    )

    old_header = (
        "      n.jsxs(\"div\",{children:[\n"
        "        n.jsx(\"h2\",{className:\"text-xl font-bold\",style:{color:\"var(--text)\"},children:"
        + fa("تردد پرسنل")
        + "}),\n"
        "        \n"
        "      ]}),\n"
    )
    new_header = (
        "      n.jsxs(\"div\",{className:\"page-hero\",children:[\n"
        "        n.jsx(\"h1\",{className:\"page-title\",children:"
        + fa("تردد پرسنل")
        + "}),\n"
        "        n.jsx(\"p\",{className:\"text-xs mt-1\",style:{color:\"var(--text-muted)\"},children:"
        + fa("مدیریت تردد، مرخصی و حقوق پرسنل")
        + "})\n"
        "      ]}),\n"
    )
    text = replace_once(text, old_header, new_header, "page header cleanup")

    old_checkbox = (
        '        n.jsxs("label",{className:"flex items-center gap-2 text-sm",style:{color:"var(--text-secondary)"},children:'
        '[n.jsx("input",{type:"checkbox",checked:showInactiveCoaches,onChange:C=>setShowInactiveCoaches(C.target.checked)}),'
        + fa("نمایش مربیان غیرفعال")
        + "]}),\n"
    )
    text = replace_once(
        text,
        old_checkbox,
        '        n.jsx("span",{className:"badge badge-success",children:' + fa("فقط پرسنل فعال") + "}),\n",
        "replace inactive coach toggle",
    )

    text = replace_once(
        text,
        'n.jsx("p",{className:"text-xs mt-1",style:{color:"var(--text-secondary)"},children:'
        + fa("ساعت تهران (سرور)")
        + "})",
        'n.jsx("p",{className:"text-xs mt-1",style:{color:"var(--text-secondary)"},children:'
        + fa("زمان ثبت سرور (تهران)")
        + "})",
        "server time label",
    )

    old_today_heading = (
        'n.jsx("h3",{className:"font-bold",style:{color:"var(--text)"},children:'
        + fa("تردد امروز — ورود / خروج")
        + "}),"
    )
    text = replace_once(
        text,
        old_today_heading,
        'n.jsx("h3",{className:"section-title",children:'
        + fa("تردد امروز — ورود / خروج")
        + "}),",
        "today heading cleanup",
    )

    text = replace_once(
        text,
        'className:"rounded-xl p-3 border",style:{background:isMgr?',
        'className:"rounded-xl p-4 border shadow-sm transition hover:shadow-md",style:{background:isMgr?',
        "cleaner personnel card",
    )

    old_leave_heading = (
        '      n.jsx("h3",{className:"font-bold mb-4",style:{color:"var(--text)"},children:'
        + fa("ثبت مرخصی")
        + "}),\n"
    )
    new_leave_heading = (
        '      n.jsx("h3",{className:"section-title mb-4",children:'
        + fa("ثبت مرخصی")
        + "}),\n"
        '      n.jsx("p",{className:"text-xs -mt-2 mb-4",style:{color:"var(--text-muted)"},children:'
        + fa("مرخصیها فقط توسط مدیر و ثبتکننده قابل مشاهده است.")
        + "}),\n"
    )
    text = replace_once(text, old_leave_heading, new_leave_heading, "leave heading + privacy note")

    old_leave_select = (
        "          ((f==null?void 0:f.personnel)||[]).map(C=>n.jsx(\"option\",{value:C.id,children:mgTx(C.full_name,C.coach_id,C.personnel_type)},C.id))\n"
        "        ]})]}),\n"
        "        n.jsx(Jt,{label:"
        + fa("از تاریخ")
    )
    new_leave_select = (
        "          ((f==null?void 0:f.personnel)||[]).filter(C=>agCanSeeAllLeaves||agSelfPids.has(Number(C.id))).map(C=>n.jsx(\"option\",{value:C.id,children:mgTx(C.full_name,C.coach_id,C.personnel_type)},C.id))\n"
        "        ]})]}),\n"
        "        n.jsx(Jt,{label:"
        + fa("از تاریخ")
    )
    text = replace_once(text, old_leave_select, new_leave_select, "leave form self-only select")

    text = replace_once(
        text,
        "          n.jsx(\"tbody\",{children:leaveRows.map(C=>{",
        "          n.jsx(\"tbody\",{children:agVisibleLeaveRows.map(C=>{",
        "visible leave rows",
    )

    text = replace_once(
        text,
        "      !leaveRows.length&&n.jsx(\"p\",{className:\"text-center py-4 text-xs\",style:{color:\"var(--text-muted)\"},children:"
        + fa("هیچ مرخصیای ثبت نشده است.")
        + "})",
        "      !agVisibleLeaveRows.length&&n.jsx(\"p\",{className:\"text-center py-4 text-xs\",style:{color:\"var(--text-muted)\"},children:"
        + fa("هیچ مرخصیای ثبت نشده است.")
        + "})",
        "leave empty state",
    )

    text = replace_once(
        text,
        "  const setLeaveStatus=async(id,status)=>{\n    if(!adm)return;",
        "  const setLeaveStatus=async(id,status)=>{\n    if(!agIsRealAdmin)return;",
        "leave approval UI gate",
    )

    old_del = (
        "    if(!agCanLeave||!confirm("
        + fa("حذف مرخصی و رکورد تردد مربوطه؟")
        + "))return;"
    )
    new_del = (
        "    const L=agVisibleLeaveRows.find(x=>String(x.id)===String(id));\n"
        "    if(!agCanLeave||(!agCanSeeAllLeaves&&!(L&&L.status==='pending'&&(agSelfPids.has(Number(L.personnel_id))||String(L.created_by||0)===String(agSelfUid))))||!confirm("
        + fa("حذف مرخصی و رکورد تردد مربوطه؟")
        + "))return;"
    )
    text = replace_once(text, old_del, new_del, "leave delete UI gate")

    old_row_buttons = (
        "                adm&&C.status===\"pending\"&&n.jsx(\"button\",{type:\"button\",onClick:()=>void setLeaveStatus(C.id,\"approved\"),className:\"text-xs ml-2\",style:{color:\"var(--success)\"},children:"
        + fa("تأیید")
        + "}),\n"
        "                adm&&C.status!==\"rejected\"&&n.jsx(\"button\",{type:\"button\",onClick:()=>void setLeaveStatus(C.id,\"rejected\"),className:\"text-xs ml-2\",style:{color:\"var(--danger)\"},children:"
        + fa("رد")
        + "}),\n"
        "                (adm||C.status===\"pending\")&&n.jsx(\"button\",{type:\"button\",onClick:()=>void delLeave(C.id),className:\"text-xs\",style:{color:\"var(--accent)\"},children:"
        + fa("حذف")
        + "})"
    )
    new_row_buttons = (
        "                agIsRealAdmin&&C.status===\"pending\"&&n.jsx(\"button\",{type:\"button\",onClick:()=>void setLeaveStatus(C.id,\"approved\"),className:\"text-xs ml-2\",style:{color:\"var(--success)\"},children:"
        + fa("تأیید")
        + "}),\n"
        "                agIsRealAdmin&&C.status!==\"rejected\"&&n.jsx(\"button\",{type:\"button\",onClick:()=>void setLeaveStatus(C.id,\"rejected\"),className:\"text-xs ml-2\",style:{color:\"var(--danger)\"},children:"
        + fa("رد")
        + "}),\n"
        "                (agIsRealAdmin||(C.status===\"pending\"&&(agSelfPids.has(Number(C.personnel_id))||String(C.created_by||0)===String(agSelfUid))))&&n.jsx(\"button\",{type:\"button\",onClick:()=>void delLeave(C.id),className:\"text-xs\",style:{color:\"var(--accent)\"},children:"
        + fa("حذف")
        + "})"
    )
    text = replace_once(text, old_row_buttons, new_row_buttons, "leave row buttons gate")

    if "checked:showInactiveCoaches" in text:
        raise SystemExit("PATCH_ASSERT failed: inactive coach toggle still present")
    for token in (
        "agVisibleLeaveRows",
        "leave_flags",
        "agFmtTime",
        "agIsRealAdmin",
        "agRenewSessions",
        "agSecretaryAccounting",
        'oe("check-in"',
    ):
        if token not in text:
            raise SystemExit(f"PATCH_ASSERT failed: missing {token}")
    return text.replace("\n", "\r\n")


def write_index() -> None:
    html = (
        '<!doctype html>\r\n'
        '<html lang="fa" dir="rtl">\r\n'
        '  <head>\r\n'
        '    <meta charset="UTF-8" />\r\n'
        '    <link rel="icon" type="image/png" href="/v5.png" />\r\n'
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\r\n'
        '    <title>آلفا جیم | مدیریت باشگاه</title>\r\n'
        '    <meta name="theme-color" content="#f4f6fb" />\r\n'
        f'    <script type="module" crossorigin src="/assets/{ASSET}"></script>\r\n'
        '    <link rel="stylesheet" crossorigin href="/assets/index-DMwX9_UD.css">\r\n'
        '    <link rel="stylesheet" href="/assets/dark-fix.css">\r\n'
        '    <link rel="stylesheet" href="/assets/v40-modal-fix.css">\r\n'
        '  </head>\r\n'
        '  <body>\r\n'
        '    <div id="root"></div>\r\n'
        '  </body>\r\n'
        '</html>\r\n'
    )
    FRONT_INDEX.write_text(html, encoding="utf-8", newline="")


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
        raise SystemExit("Backend node --check failed:\n" + check.stderr[:4000])
    print("BACKEND_NODE_CHECK_OK", BACK_OUTPUT, len(BACK_OUTPUT.read_bytes()))

    scanner = build_scan()
    SCAN_OUTPUT.write_bytes(scanner.encode("utf-8"))
    check = subprocess.run(["node", "--check", str(SCAN_OUTPUT)], capture_output=True, text=True)
    if check.returncode != 0:
        raise SystemExit("Scanner node --check failed:\n" + check.stderr[:4000])
    print("SCANNER_NODE_CHECK_OK", SCAN_OUTPUT, len(SCAN_OUTPUT.read_bytes()))

    frontend = build_frontend()
    FRONT_OUTPUT.write_bytes(frontend.encode("utf-8"))
    check = subprocess.run(["node", "--check", str(FRONT_OUTPUT)], capture_output=True, text=True)
    if check.returncode != 0:
        raise SystemExit("Frontend node --check failed:\n" + check.stderr[:4000])
    print("FRONTEND_NODE_CHECK_OK", FRONT_OUTPUT, len(FRONT_OUTPUT.read_bytes()))
    write_index()

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        sftp = client.open_sftp()
        live_html = sftp.open(FRONTEND_DIR + "/index.html").read().decode("utf-8")
        if OLD_ASSET not in live_html:
            raise SystemExit("Refusing deploy: live index.html is not on expected AGFIX112")
        live_front = sftp.open(FRONTEND_DIR + "/assets/" + OLD_ASSET).read().decode("utf-8")
        if live_front.replace("\r\n", "\n") != FRONT_SOURCE.read_bytes().decode("utf-8").replace("\r\n", "\n"):
            raise SystemExit("Refusing deploy: live AGFIX112 asset changed since snapshot")
        live_back = sftp.open(BACKEND_DIR + "/personnelAttendance.js").read().decode("utf-8").replace("\r\n", "\n")
        if live_back != LIVE_BACK_SOURCE.read_bytes().decode("utf-8").replace("\r\n", "\n"):
            raise SystemExit("Refusing deploy: live personnelAttendance.js changed since snapshot")
        live_scan = sftp.open(BACKEND_DIR + "/attendanceScan.js").read().decode("utf-8").replace("\r\n", "\n")
        if live_scan != SCAN_SOURCE.read_bytes().decode("utf-8").replace("\r\n", "\n"):
            raise SystemExit("Refusing deploy: live attendanceScan.js changed since snapshot")
        sftp.close()

        backup = create_backup(client, "staff-attendance-agfix113", persist=True,
                               sudo_password=cfg.sudo_password)
        print("BACKUP", json.dumps(backup, ensure_ascii=False))

        token = stamp()
        file_backups = [
            (f"/tmp/personnelAttendance.js.bak-agfix113-{token}", "personnelAttendance.js"),
            (f"/tmp/attendanceScan.js.bak-agfix113-{token}", "attendanceScan.js"),
        ]
        for dst, src in file_backups:
            rc, out, err = run_remote(
                client,
                f"cp -p {BACKEND_DIR}/{src} {dst} && ls -l {dst}",
                sudo=True, sudo_password=cfg.sudo_password, timeout=30,
            )
            if rc != 0:
                raise SystemExit(f"File backup failed for {src}: rc={rc}, err={err[:1000]}")
            print("FILE_BACKUP_OK", out.strip())

        tmp_back = f"/tmp/personnelAttendance.agfix113-{token}.js"
        tmp_scan = f"/tmp/attendanceScan.agfix113-{token}.js"
        upload(client, BACK_OUTPUT, tmp_back)
        upload(client, SCAN_OUTPUT, tmp_scan)
        for tmp_name, label in ((tmp_back, "backend"), (tmp_scan, "scanner")):
            rc, out, err = run_remote(client, f"node --check {tmp_name}", timeout=60)
            if rc != 0:
                raise SystemExit(f"Remote {label} node --check failed: rc={rc}, out={out[:2000]}, err={err[:2000]}")
            print("REMOTE_NODE_CHECK_OK", label)

        tmp_asset = f"/tmp/{ASSET}"
        tmp_index = f"/tmp/agfix113-index-{token}.html"
        upload(client, FRONT_OUTPUT, tmp_asset)
        upload(client, FRONT_INDEX, tmp_index)

        copy_cmd = (
            f"grep -q '{OLD_ASSET}' {FRONTEND_DIR}/index.html "
            f"&& cp {tmp_back} {BACKEND_DIR}/personnelAttendance.js "
            f"&& cp {tmp_scan} {BACKEND_DIR}/attendanceScan.js "
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
            f"grep -c 'personnel-attendance/check-in' {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -c \"app.delete('/personnel-leaves/:id'\" {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -c 'leave_flags' {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -c 'AGFIX116' {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -c 'hour === 24' {BACKEND_DIR}/attendanceScan.js; "
            f"grep -o 'index-AGFIX[0-9]*\\.js' {FRONTEND_DIR}/index.html | head -n 1"
        )
        rc, out, err = run_remote(client, verify_cmd, timeout=30)
        lines = [line.strip() for line in out.strip().splitlines() if line.strip()]
        if rc != 0 or lines[:5] != ["1", "1", "1", "1", "1"] or lines[-1:] != [ASSET]:
            raise SystemExit(f"Deploy verification failed: rc={rc}, lines={lines!r}, err={err!r}")
        print("BACKEND_ROUTES_OK", lines[:5])
        print("FRONTEND_REF_OK", lines[-1])

        pm2_cmd = (
            "env PATH=/usr/local/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin "
            + PM2_BIN + " restart alphagym-api"
        )
        rc, out, err = run_remote(client, pm2_cmd, sudo=True,
                                  sudo_password=cfg.sudo_password, timeout=90)
        if rc != 0:
            raise SystemExit(f"pm2 restart failed: rc={rc}, out={out[:2000]}, err={err[:2000]}")
        print("PM2_RESTART_OK")
        print("DEPLOY_OK", ASSET)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
