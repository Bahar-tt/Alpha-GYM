/**
 * Attendance + credentials (card / fingerprint / code) + devices + agent sync.
 *
 * Mount: require('./attendanceScan')(app, db, { requireAuth, requireAdmin, PORT });
 *
 * Flow:
 *   1) Panel asks POST /credentials/enroll  -> pending enrollment row
 *   2) Desktop agent polls GET /agent/pending -> reads card / calls FOH bridge
 *   3) Agent posts POST /agent/enrollments/:id/complete -> credential saved
 *   4) Every scan is posted to POST /attendance/scan -> member + sport resolved
 */
const crypto = require('crypto');

module.exports = function registerAttendanceScan(app, db, opts = {}) {
  const requireAuth = typeof opts.requireAuth === 'function' ? opts.requireAuth : (_q, _s, n) => n();
  const requireAdmin = typeof opts.requireAdmin === 'function' ? opts.requireAdmin : (_q, _s, n) => n();
  const PORT = opts.PORT || 3001;
  const AGENT_KEY = String(process.env.AGENT_KEY || 'alpha-gym-agent').trim();

  /* ------------------------------------------------------------------ *
   *  SCHEMA
   * ------------------------------------------------------------------ */
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      member_code TEXT,
      attended_at TEXT DEFAULT (datetime('now')),
      source TEXT DEFAULT 'scanner',
      device_id TEXT
    );

    CREATE TABLE IF NOT EXISTS member_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'card',
      value TEXT NOT NULL,
      label TEXT,
      device_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT,
      UNIQUE (kind, value)
    );
    CREATE INDEX IF NOT EXISTS idx_credentials_value ON member_credentials (kind, value);

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT,
      sport TEXT,
      location TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      version TEXT,
      status TEXT,
      last_seen TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS credential_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'finger',
      device_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      value TEXT,
      foh_member_id TEXT,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_enrollments_status ON credential_enrollments (status, expires_at);

    CREATE TABLE IF NOT EXISTS unknown_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT,
      kind TEXT,
      device_id TEXT,
      seen_at TEXT DEFAULT (datetime('now')),
      resolved_member_id INTEGER,
      resolved_at TEXT
    );

    -- Every scan attempt (matched, duplicate or unknown) is mirrored here so
    -- the browser can show instant scanner feedback without polling the
    -- attendance table (duplicate scans never create an attendance row).
    CREATE TABLE IF NOT EXISTS scan_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      member_name TEXT,
      member_code TEXT,
      phone TEXT,
      sport TEXT,
      credential_kind TEXT,
      credential_value TEXT,
      device_id TEXT,
      device_name TEXT,
      attendance_id INTEGER,
      status TEXT NOT NULL DEFAULT 'matched',
      duplicate INTEGER NOT NULL DEFAULT 0,
      expired INTEGER NOT NULL DEFAULT 0,
      total_sessions INTEGER,
      used_sessions INTEGER,
      remaining INTEGER,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scan_events_created ON scan_events (created_at);
  `);

  function hasColumn(table, col) {
    try {
      return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
    } catch (_e) {
      return false;
    }
  }
  function ensureColumn(table, col, type) {
    if (!hasColumn(table, col)) {
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      } catch (e) {
        console.warn(`[attendance] cannot add ${table}.${col}:`, e.message);
      }
    }
  }
  ensureColumn('members', 'legacy_person_id', 'TEXT');
  ensureColumn('attendances', 'sport', 'TEXT');
  ensureColumn('attendances', 'credential_kind', 'TEXT');
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_members_legacy ON members (legacy_person_id)');
  } catch (_e) { /* ignore */ }

  /* ------------------------------------------------------------------ *
   *  HELPERS
   * ------------------------------------------------------------------ */
  const pad = (n) => String(n).padStart(2, '0');
  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function nowIso() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  function normValue(v) {
    return String(v == null ? '' : v).trim().toUpperCase().replace(/[\s:.\-]/g, '');
  }
  function normKind(k) {
    const s = String(k || '').trim().toLowerCase();
    if (s === 'fingerprint' || s === 'finger' || s === 'foh') return 'finger';
    if (s === 'card' || s === 'rfid' || s === 'mifare' || s === 'uid') return 'card';
    if (s === 'code' || s === 'member_code' || s === 'personnel_code') return 'code';
    return s || 'card';
  }
  function remainingOf(row) {
    if (!row) return null;
    const total = Number(row.total_sessions) || 0;
    const used = Number(row.used_sessions) || 0;
    if (!total) return null;
    return Math.max(0, total - used);
  }
  function publicDevice(row) {
    if (!row) return null;
    return { ...row, sport: row.sport || '' };
  }
  function expireEnrollments() {
    try {
      db.prepare(
        `UPDATE credential_enrollments
         SET status = 'expired'
         WHERE status = 'pending' AND datetime(expires_at) < datetime('now')`
      ).run();
    } catch (_e) { /* ignore */ }
  }
  function pendingEnrollments(deviceId) {
    expireEnrollments();
    const dev = deviceId ? String(deviceId).trim() : '';
    return db.prepare(
      `SELECT e.id, e.member_id, e.kind, e.device_id, e.status, e.foh_member_id,
              e.created_at, e.expires_at, m.name AS member_name, m.member_code
       FROM credential_enrollments e
       LEFT JOIN members m ON m.id = e.member_id
       WHERE e.status = 'pending'
         AND (e.device_id IS NULL OR e.device_id = '' OR e.device_id = ?)
       ORDER BY e.id ASC`
    ).all(dev);
  }
  function primarySportFor(memberId) {
    const rows = db.prepare('SELECT * FROM member_sports WHERE member_id = ? ORDER BY id').all(memberId);
    return rows.find((r) => String(r.sport || '').trim() !== '') || rows[0] || null;
  }
  function memberPayload(member) {
    if (!member) return null;
    const sports = db.prepare('SELECT * FROM member_sports WHERE member_id = ? ORDER BY id').all(member.id);
    const primary = sports.find((s) => String(s.sport || '').trim() !== '') || sports[0] || null;
    return {
      ...member,
      sports,
      sport: sports.map((s) => s.sport).filter(Boolean).join(' + ') || member.sport || '',
      primary_sport: primary ? primary.sport || '' : '',
    };
  }
  function deviceNameFor(deviceId) {
    if (!deviceId) return null;
    try {
      const d = db.prepare('SELECT name FROM devices WHERE id = ?').get(String(deviceId));
      return d && d.name ? String(d.name) : String(deviceId);
    } catch (_e) {
      return String(deviceId);
    }
  }
  function logScanEvent(data = {}) {
    try {
      db.prepare(
        `INSERT INTO scan_events
           (member_id, member_name, member_code, phone, sport, credential_kind,
            credential_value, device_id, device_name, attendance_id, status,
            duplicate, expired, total_sessions, used_sessions, remaining, message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        data.member_id != null ? Number(data.member_id) : null,
        data.member_name || null,
        data.member_code || null,
        data.phone || null,
        data.sport || null,
        data.credential_kind || null,
        data.credential_value || null,
        data.device_id || null,
        data.device_name || null,
        data.attendance_id != null ? Number(data.attendance_id) : null,
        data.status || 'matched',
        data.duplicate ? 1 : 0,
        data.expired ? 1 : 0,
        data.total_sessions != null ? Number(data.total_sessions) : null,
        data.used_sessions != null ? Number(data.used_sessions) : null,
        data.remaining != null ? Number(data.remaining) : null,
        data.message || null
      );
      // Keep the feedback table tiny even after months of use.
      if (Math.random() < 0.02) {
        db.prepare("DELETE FROM scan_events WHERE created_at < datetime('now', '-14 days')").run();
      }
    } catch (e) {
      console.warn('[attendance] scan event log failed:', e.message);
    }
  }

  /**
   * Pick which member_sport a scan belongs to.
   * Priority: explicit request -> device mapping -> active non-empty with most
   * remaining sessions -> first row.
   */
  function selectSport(memberId, requestedSport, deviceId) {
    const rows = db.prepare('SELECT * FROM member_sports WHERE member_id = ? ORDER BY id').all(memberId);
    if (!rows.length) return null;
    const norm = (s) => String(s || '').trim().toLowerCase();
    const today = todayIso();

    if (requestedSport) {
      const hit = rows.find((r) => norm(r.sport) === norm(requestedSport));
      if (hit) return hit;
    }
    let deviceSport = null;
    if (deviceId) {
      const dev = db.prepare('SELECT sport FROM devices WHERE id = ?').get(String(deviceId));
      if (dev && String(dev.sport || '').trim()) deviceSport = String(dev.sport).trim();
    }
    if (deviceSport) {
      const hit = rows.find((r) => norm(r.sport) === norm(deviceSport));
      if (hit) return hit;
    }
    const named = rows.filter((r) => String(r.sport || '').trim() !== '');
    if (!named.length) return rows[0];
    named.sort((a, b) => {
      const aActive = String(a.expiry_date || '') >= today ? 0 : 1;
      const bActive = String(b.expiry_date || '') >= today ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const aRem = remainingOf(a);
      const bRem = remainingOf(b);
      if (aRem != null && bRem != null && aRem !== bRem) return bRem - aRem;
      return Number(a.id) - Number(b.id);
    });
    return named[0];
  }

  /** Resolve a raw scan / code to a member. */
  function resolveMember(b) {
    const rawKind = normKind(b.credential_kind || b.kind || (b.finger_id ? 'finger' : b.card_uid ? 'card' : ''));
    const rawValue = String(
      b.credential_value ?? b.card_uid ?? b.card_no ?? b.finger_id ?? b.fingerprint_id ??
      b.uid ?? b.code ?? b.member_code ?? b.personnel_code ?? ''
    ).trim();

    if (b.member_id != null && /^\d+$/.test(String(b.member_id).trim())) {
      const m = db.prepare('SELECT * FROM members WHERE id = ?').get(Number(b.member_id));
      if (m) return { member: m, matched: 'member_id', value: String(b.member_id), kind: 'id' };
    }
    if (!rawValue) return null;

    const kinds = rawKind ? [rawKind] : ['finger', 'card', 'code'];
    const credValue = normValue(rawValue);
    const lookupCred = db.prepare(
      'SELECT * FROM member_credentials WHERE is_active = 1 AND kind = ? AND value = ? COLLATE NOCASE'
    );
    for (const k of kinds) {
      const c = lookupCred.get(k, credValue);
      if (c) {
        const m = db.prepare('SELECT * FROM members WHERE id = ?').get(c.member_id);
        if (m) {
          try {
            db.prepare("UPDATE member_credentials SET last_used_at = datetime('now') WHERE id = ?").run(c.id);
          } catch (_e) { /* ignore */ }
          return { member: m, matched: `credential:${k}`, value: rawValue, kind: k, credential_id: c.id };
        }
      }
    }

    // Legacy FullSportDB person id (fingerprint DB key) -------------------
    // Only for fingerprint scans. A card UID or a typed code that happens
    // to equal a legacy id must not silently check in another member.
    if (rawKind === 'finger' || !rawKind) {
      let m = db.prepare('SELECT * FROM members WHERE legacy_person_id = ?').get(rawValue);
      if (m) return { member: m, matched: 'legacy_person_id', value: rawValue, kind: 'finger' };
    }

    // Exact membership code ----------------------------------------------
    let m = db.prepare('SELECT * FROM members WHERE member_code = ? COLLATE NOCASE').get(rawValue);
    if (m) return { member: m, matched: 'member_code', value: rawValue, kind: rawKind || 'code' };

    // Numeric membership code with leading zeros (old readers) ------------
    // Only when the scan is all digits. Never do substring matching: a card
    // UID such as "UNKNOWN-999" must stay unknown, not hit member code 999.
    if (/^\d{1,12}$/.test(rawValue)) {
      m = db.prepare(
        `SELECT * FROM members
         WHERE member_code IS NOT NULL AND TRIM(member_code) <> ''
           AND member_code NOT GLOB '*[^0-9]*'
           AND CAST(member_code AS INTEGER) = ?
         LIMIT 1`
      ).get(Number(rawValue));
      if (m) return { member: m, matched: 'member_code:normalized', value: rawValue, kind: rawKind || 'code' };
    }

    // Numeric database id ------------------------------------------------
    if (/^\d+$/.test(rawValue)) {
      m = db.prepare('SELECT * FROM members WHERE id = ?').get(Number(rawValue));
      if (m) return { member: m, matched: 'id', value: rawValue, kind: rawKind || 'id' };
    }

    return null;
  }

  /* ------------------------------------------------------------------ *
   *  SCAN
   * ------------------------------------------------------------------ */
  function handleScan(req, res, forcedSource) {
    const b = req.body || {};
    const source = forcedSource || b.source || 'scanner';
    const deviceId = b.device_id ? String(b.device_id).trim() : null;
    const resolved = resolveMember(b);
    const rawKind = normKind(b.credential_kind || b.kind || (b.finger_id ? 'finger' : 'card'));
    const rawValue = String(
      b.credential_value ?? b.card_uid ?? b.card_no ?? b.finger_id ?? b.fingerprint_id ??
      b.uid ?? b.code ?? b.member_code ?? b.personnel_code ?? ''
    ).trim();

    if (!resolved) {
      if (rawValue) {
        try {
          const dup = db.prepare(
            `SELECT id FROM unknown_scans
             WHERE value = ? AND resolved_at IS NULL AND seen_at >= datetime('now', '-15 seconds')
             LIMIT 1`
          ).get(rawValue);
          if (!dup) {
            db.prepare('INSERT INTO unknown_scans (value, kind, device_id) VALUES (?, ?, ?)')
              .run(rawValue, rawKind, deviceId);
          }
        } catch (e) {
          console.warn('[attendance] unknown scan log failed:', e.message);
        }
      }
      logScanEvent({
        credential_kind: rawKind,
        credential_value: rawValue || null,
        device_id: deviceId,
        device_name: deviceNameFor(deviceId),
        status: 'unknown',
        message: rawValue ? `شناسه ${rawValue} به هیچ عضوی متصل نیست` : 'شناسه‌ای ارسال نشده است',
      });
      return res.status(404).json({
        ok: false,
        success: false,
        unknown: true,
        error: 'Member not found',
        message: rawValue ? `کارت/اثر انگشت (${rawValue}) به هیچ عضوی متصل نیست` : 'شناسه‌ای ارسال نشده است',
        code: rawValue,
      });
    }

    try {
      const member = resolved.member;

      // duplicate suppression (same member within 45 seconds)
      const recent = db.prepare(
        `SELECT * FROM attendances
         WHERE member_id = ? AND datetime(COALESCE(attended_at, 'now')) >= datetime('now', '-45 seconds')
         ORDER BY id DESC LIMIT 1`
      ).get(member.id);
      if (recent) {
        const sportRow = selectSport(member.id, b.sport, deviceId);
        const sportName = recent.sport || (sportRow ? sportRow.sport : '') || '';
        const total = sportRow ? Number(sportRow.total_sessions) || 0 : Number(member.total_sessions) || 0;
        const used = sportRow ? Number(sportRow.used_sessions) || 0 : Number(member.used_sessions) || 0;
        const remaining = total ? Math.max(0, total - used) : null;
        const expired = member.expiry_date ? String(member.expiry_date) < todayIso() : false;
        logScanEvent({
          member_id: member.id,
          member_name: member.name,
          member_code: member.member_code,
          phone: member.phone,
          sport: sportName,
          credential_kind: resolved.kind || rawKind,
          credential_value: rawValue || null,
          device_id: deviceId,
          device_name: deviceNameFor(deviceId),
          attendance_id: recent.id,
          status: 'duplicate',
          duplicate: true,
          expired,
          total_sessions: total,
          used_sessions: used,
          remaining,
          message: `تردد ${member.name} قبلاً ثبت شده است`,
        });
        return res.json({
          ok: true,
          success: true,
          duplicate: true,
          message: `تردد ${member.name} قبلاً ثبت شده است`,
          member: memberPayload(member),
          sport: sportName,
          member_sport_id: sportRow ? sportRow.id : null,
          remaining: sportRow ? remainingOf(sportRow) : remaining,
          expired,
          matched_by: resolved.matched,
        });
      }

      const sportRow = selectSport(member.id, b.sport, deviceId);

      let attendedAt = null;
      if (b.scan_time && !Number.isNaN(Date.parse(b.scan_time))) {
        attendedAt = new Date(b.scan_time).toISOString();
      }

      const insert = db.prepare(
        `INSERT INTO attendances (member_id, member_code, attended_at, source, device_id, sport, credential_kind)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      const info = attendedAt
        ? insert.run(member.id, member.member_code || rawValue || null, attendedAt, source, deviceId, sportRow ? sportRow.sport || '' : '', resolved.kind)
        : db.prepare(
          `INSERT INTO attendances (member_id, member_code, source, device_id, sport, credential_kind)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(member.id, member.member_code || rawValue || null, source, deviceId, sportRow ? sportRow.sport || '' : '', resolved.kind);

      if (sportRow) {
        db.prepare(
          'UPDATE member_sports SET used_sessions = COALESCE(used_sessions, 0) + 1 WHERE id = ?'
        ).run(sportRow.id);
      }
      db.prepare(
        'UPDATE members SET used_sessions = COALESCE(used_sessions, 0) + 1 WHERE id = ?'
      ).run(member.id);

      const expired = member.expiry_date ? String(member.expiry_date) < todayIso() : false;
      const sportName = sportRow ? String(sportRow.sport || '') : '';
      const remaining = sportRow ? remainingOf({ ...sportRow, used_sessions: (Number(sportRow.used_sessions) || 0) + 1 }) : null;
      const updatedMember = db.prepare('SELECT * FROM members WHERE id = ?').get(member.id) || member;
      const totalSessions = sportRow ? Number(sportRow.total_sessions) || 0 : Number(updatedMember.total_sessions) || 0;
      const usedSessions = sportRow
        ? (Number(sportRow.used_sessions) || 0) + 1
        : Number(updatedMember.used_sessions) || 0;
      logScanEvent({
        member_id: member.id,
        member_name: member.name,
        member_code: member.member_code,
        phone: member.phone,
        sport: sportName,
        credential_kind: resolved.kind || rawKind,
        credential_value: rawValue || null,
        device_id: deviceId,
        device_name: deviceNameFor(deviceId),
        attendance_id: info.lastInsertRowid,
        status: 'matched',
        duplicate: false,
        expired,
        total_sessions: totalSessions,
        used_sessions: usedSessions,
        remaining: totalSessions ? Math.max(0, totalSessions - usedSessions) : null,
        message: expired
          ? `تردد ${member.name} ثبت شد (عضویت منقضی است)`
          : `تردد ${member.name} ثبت شد${sportName ? ' - ' + sportName : ''}`,
      });

      return res.json({
        ok: true,
        success: true,
        message: expired
          ? `تردد ${member.name} ثبت شد (عضویت منقضی است)`
          : `تردد ${member.name} ثبت شد${sportName ? ' - ' + sportName : ''}`,
        attendance_id: info.lastInsertRowid,
        member: memberPayload(updatedMember),
        sport: sportName,
        member_sport_id: sportRow ? sportRow.id : null,
        remaining,
        expired,
        matched_by: resolved.matched,
        device_id: deviceId,
      });
    } catch (e) {
      console.error('[attendance/scan]', e);
      return res.status(500).json({ ok: false, error: 'Failed to record scan' });
    }
  }

  app.get('/attendance/scan/health', (_req, res) => {
    res.json({ ok: true, endpoint: '/attendance/scan', mode: 'credentials-v2', port: PORT, agent_key_required: true });
  });

  app.post('/attendance/scan', (req, res) => {
    // Optional hardening: only the desktop agent (which sends x-agent-key)
    // may create scans. Enable with REQUIRE_AGENT_KEY_FOR_SCANS=1.
    if (String(process.env.REQUIRE_AGENT_KEY_FOR_SCANS || '') === '1') {
      if (agentKeyFrom(req) !== AGENT_KEY) {
        return res.status(401).json({ ok: false, error: 'invalid agent key' });
      }
    }
    return handleScan(req, res);
  });
  app.post('/attendance/manual', requireAuth, (req, res) => handleScan(req, res, 'manual'));

  /* ------------------------------------------------------------------ *
   *  AUTHENTICATED READ ENDPOINTS
   * ------------------------------------------------------------------ */
  app.get('/attendance/today', requireAuth, (_req, res) => {
    try {
      const rows = db.prepare(
        `SELECT a.id, a.member_id, m.name AS member_name, a.member_code,
                COALESCE(a.sport, '') AS sport,
                COALESCE(a.source, 'scanner') AS scan_type,
                a.device_id, COALESCE(d.name, a.device_id) AS device_name,
                a.attended_at AS scan_time
         FROM attendances a
         LEFT JOIN members m ON m.id = a.member_id
         LEFT JOIN devices d ON d.id = a.device_id
         WHERE date(a.attended_at) = date('now', 'localtime')
         ORDER BY datetime(a.attended_at) DESC
         LIMIT 300`
      ).all();
      res.json(rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to list today scans' });
    }
  });

  app.get('/attendance/recent', requireAuth, (req, res) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const rows = db.prepare(
        `SELECT a.id, a.member_id, m.name AS member_name, m.phone, a.member_code,
                COALESCE(a.sport, '') AS sport,
                COALESCE(a.source, 'scanner') AS scan_type,
                a.credential_kind, a.device_id,
                COALESCE(d.name, a.device_id) AS device_name,
                m.total_sessions, m.used_sessions,
                a.attended_at AS scan_time
         FROM attendances a
         LEFT JOIN members m ON m.id = a.member_id
         LEFT JOIN devices d ON d.id = a.device_id
         ORDER BY datetime(a.attended_at) DESC, a.id DESC
         LIMIT ?`
      ).all(limit);
      res.json(rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to list scans' });
    }
  });

  /**
   * Fast live feedback for the scanner widget.
   * - init=1 -> only return the current max id (browser avoids replaying old scans)
   * - after=<id> -> all scan attempts newer than <id>, including duplicates/unknowns
   */
  app.get('/attendance/live', requireAuth, (req, res) => {
    try {
      if (String(req.query.init || '') === '1') {
        const latest = db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM scan_events').get();
        return res.json({ ok: true, latest_id: Number(latest.id) || 0, events: [] });
      }
      const after = Math.max(0, Number(req.query.after) || 0);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
      const events = db.prepare(
        `SELECT * FROM scan_events WHERE id > ? ORDER BY id ASC LIMIT ?`
      ).all(after, limit);
      const latestId = events.length ? Number(events[events.length - 1].id) : after;
      res.json({ ok: true, latest_id: latestId, events });
    } catch (e) {
      console.error('[attendance/live]', e);
      res.status(500).json({ ok: false, error: 'Failed to read live scans' });
    }
  });

  app.get('/attendance/stats', requireAuth, (_req, res) => {
    try {
      const total = db.prepare('SELECT COUNT(*) AS c FROM members').get().c;
      const today = db.prepare(
        "SELECT COUNT(*) AS c FROM attendances WHERE date(attended_at) = date('now', 'localtime')"
      ).get().c;
      const todayPeople = db.prepare(
        "SELECT COUNT(DISTINCT member_id) AS c FROM attendances WHERE date(attended_at) = date('now', 'localtime')"
      ).get().c;
      const active = db.prepare("SELECT COUNT(*) AS c FROM members WHERE date(expiry_date) >= date('now')").get().c;
      const expired = db.prepare("SELECT COUNT(*) AS c FROM members WHERE date(expiry_date) < date('now')").get().c;
      const pendingEnrollments = db.prepare(
        "SELECT COUNT(*) AS c FROM credential_enrollments WHERE status = 'pending' AND datetime(expires_at) >= datetime('now')"
      ).get().c;
      const onlineDevices = db.prepare(
        "SELECT COUNT(*) AS c FROM devices WHERE is_active = 1 AND last_seen IS NOT NULL AND datetime(last_seen) >= datetime('now', '-5 minutes')"
      ).get().c;
      res.json({
        total_members: total,
        today_scans: today,
        today_people: todayPeople,
        active_members: active,
        expired_members: expired,
        pending_enrollments: pendingEnrollments,
        online_devices: onlineDevices,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  /* ------------------------------------------------------------------ *
   *  CREDENTIALS
   * ------------------------------------------------------------------ */
  function credentialsFor(memberId) {
    return db.prepare(
      'SELECT * FROM member_credentials WHERE member_id = ? ORDER BY kind, id'
    ).all(memberId);
  }

  app.get('/members/:id/credentials', requireAuth, (req, res) => {
    const memberId = Number(req.params.id);
    const member = db.prepare('SELECT id, name, member_code, legacy_person_id FROM members WHERE id = ?').get(memberId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    expireEnrollments();
    const pending = db.prepare(
      `SELECT id, kind, device_id, status, created_at, expires_at
       FROM credential_enrollments
       WHERE member_id = ? AND status = 'pending' AND datetime(expires_at) >= datetime('now')
       ORDER BY id DESC`
    ).all(memberId);
    res.json({ member, credentials: credentialsFor(memberId), pending_enrollments: pending });
  });

  app.post('/members/:id/credentials', requireAuth, (req, res) => {
    const memberId = Number(req.params.id);
    const member = db.prepare('SELECT id, name FROM members WHERE id = ?').get(memberId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    const kind = normKind(req.body && req.body.kind);
    const value = normValue(req.body && (req.body.value || req.body.card_uid || req.body.finger_id));
    if (!value) return res.status(400).json({ error: 'مقدار کارت/اثر انگشت الزامی است' });
    if (!['card', 'finger', 'code'].includes(kind)) {
      return res.status(400).json({ error: 'نوع شناسه نامعتبر است' });
    }
    const dup = db.prepare(
      'SELECT c.*, m.name AS member_name FROM member_credentials c LEFT JOIN members m ON m.id = c.member_id WHERE c.kind = ? AND c.value = ? COLLATE NOCASE'
    ).get(kind, value);
    if (dup) {
      return res.status(409).json({ error: `این شناسه قبلاً برای «${dup.member_name || 'عضو دیگر'}» ثبت شده است` });
    }
    const info = db.prepare(
      'INSERT INTO member_credentials (member_id, kind, value, label, device_id) VALUES (?, ?, ?, ?, ?)'
    ).run(memberId, kind, value, req.body.label ? String(req.body.label) : null, req.body.device_id ? String(req.body.device_id) : null);
    res.status(201).json(db.prepare('SELECT * FROM member_credentials WHERE id = ?').get(info.lastInsertRowid));
  });

  app.delete('/credentials/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM member_credentials WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Credential not found' });
    db.prepare('DELETE FROM member_credentials WHERE id = ?').run(id);
    res.json({ ok: true, deleted: id, kind: row.kind, value: row.value });
  });

  /* ------------------------------------------------------------------ *
   *  ENROLLMENT (panel -> agent)
   * ------------------------------------------------------------------ */
  app.post('/credentials/enroll', requireAuth, (req, res) => {
    const memberId = Number(req.body && req.body.member_id);
    const kind = normKind((req.body && req.body.kind) || 'finger');
    const deviceId = req.body && req.body.device_id ? String(req.body.device_id).trim() : null;
    if (!['card', 'finger', 'code'].includes(kind)) {
      return res.status(400).json({ error: 'نوع شناسه نامعتبر است' });
    }
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    // one pending enrollment per member+kind
    db.prepare(
      `UPDATE credential_enrollments SET status = 'cancelled'
       WHERE member_id = ? AND kind = ? AND status = 'pending'`
    ).run(memberId, kind);

    let fohId = member.legacy_person_id ? String(member.legacy_person_id).trim() : '';
    if (!fohId) {
      // fingerprint device stores numeric ids; reserve a private high range
      fohId = String(900000 + Number(member.id));
      db.prepare('UPDATE members SET legacy_person_id = ? WHERE id = ?').run(fohId, member.id);
    }

    const ttl = Math.min(900, Math.max(30, Number(req.body && req.body.ttl_seconds) || 180));
    const info = db.prepare(
      `INSERT INTO credential_enrollments (member_id, kind, device_id, foh_member_id, expires_at, note)
       VALUES (?, ?, ?, ?, datetime('now', ?), ?)`
    ).run(memberId, kind, deviceId, fohId, `+${ttl} seconds`, req.body && req.body.note ? String(req.body.note) : null);

    const row = db.prepare('SELECT * FROM credential_enrollments WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({
      ...row,
      member_name: member.name,
      member_code: member.member_code || '',
      ttl_seconds: ttl,
      instructions: kind === 'finger'
        ? 'انگشت را روی سنسور دستگاه بگذارید (۳ بار)'
        : kind === 'card'
          ? 'کارت را روی کارت‌خوان بکشید'
          : 'کد را در دستگاه وارد کنید',
    });
  });

  app.get('/credentials/enrollments', requireAuth, (req, res) => {
    expireEnrollments();
    const rows = db.prepare(
      `SELECT e.*, m.name AS member_name, m.member_code
       FROM credential_enrollments e
       LEFT JOIN members m ON m.id = e.member_id
       ORDER BY e.id DESC LIMIT 40`
    ).all();
    res.json(rows);
  });

  app.post('/credentials/enrollments/:id/cancel', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM credential_enrollments WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Enrollment not found' });
    if (row.status !== 'pending') return res.status(409).json({ error: 'این درخواست دیگر فعال نیست' });
    db.prepare("UPDATE credential_enrollments SET status = 'cancelled' WHERE id = ?").run(id);
    res.json({ ok: true });
  });

  /* ------------------------------------------------------------------ *
   *  DEVICES
   * ------------------------------------------------------------------ */
  app.get('/devices', requireAuth, (_req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM devices ORDER BY name, id').all();
      res.json(rows.map(publicDevice));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to list devices' });
    }
  });

  app.post('/devices', requireAuth, requireAdmin, (req, res) => {
    const id = String((req.body && req.body.id) || '').trim();
    if (!id) return res.status(400).json({ error: 'شناسه دستگاه الزامی است' });
    const dup = db.prepare('SELECT id FROM devices WHERE id = ?').get(id);
    if (dup) return res.status(409).json({ error: 'دستگاه با این شناسه قبلاً ثبت شده است' });
    db.prepare(
      'INSERT INTO devices (id, name, sport, location, is_active) VALUES (?, ?, ?, ?, ?)'
    ).run(
      id,
      req.body.name ? String(req.body.name).trim() : id,
      req.body.sport ? String(req.body.sport).trim() : null,
      req.body.location ? String(req.body.location).trim() : null,
      req.body.is_active === false || req.body.is_active === 0 ? 0 : 1
    );
    res.status(201).json(db.prepare('SELECT * FROM devices WHERE id = ?').get(id));
  });

  app.put('/devices/:id', requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Device not found' });
    const b = req.body || {};
    db.prepare(
      'UPDATE devices SET name = ?, sport = ?, location = ?, is_active = ? WHERE id = ?'
    ).run(
      b.name != null ? String(b.name).trim() : row.name,
      b.sport != null ? String(b.sport).trim() || null : row.sport,
      b.location != null ? String(b.location).trim() || null : row.location,
      b.is_active != null ? (b.is_active === false || b.is_active === 0 ? 0 : 1) : row.is_active,
      id
    );
    res.json(db.prepare('SELECT * FROM devices WHERE id = ?').get(id));
  });

  app.delete('/devices/:id', requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const row = db.prepare('SELECT id FROM devices WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Device not found' });
    db.prepare('DELETE FROM devices WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  /* ------------------------------------------------------------------ *
   *  UNKNOWN SCANS
   * ------------------------------------------------------------------ */
  app.get('/attendance/unknown', requireAuth, (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const rows = db.prepare(
      `SELECT u.*, COALESCE(d.name, u.device_id) AS device_name
       FROM unknown_scans u
       LEFT JOIN devices d ON d.id = u.device_id
       WHERE u.resolved_at IS NULL
       ORDER BY u.id DESC LIMIT ?`
    ).all(limit);
    res.json(rows);
  });

  app.post('/attendance/unknown/:id/resolve', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const memberId = Number(req.body && req.body.member_id);
    const row = db.prepare('SELECT * FROM unknown_scans WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Scan not found' });
    const member = db.prepare('SELECT id, name FROM members WHERE id = ?').get(memberId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    const kind = normKind(row.kind || 'card');
    const value = normValue(row.value);
    if (value) {
      const dup = db.prepare(
        'SELECT id FROM member_credentials WHERE kind = ? AND value = ? COLLATE NOCASE'
      ).get(kind, value);
      if (!dup) {
        db.prepare(
          'INSERT INTO member_credentials (member_id, kind, value, label, device_id) VALUES (?, ?, ?, ?, ?)'
        ).run(memberId, kind, value, 'از تردد ناشناس', row.device_id || null);
      }
    }
    db.prepare(
      "UPDATE unknown_scans SET resolved_member_id = ?, resolved_at = datetime('now') WHERE id = ?"
    ).run(memberId, id);
    res.json({ ok: true, member_id: memberId, member_name: member.name });
  });

  app.delete('/attendance/unknown/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    db.prepare(
      "UPDATE unknown_scans SET resolved_at = datetime('now') WHERE id = ?"
    ).run(id);
    res.json({ ok: true });
  });

  /* ------------------------------------------------------------------ *
   *  BULK SPORT ASSIGNMENT
   * ------------------------------------------------------------------ */
  app.post('/members/bulk-sport', requireAuth, requireAdmin, (req, res) => {
    const b = req.body || {};
    const sport = String(b.sport || '').trim();
    if (!sport) return res.status(400).json({ error: 'رشته ورزشی الزامی است' });
    const onlyEmpty = b.only_empty !== false;
    const coachId = b.coach_id != null && b.coach_id !== '' ? Number(b.coach_id) : null;
    const coachName = b.coach_name ? String(b.coach_name).trim() : null;
    const memberIds = Array.isArray(b.member_ids)
      ? b.member_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
      : null;

    try {
      let sql = 'SELECT id, member_id FROM member_sports WHERE 1=1';
      const params = [];
      if (onlyEmpty) sql += " AND (sport IS NULL OR TRIM(sport) = '')";
      if (memberIds && memberIds.length) {
        sql += ` AND member_id IN (${memberIds.map(() => '?').join(',')})`;
        params.push(...memberIds);
      }
      const rows = db.prepare(sql).all(...params);
      const update = db.prepare(
        'UPDATE member_sports SET sport = ?, coach_id = ?, coach_name = ? WHERE id = ?'
      );
      const tx = db.transaction(() => {
        for (const r of rows) {
          update.run(sport, coachId, coachName, r.id);
        }
      });
      tx();
      // keep legacy members.sport column in sync for members that now have a sport
      try {
        db.prepare(
          `UPDATE members SET sport = ?
           WHERE id IN (SELECT DISTINCT member_id FROM member_sports WHERE TRIM(COALESCE(sport,'')) <> '')`
        ).run(sport);
      } catch (_e) { /* ignore */ }
      res.json({ ok: true, updated: rows.length, sport, coach_id: coachId, coach_name: coachName });
    } catch (e) {
      console.error('[bulk-sport]', e);
      res.status(500).json({ error: 'Failed to assign sport' });
    }
  });

  /* ------------------------------------------------------------------ *
   *  AGENT API (desktop agent on gym PC)
   * ------------------------------------------------------------------ */
  function agentKeyFrom(req) {
    return String(
      (req.get && req.get('x-agent-key')) || req.query.key || (req.body && req.body.agent_key) || ''
    ).trim();
  }
  function agentAuth(req, res, next) {
    if (agentKeyFrom(req) !== AGENT_KEY) {
      return res.status(401).json({ ok: false, error: 'invalid agent key' });
    }
    next();
  }

  app.get('/agent/health', (_req, res) => {
    res.json({ ok: true, service: 'alpha-gym-agent-api', port: PORT, time: nowIso() });
  });

  app.post('/agent/heartbeat', agentAuth, (req, res) => {
    const b = req.body || {};
    const id = String(b.device_id || b.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'device_id is required' });
    db.prepare(
      `INSERT INTO devices (id, name, sport, version, status, last_seen)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         last_seen = datetime('now'),
         version = excluded.version,
         status = excluded.status,
         name = COALESCE(NULLIF(devices.name, ''), excluded.name),
         sport = COALESCE(devices.sport, excluded.sport)`
    ).run(
      id,
      b.name ? String(b.name).trim() : id,
      b.sport ? String(b.sport).trim() : null,
      b.version ? String(b.version).trim() : null,
      b.status ? String(b.status).trim() : 'online'
    );
    const pending = pendingEnrollments(id);
    res.json({ ok: true, pending_enrollments: pending });
  });

  app.get('/agent/pending', agentAuth, (req, res) => {
    const deviceId = String(req.query.device_id || '').trim();
    res.json({ ok: true, enrollments: pendingEnrollments(deviceId) });
  });

  app.get('/agent/sync', agentAuth, (req, res) => {
    try {
      const deviceId = String(req.query.device_id || '').trim();
      if (deviceId) {
        db.prepare(
          `INSERT INTO devices (id, name, last_seen, status)
           VALUES (?, ?, datetime('now'), 'online')
           ON CONFLICT(id) DO UPDATE SET last_seen = datetime('now'), status = 'online'`
        ).run(deviceId, deviceId);
      }
      const members = db.prepare(
        `SELECT id, name, phone, member_code, legacy_person_id, expiry_date, start_date, membership_type
         FROM members ORDER BY id`
      ).all();
      const credentials = db.prepare(
        `SELECT member_id, kind, value FROM member_credentials WHERE is_active = 1`
      ).all();
      const sports = db.prepare(
        `SELECT id, member_id, sport, expiry_date, total_sessions, used_sessions
         FROM member_sports ORDER BY member_id, id`
      ).all();
      const devices = db.prepare('SELECT * FROM devices').all().map(publicDevice);
      const device = devices.find((d) => d.id === deviceId) || null;
      res.json({
        ok: true,
        server_time: nowIso(),
        agent_key_required: true,
        device,
        devices,
        members,
        credentials,
        sports,
        enrollments: pendingEnrollments(deviceId),
      });
    } catch (e) {
      console.error('[agent/sync]', e);
      res.status(500).json({ ok: false, error: 'sync failed' });
    }
  });

  app.post('/agent/enrollments/:id/complete', agentAuth, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM credential_enrollments WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ ok: false, error: 'Enrollment not found' });
    if (row.status !== 'pending') {
      return res.status(409).json({ ok: false, error: `enrollment is ${row.status}` });
    }
    // compare in SQLite/UTC space (avoids server timezone bugs)
    const alive = row.expires_at
      ? db.prepare("SELECT CASE WHEN datetime(?) >= datetime('now') THEN 1 ELSE 0 END AS ok").get(row.expires_at).ok
      : 1;
    if (!alive) {
      db.prepare("UPDATE credential_enrollments SET status = 'expired' WHERE id = ?").run(id);
      return res.status(410).json({ ok: false, error: 'enrollment expired' });
    }
    const b = req.body || {};
    let value = b.value || b.card_uid || b.finger_id || '';
    if (!String(value).trim() && row.kind === 'finger') value = row.foh_member_id;
    value = normValue(value);
    if (!value) return res.status(400).json({ ok: false, error: 'value is required' });

    const kind = normKind(row.kind);
    const member = db.prepare('SELECT id, name FROM members WHERE id = ?').get(row.member_id);
    if (!member) return res.status(404).json({ ok: false, error: 'Member not found' });

    const dup = db.prepare(
      `SELECT c.*, m.name AS member_name FROM member_credentials c
       LEFT JOIN members m ON m.id = c.member_id
       WHERE c.kind = ? AND c.value = ? COLLATE NOCASE`
    ).get(kind, value);
    if (dup && Number(dup.member_id) !== Number(member.id)) {
      return res.status(409).json({
        ok: false,
        error: `این شناسه قبلاً برای «${dup.member_name || 'عضو دیگر'}» ثبت شده است`,
        member_id: dup.member_id,
      });
    }
    if (!dup) {
      db.prepare(
        'INSERT INTO member_credentials (member_id, kind, value, label, device_id) VALUES (?, ?, ?, ?, ?)'
      ).run(member.id, kind, value, b.label ? String(b.label) : 'ثبت از دستگاه', row.device_id || null);
    }
    db.prepare(
      `UPDATE credential_enrollments
       SET status = 'completed', value = ?, completed_at = datetime('now')
       WHERE id = ?`
    ).run(value, id);
    const fullMember = db.prepare('SELECT * FROM members WHERE id = ?').get(member.id) || member;
    logScanEvent({
      member_id: member.id,
      member_name: member.name,
      member_code: fullMember.member_code,
      phone: fullMember.phone,
      credential_kind: kind,
      credential_value: value,
      device_id: row.device_id,
      device_name: deviceNameFor(row.device_id),
      status: 'enrolled',
      total_sessions: fullMember.total_sessions,
      used_sessions: fullMember.used_sessions,
      remaining: Number(fullMember.total_sessions)
        ? Math.max(0, (Number(fullMember.total_sessions) || 0) - (Number(fullMember.used_sessions) || 0))
        : null,
      message: `${kind === 'finger' ? 'اثر انگشت' : 'کارت'} ${member.name} با موفقیت ثبت شد`,
    });
    res.json({
      ok: true,
      enrollment_id: id,
      member_id: member.id,
      member_name: member.name,
      kind,
      value,
    });
  });

  app.post('/agent/enrollments/:id/fail', agentAuth, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM credential_enrollments WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ ok: false, error: 'Enrollment not found' });
    const member = db.prepare('SELECT id, name, member_code FROM members WHERE id = ?').get(row.member_id);
    const message = String((req.body && req.body.error) || 'failed').slice(0, 500);
    db.prepare(
      `UPDATE credential_enrollments SET status = 'failed', note = ? WHERE id = ?`
    ).run(message, id);
    logScanEvent({
      member_id: row.member_id,
      member_name: member ? member.name : null,
      member_code: member ? member.member_code : null,
      credential_kind: row.kind,
      device_id: row.device_id,
      device_name: deviceNameFor(row.device_id),
      status: 'enroll_failed',
      message: `ثبت ${row.kind === 'finger' ? 'اثر انگشت' : 'کارت'} انجام نشد: ${message}`,
    });
    res.json({ ok: true });
  });

  /* ------------------------------------------------------------------ *
   *  SMALL UTILITY
   * ------------------------------------------------------------------ */
  app.get('/members/:id/next-foh-id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const m = db.prepare('SELECT id, legacy_person_id FROM members WHERE id = ?').get(id);
    if (!m) return res.status(404).json({ error: 'Member not found' });
    res.json({ member_id: id, legacy_person_id: m.legacy_person_id || String(900000 + id) });
  });
};
