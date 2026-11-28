"""Deploy AGFIX127: guarded member/personnel create + GET APIs and clean enroll close.

Backend-only. Frontend stays on index-AGFIX125.js.

Changes:
* POST /members, POST /agent/member: 201 create / 200 idempotent / 400 invalid /
  409 duplicate / 422 DB / 500 unexpected, with fingerprint summary.
* GET /members/:id and GET /personnel/:id: 200 / 400 / 404 / 500 with fingerprint state.
* POST /personnel: explicit 400/409/422/500 mapping and fingerprint summary.
* POST /credentials/enroll: guarded create, 201 response with fingerprint state.
* POST /agent/enrollments/:id/fail: 404 / 409 / 410 / 200; never overwrites a
  completed enrollment; expired rows become expired and active rows fail cleanly.
* /agent/enrollments/:id/complete responses include final fingerprint state.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shlex
import subprocess
import sys
from pathlib import Path

from common import BACKEND_DIR, FRONTEND_DIR, PM2_BIN, RemoteConfig, connect, run_remote, stamp, upload
from make_backup import create_backup

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / "local"
SCRIPTS = ROOT / "scripts"

SERVER_BASE = LOCAL / "live-current-server-20261128b.js"
PERSONNEL_BASE = LOCAL / "live-current-personnelAttendance-20261128b.js"
ATTENDANCE_BASE = LOCAL / "live-current-attendanceScan-20261128b.js"
GUARD_SOURCE = ROOT / "backend" / "userApiGuards.js"

SERVER_SHA = "3858f33c767db5e57d9d808069a3e85259fc7d0b88c46080e22021c7f1479102"
PERSONNEL_SHA = "0c12b08f7d2486b8f0f8cf3efff5094cb5fdacf0461f4b17925d5123cad749d2"
ATTENDANCE_SHA = "b0baaf74876f36c8c02cc5db4fa7a682d89db7c4db3042f2b8afb1263c39cb25"
FRONT_ASSET = "index-AGFIX125.js"
FRONT_SHA = "e79f99f7fd7f37f4cdc2021cbbc79e7ba2de06479116d86ee980d0523b7c1c16"


def load_base(path: Path, expected_sha: str) -> str:
    raw = path.read_bytes()
    got = hashlib.sha256(raw).hexdigest()
    if got != expected_sha:
        raise SystemExit(f"Snapshot hash mismatch for {path.name}: {got}")
    return raw.decode("utf-8").replace("\r\n", "\n")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_ASSERT failed for {label}: expected 1, got {count}")
    return text.replace(old, new, 1)


def replace_section(text: str, start: str, end: str, new_section: str, label: str) -> str:
    if text.count(start) != 1:
        raise SystemExit(f"SECTION_ASSERT failed for {label}: start count={text.count(start)}")
    i = text.index(start)
    j = text.find(end, i)
    if j < 0:
        raise SystemExit(f"SECTION_ASSERT failed for {label}: end marker missing")
    return text[:i] + new_section + text[j:]


def build_server() -> str:
    text = load_base(SERVER_BASE, SERVER_SHA)
    text = replace_once(
        text,
        "const { onMemberCreated } = require('./services/eventService');\n",
        "const { onMemberCreated } = require('./services/eventService');\n"
        "const { fingerprintSummary, classifyCreateError } = require('./userApiGuards');\n",
        "server guard require",
    )
    freeze_marker = "/* =========================\n   MEMBER SESSION FREEZE (جلسات اعضا)"
    get_member = """app.get('/members/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'شناسه عضو نامعتبر است', error_code: 'INVALID_MEMBER_ID' });
    }
    const row = memberWithSports(id);
    if (!row) {
      return res.status(404).json({ error: 'Member not found', error_code: 'MEMBER_NOT_FOUND' });
    }
    res.json({ ...row, fingerprint: fingerprintSummary(db, { member_id: id }) });
  } catch (err) {
    console.error('GET /members/:id', err);
    res.status(500).json({ error: 'Failed to get member', error_code: 'INTERNAL_ERROR' });
  }
});

"""
    text = replace_once(text, freeze_marker, get_member + freeze_marker, "member GET route")
    text = replace_once(
        text,
        "    res.status(201).json({ ...row, receipt, discount });",
        "    res.status(201).json({ ...row, receipt, discount, fingerprint: fingerprintSummary(db, { member_id: row.id }) });",
        "member create response",
    )
    old_catch = """  } catch (err) {
    console.error(err);
    if (err && err.status === 400) return res.status(400).json({ error: err.message });
    if (err && err.message && /کد عضویت/.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to create member' });
  }
});"""
    new_catch = """  } catch (err) {
    console.error('POST /members', err);
    if (err && err.status === 400) {
      return res.status(400).json({ error: err.message, error_code: 'VALIDATION_ERROR' });
    }
    if (err && err.message && /کد عضویت/.test(err.message)) {
      const duplicate = /قبلاً/.test(err.message);
      return res.status(duplicate ? 409 : 400).json({
        error: err.message,
        error_code: duplicate ? 'MEMBER_CODE_DUPLICATE' : 'MEMBER_CODE_INVALID',
      });
    }
    const mapped = classifyCreateError(err, 'Failed to create member');
    res.status(mapped.status).json(mapped.body);
  }
});"""
    text = replace_once(text, old_catch, new_catch, "member create catch")
    for token in (
        "require('./userApiGuards')",
        "app.get('/members/:id', requireAuth",
        "duplicate ? 'MEMBER_CODE_DUPLICATE'",
        "fingerprint: fingerprintSummary(db, { member_id: row.id })",
    ):
        if token not in text:
            raise SystemExit(f"SERVER_ASSERT failed: missing {token}")
    return text


def build_personnel() -> str:
    text = load_base(PERSONNEL_BASE, PERSONNEL_SHA)
    text = replace_once(
        text,
        "'use strict';\n\n/** Personnel registry",
        "'use strict';\n\nconst { fingerprintSummary, classifyCreateError } = require('./userApiGuards');\n\n/** Personnel registry",
        "personnel guard require",
    )
    post_personnel = "  app.post('/personnel', requireAuth, requireAdmin, (req, res) => {"
    get_personnel = """  app.get('/personnel/:id', requireAuth, (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'شناسه پرسنل نامعتبر است', error_code: 'INVALID_PERSONNEL_ID' });
      }
      const p = person(id);
      if (!p) return res.status(404).json({ error: 'پرسنل یافت نشد', error_code: 'PERSONNEL_NOT_FOUND' });
      res.json({ ...publicPersonnel(p), fingerprint: fingerprintSummary(db, { personnel_id: id }) });
    } catch (e) {
      console.error('GET /personnel/:id', e);
      res.status(500).json({ error: 'خطا در دریافت پرسنل', error_code: 'INTERNAL_ERROR' });
    }
  });

"""
    text = replace_once(text, post_personnel, get_personnel + post_personnel, "personnel GET route")
    text = replace_once(
        text,
        "      res.status(201).json(publicPersonnel(person(info.lastInsertRowid)));",
        "      const created = person(info.lastInsertRowid);\n"
        "      res.status(201).json({ ...publicPersonnel(created), fingerprint: fingerprintSummary(db, { personnel_id: created.id }) });",
        "personnel create response",
    )
    old_catch = "    } catch (e) { res.status(409).json({ error: e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'کد اثر انگشت یا ارتباط انتخاب‌شده تکراری است' : 'ثبت پرسنل ناموفق بود' }); }"
    new_catch = """    } catch (e) {
      console.error('POST /personnel', e);
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || /تکراری|UNIQUE/i.test(String(e.message || ''))) {
        return res.status(409).json({ error: 'کد اثر انگشت یا ارتباط انتخاب‌شده تکراری است', error_code: 'DUPLICATE' });
      }
      const mapped = classifyCreateError(e, 'ثبت پرسنل ناموفق بود');
      res.status(mapped.status).json(mapped.body);
    }"""
    text = replace_once(text, old_catch, new_catch, "personnel create catch")
    text = replace_once(
        text,
        "      res.json(publicPersonnel(person(existing.id)));",
        "      const updated = person(existing.id);\n"
        "      res.json({ ...publicPersonnel(updated), fingerprint: fingerprintSummary(db, { personnel_id: updated.id }) });",
        "personnel update response",
    )
    for token in (
        "require('./userApiGuards')",
        "app.get('/personnel/:id', requireAuth",
        "error_code: 'INVALID_PERSONNEL_ID'",
        "error_code: 'DUPLICATE'",
    ):
        if token not in text:
            raise SystemExit(f"PERSONNEL_ASSERT failed: missing {token}")
    return text


ENROLL_HANDLER = """  app.post('/credentials/enroll', requireAuth, (req, res) => {
    try {
      const personnelId = Number(req.body && req.body.personnel_id);
      const memberId = Number(req.body && req.body.member_id);
      const kind = normKind((req.body && req.body.kind) || 'finger');
      const deviceId = req.body && req.body.device_id ? String(req.body.device_id).trim() : null;
      if (!['card', 'finger', 'code'].includes(kind)) {
        return res.status(400).json({ error: 'نوع شناسه نامعتبر است', error_code: 'INVALID_KIND' });
      }
      const ttl = Math.min(900, Math.max(30, Number(req.body && req.body.ttl_seconds) || 180));
      const note = req.body && req.body.note ? String(req.body.note) : null;

      if (Number.isInteger(personnelId) && personnelId > 0) {
        const person = db.prepare('SELECT * FROM personnel WHERE id = ? AND is_active = 1').get(personnelId);
        if (!person) return res.status(404).json({ error: 'پرسنل یافت نشد', error_code: 'PERSONNEL_NOT_FOUND' });
        db.prepare(`UPDATE credential_enrollments SET status = 'cancelled' WHERE personnel_id = ? AND kind = ? AND status = 'pending'`).run(personnelId, kind);
        const fohId = person.fingerprint_id ? String(person.fingerprint_id).trim() : String(800000 + personnelId);
        const info = db.prepare(`INSERT INTO credential_enrollments (member_id, personnel_id, kind, device_id, foh_member_id, expires_at, note) VALUES (0, ?, ?, ?, ?, datetime('now', ?), ?)`).run(personnelId, kind, deviceId, fohId, `+${ttl} seconds`, note);
        const row = db.prepare('SELECT * FROM credential_enrollments WHERE id = ?').get(info.lastInsertRowid);
        return res.status(201).json({
          ...row,
          member_name: person.full_name,
          personnel_name: person.full_name,
          member_code: String(person.id),
          ttl_seconds: ttl,
          instructions: kind === 'finger' ? 'انگشت پرسنل را روی سنسور دستگاه بگذارید (۳ بار)' : kind === 'card' ? 'کارت را روی کارتخوان بکشید' : 'کد را در دستگاه وارد کنید',
          fingerprint: fingerprintSummary(db, { personnel_id: personnelId }),
        });
      }

      if (!Number.isInteger(memberId) || memberId <= 0) {
        return res.status(400).json({ error: 'member_id یا personnel_id معتبر لازم است', error_code: 'INVALID_SUBJECT' });
      }
      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
      if (!member) return res.status(404).json({ error: 'Member not found', error_code: 'MEMBER_NOT_FOUND' });
      db.prepare(`UPDATE credential_enrollments SET status = 'cancelled' WHERE member_id = ? AND kind = ? AND status = 'pending' AND (personnel_id IS NULL OR personnel_id = 0)`).run(memberId, kind);
      let fohId = member.legacy_person_id ? String(member.legacy_person_id).trim() : '';
      if (!fohId) {
        fohId = String(900000 + memberId);
        db.prepare('UPDATE members SET legacy_person_id = ? WHERE id = ?').run(fohId, memberId);
      }
      const info = db.prepare(`INSERT INTO credential_enrollments (member_id, kind, device_id, foh_member_id, expires_at, note) VALUES (?, ?, ?, ?, datetime('now', ?), ?)`).run(memberId, kind, deviceId, fohId, `+${ttl} seconds`, note);
      const row = db.prepare('SELECT * FROM credential_enrollments WHERE id = ?').get(info.lastInsertRowid);
      res.status(201).json({
        ...row,
        member_name: member.name,
        member_code: member.member_code || '',
        ttl_seconds: ttl,
        instructions: kind === 'finger' ? 'انگشت را روی سنسور دستگاه بگذارید (۳ بار)' : kind === 'card' ? 'کارت را روی کارتخوان بکشید' : 'کد را در دستگاه وارد کنید',
        fingerprint: fingerprintSummary(db, { member_id: memberId }),
      });
    } catch (e) {
      console.error('[credentials/enroll]', e);
      const mapped = classifyCreateError(e, 'ثبت درخواست اثر انگشت ناموفق بود');
      res.status(mapped.status).json(mapped.body);
    }
  });

"""

FAIL_HANDLER = """  app.post('/agent/enrollments/:id/fail', agentAuth, (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = db.prepare('SELECT * FROM credential_enrollments WHERE id = ?').get(id);
      const utcNow = db.prepare("SELECT strftime('%Y-%m-%d %H:%M:%S','now') AS now").get().now;
      const decision = decideEnrollFailure(row, utcNow);
      if (decision.action === 'none') return res.status(decision.status).json(decision.body);
      if (decision.action === 'expire') {
        db.prepare("UPDATE credential_enrollments SET status = 'expired' WHERE id = ?").run(id);
        return res.status(decision.status).json(decision.body);
      }
      const member = Number(row.member_id)
        ? db.prepare('SELECT id, name, member_code FROM members WHERE id = ?').get(Number(row.member_id))
        : null;
      const person = Number(row.personnel_id)
        ? db.prepare('SELECT id, full_name FROM personnel WHERE id = ?').get(Number(row.personnel_id))
        : null;
      const message = String((req.body && req.body.error) || 'failed').slice(0, 500);
      db.prepare(`UPDATE credential_enrollments SET status = 'failed', note = ?, completed_at = datetime('now') WHERE id = ? AND status = 'pending'`).run(message, id);
      logScanEvent({
        member_id: member ? member.id : null,
        member_name: member ? member.name : person ? person.full_name : null,
        member_code: member ? member.member_code : person ? String(row.foh_member_id || person.id) : null,
        credential_kind: row.kind,
        credential_value: row.foh_member_id || null,
        device_id: row.device_id,
        device_name: deviceNameFor(row.device_id),
        status: 'enroll_failed',
        message: `ثبت ${row.kind === 'finger' ? 'اثر انگشت' : 'کارت'} انجام نشد: ${message}`,
      });
      res.status(decision.status).json(decision.body);
    } catch (e) {
      console.error('[agent/enrollments/:id/fail]', e);
      res.status(500).json({ ok: false, error: 'ثبت شکست اثر انگشت ناموفق بود', error_code: 'INTERNAL_ERROR' });
    }
  });

"""


def build_attendance() -> str:
    text = load_base(ATTENDANCE_BASE, ATTENDANCE_SHA)
    text = replace_once(
        text,
        "const crypto = require('crypto');\n",
        "const crypto = require('crypto');\n"
        "const { decideEnrollFailure, fingerprintSummary, classifyCreateError } = require('./userApiGuards');\n",
        "attendance guard require",
    )
    text = replace_section(
        text,
        "  app.post('/credentials/enroll', requireAuth, (req, res) => {",
        "  app.get('/credentials/enrollments', requireAuth, (req, res) => {",
        ENROLL_HANDLER,
        "credentials enroll handler",
    )
    text = replace_section(
        text,
        "  app.post('/agent/enrollments/:id/fail', agentAuth, (req, res) => {",
        "  /* ------------------------------------------------------------------ *\n   *  SMALL UTILITY",
        FAIL_HANDLER,
        "enroll fail handler",
    )
    text = replace_once(
        text,
        "      return res.json({ ok: true, enrollment_id: id, personnel_id: person.id, personnel_name: person.full_name, kind, value });",
        "      return res.json({ ok: true, enrollment_id: id, personnel_id: person.id, personnel_name: person.full_name, kind, value, fingerprint: fingerprintSummary(db, { personnel_id: person.id }) });",
        "personnel complete response",
    )
    text = replace_once(
        text,
        "    res.json({ ok: true, enrollment_id: id, member_id: member.id, member_name: member.name, kind, value });",
        "    res.json({ ok: true, enrollment_id: id, member_id: member.id, member_name: member.name, kind, value, fingerprint: fingerprintSummary(db, { member_id: member.id }) });",
        "member complete response",
    )
    text = replace_once(
        text,
        "      res.json({ ok: true, member_id: memberId, created });",
        "      res.status(created ? 201 : 200).json({ ok: true, member_id: memberId, created, fingerprint: fingerprintSummary(db, { member_id: memberId }) });",
        "agent member response",
    )
    old_catch = """    } catch (e) {
      console.error('[agent/member]', e);
      res.status(500).json({ ok: false, error: (e && e.message) || 'member upsert failed' });
    }"""
    new_catch = """    } catch (e) {
      console.error('[agent/member]', e);
      const mapped = classifyCreateError(e, 'member upsert failed');
      res.status(mapped.status).json({ ...mapped.body, ok: false });
    }"""
    text = replace_once(text, old_catch, new_catch, "agent member catch")
    for token in (
        "require('./userApiGuards')",
        "error_code: 'INVALID_SUBJECT'",
        "decideEnrollFailure(row, utcNow)",
        "res.status(created ? 201 : 200).json",
        "fingerprint: fingerprintSummary(db, { personnel_id: person.id })",
    ):
        if token not in text:
            raise SystemExit(f"ATTENDANCE_ASSERT failed: missing {token}")
    return text


def write_outputs() -> dict[str, Path]:
    outputs = {
        "server.js": LOCAL / "server.agfix127.js",
        "personnelAttendance.js": LOCAL / "personnelAttendance.agfix127.js",
        "attendanceScan.js": LOCAL / "attendanceScan.agfix127.js",
        "userApiGuards.js": LOCAL / "userApiGuards.agfix127.js",
    }
    for name, text in (
        ("server.js", build_server()),
        ("personnelAttendance.js", build_personnel()),
        ("attendanceScan.js", build_attendance()),
    ):
        outputs[name].write_bytes(text.replace("\n", "\r\n").encode("utf-8"))
    outputs["userApiGuards.js"].write_bytes(GUARD_SOURCE.read_bytes())
    for name, path in outputs.items():
        chk = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
        if chk.returncode != 0:
            raise SystemExit(f"node --check failed for {name}: {chk.stderr[:2000]}")
        print("NODE_CHECK_OK", name, len(path.read_bytes()), hashlib.sha256(path.read_bytes()).hexdigest())
    return outputs


def run_local_tests() -> None:
    test = ROOT / "tests" / "test_user_api_guards.py"
    cp = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", str(test)],
        capture_output=True, text=True, cwd=ROOT,
    )
    if cp.returncode != 0:
        raise SystemExit(f"pytest failed:\n{cp.stdout[-4000:]}\n{cp.stderr[-2000:]}")
    print("PYTEST_OK", cp.stdout.strip().splitlines()[-1])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm", help="Must be exactly WRITE")
    args = parser.parse_args()
    if args.confirm != "WRITE":
        raise SystemExit("--confirm WRITE is required")

    outputs = write_outputs()
    run_local_tests()

    cfg = RemoteConfig.from_env()
    client = connect(cfg)
    try:
        sftp = client.open_sftp()
        live_hashes = {}
        for name, expected in (
            ("server.js", SERVER_SHA),
            ("personnelAttendance.js", PERSONNEL_SHA),
            ("attendanceScan.js", ATTENDANCE_SHA),
        ):
            raw = sftp.open(BACKEND_DIR + "/" + name, "rb").read()
            got = hashlib.sha256(raw).hexdigest()
            if got != expected:
                raise SystemExit(f"Refusing deploy: live {name} changed ({got})")
            live_hashes[name] = got
        html = sftp.open(FRONTEND_DIR + "/index.html", "rb").read().decode("utf-8")
        if FRONT_ASSET not in html:
            raise SystemExit("Refusing deploy: live index.html is not on AGFIX125")
        front = sftp.open(FRONTEND_DIR + "/assets/" + FRONT_ASSET, "rb").read()
        if hashlib.sha256(front).hexdigest() != FRONT_SHA:
            raise SystemExit("Refusing deploy: live AGFIX125 asset changed")
        sftp.close()
        print("LIVE_SNAPSHOTS_OK", json.dumps(live_hashes, ensure_ascii=False))

        backup = create_backup(client, "user-api-guards-agfix127", persist=True, sudo_password=cfg.sudo_password)
        print("BACKUP", json.dumps(backup, ensure_ascii=False))

        token = stamp()
        backups = []
        for name in outputs:
            remote_backup = f"/tmp/{name}.bak-agfix127-{token}"
            backup_cmd = (
                f"if [ -f {BACKEND_DIR}/{name} ]; then "
                f"cp -p {BACKEND_DIR}/{name} {remote_backup} && ls -l {remote_backup}; "
                "else echo NEW_FILE; fi"
            )
            rc, out, err = run_remote(
                client, "sh -c " + shlex.quote(backup_cmd),
                sudo=True, sudo_password=cfg.sudo_password, timeout=30,
            )
            if rc != 0:
                raise SystemExit(f"File backup failed for {name}: rc={rc}, err={err[:1000]}")
            backups.append(remote_backup)
        print("FILE_BACKUPS_OK", len(backups))

        tmp_files = {}
        for name, local in outputs.items():
            stem, ext = name.rsplit('.', 1)
            remote_tmp = f"/tmp/{stem}.agfix127-{token}.{ext}"
            upload(client, local, remote_tmp)
            rc, out, err = run_remote(client, f"node --check {remote_tmp}", timeout=60)
            if rc != 0:
                raise SystemExit(f"Remote node --check failed for {name}: rc={rc}, err={err[:2000]}")
            tmp_files[name] = remote_tmp
        print("REMOTE_NODE_CHECK_OK", len(tmp_files))

        copy_cmd = (
            f"grep -q '{FRONT_ASSET}' {FRONTEND_DIR}/index.html "
            f"&& grep -q 'userApiGuards' {tmp_files['server.js']} "
            f"&& grep -q 'userApiGuards' {tmp_files['personnelAttendance.js']} "
            f"&& grep -q 'userApiGuards' {tmp_files['attendanceScan.js']} "
            f"&& cp {tmp_files['server.js']} {BACKEND_DIR}/server.js "
            f"&& cp {tmp_files['personnelAttendance.js']} {BACKEND_DIR}/personnelAttendance.js "
            f"&& cp {tmp_files['attendanceScan.js']} {BACKEND_DIR}/attendanceScan.js "
            f"&& cp {tmp_files['userApiGuards.js']} {BACKEND_DIR}/userApiGuards.js"
        )
        rc, out, err = run_remote(
            client, "sh -c " + shlex.quote(copy_cmd),
            sudo=True, sudo_password=cfg.sudo_password, timeout=60,
        )
        if rc != 0:
            raise SystemExit(f"Copy failed: rc={rc}, out={out!r}, err={err!r}")
        print("COPY_OK")

        verify_cmd = (
            f"grep -c 'app.get(\\'/members/:id\\', requireAuth' {BACKEND_DIR}/server.js; "
            f"grep -c 'MEMBER_CODE_DUPLICATE' {BACKEND_DIR}/server.js; "
            f"grep -c 'app.get(\\'/personnel/:id\\', requireAuth' {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -c 'INVALID_PERSONNEL_ID' {BACKEND_DIR}/personnelAttendance.js; "
            f"grep -c 'decideEnrollFailure(row, utcNow)' {BACKEND_DIR}/attendanceScan.js; "
            f"grep -c 'res.status(created ? 201 : 200).json' {BACKEND_DIR}/attendanceScan.js; "
            f"grep -c 'module.exports' {BACKEND_DIR}/userApiGuards.js; "
            f"grep -o 'index-AGFIX[0-9]*\\.js' {FRONTEND_DIR}/index.html | head -n 1"
        )
        rc, out, err = run_remote(client, verify_cmd, timeout=30)
        lines = [line.strip() for line in out.strip().splitlines() if line.strip()]
        expected = ["1", "1", "1", "1", "1", "1", "1", FRONT_ASSET]
        if rc != 0 or lines != expected:
            raise SystemExit(f"Deploy verification failed: rc={rc}, lines={lines!r}, expected={expected!r}, err={err!r}")
        print("VERIFY_OK", json.dumps(lines, ensure_ascii=False))

        pm2_cmd = (
            "env PATH=/usr/local/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin "
            + PM2_BIN + " restart alphagym-api"
        )
        rc, out, err = run_remote(client, pm2_cmd, sudo=True, sudo_password=cfg.sudo_password, timeout=90)
        if rc != 0:
            raise SystemExit(f"pm2 restart failed: rc={rc}, out={out[:2000]}, err={err[:2000]}")
        print("PM2_RESTART_OK")
        print("DEPLOY_OK AGFIX127 backend-only", FRONT_ASSET)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
