const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

function readLocalVersion() {
  const candidates = [
    path.join(__dirname, '..', '..', 'VERSION'),
    path.join(__dirname, '..', 'VERSION'),
    path.join(process.cwd(), 'VERSION'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8').trim() || '0.0.0';
      }
    } catch {
      /* continue */
    }
  }
  try {
    const pkg = require(path.join(__dirname, '..', '..', 'package.json'));
    return pkg.version || '0.0.0';
  } catch {
    return process.env.APP_VERSION || '0.0.0';
  }
}

function parseSemver(v) {
  const m = String(v).replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isNewer(remote, local) {
  const a = parseSemver(remote);
  const b = parseSemver(local);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

async function fetchGithubLatest() {
  const owner = process.env.GITHUB_REPO_OWNER || 'mhakimii';
  const repo = process.env.GITHUB_REPO_NAME || 'Alpha-GYM';
  const branch = process.env.GITHUB_REPO_BRANCH || 'master';
  const token = process.env.GITHUB_TOKEN || '';

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Alpha-GYM-Updater',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let release = null;
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers });
    if (r.ok) release = await r.json();
  } catch {
    /* no releases */
  }

  let commit = null;
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${branch}`, { headers });
    if (r.ok) commit = await r.json();
  } catch {
    /* */
  }

  let remoteVersion = null;
  try {
    const r = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/VERSION`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (r.ok) remoteVersion = (await r.text()).trim();
  } catch {
    /* */
  }

  if (!remoteVersion && release?.tag_name) {
    remoteVersion = String(release.tag_name).replace(/^v/i, '');
  }

  return {
    owner,
    repo,
    branch,
    remote_version: remoteVersion,
    release_tag: release?.tag_name || null,
    release_name: release?.name || null,
    release_url: release?.html_url || null,
    release_body: release?.body || null,
    commit_sha: commit?.sha ? String(commit.sha).slice(0, 7) : null,
    commit_message: commit?.commit?.message?.split('\n')[0] || null,
    commit_date: commit?.commit?.committer?.date || commit?.commit?.author?.date || null,
    commit_url: commit?.html_url || null,
  };
}

function sqlLiteral(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return 'NULL';
    return String(val);
  }
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'bigint') return String(val);
  if (Buffer.isBuffer(val)) return `X'${val.toString('hex')}'`;
  const s = String(val).replace(/'/g, "''");
  return `'${s}'`;
}

function buildSqlDump(db) {
  const lines = [];
  lines.push('-- Alpha GYM full database dump');
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  // No BEGIN/COMMIT here — restore wraps its own transaction via better-sqlite3

  const objects = db
    .prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END, name",
    )
    .all();

  const tables = objects.filter((o) => o.type === 'table').map((o) => o.name);

  for (const name of [...tables].reverse()) {
    lines.push(`DROP TABLE IF EXISTS "${name}";`);
  }

  for (const obj of objects) {
    if (obj.type === 'table' && obj.sql) {
      lines.push(`${obj.sql};`);
    }
  }

  for (const table of tables) {
    const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
    if (!cols.length) continue;
    const colNames = cols.map((c) => `"${c.name}"`).join(', ');
    const rows = db.prepare(`SELECT * FROM "${table}"`).all();
    for (const row of rows) {
      const values = cols.map((c) => sqlLiteral(row[c.name])).join(', ');
      lines.push(`INSERT INTO "${table}" (${colNames}) VALUES (${values});`);
    }
  }

  for (const obj of objects) {
    if ((obj.type === 'index' || obj.type === 'trigger') && obj.sql) {
      lines.push(`${obj.sql};`);
    }
  }

  return lines.join('\n');
}

/** Strip outer transaction / pragma lines so better-sqlite3.transaction() does not nest BEGIN. */
function sanitizeRestoreSql(sql) {
  return String(sql)
    .replace(/^\s*PRAGMA\s+foreign_keys\s*=\s*(OFF|ON)\s*;?\s*$/gim, '')
    .replace(/^\s*BEGIN(\s+TRANSACTION)?\s*;?\s*$/gim, '')
    .replace(/^\s*COMMIT\s*;?\s*$/gim, '')
    .replace(/^\s*END\s*;?\s*$/gim, '')
    .replace(/^\s*ROLLBACK\s*;?\s*$/gim, '');
}

function collectPhotos(uploadsDir) {
  const photos = {};
  if (!uploadsDir || !fs.existsSync(uploadsDir)) return photos;
  let entries = [];
  try {
    entries = fs.readdirSync(uploadsDir);
  } catch {
    return photos;
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const full = path.join(uploadsDir, name);
    try {
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      if (st.size > 8 * 1024 * 1024) {
        console.warn(`[BACKUP] skip large photo ${name} (${st.size} bytes)`);
        continue;
      }
      photos[name] = fs.readFileSync(full).toString('base64');
    } catch (e) {
      console.warn('[BACKUP] photo read failed', name, e.message);
    }
  }
  return photos;
}

function tableCounts(db) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name);
  const counts = {};
  for (const t of tables) {
    try {
      counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
    } catch {
      counts[t] = -1;
    }
  }
  return counts;
}

function restorePhotos(uploadsDir, photos) {
  if (!photos || typeof photos !== 'object') return { restored: 0, errors: [] };
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  let restored = 0;
  const errors = [];
  for (const [name, b64] of Object.entries(photos)) {
    const safe = path.basename(String(name)).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!safe || safe === '.' || safe === '..') continue;
    try {
      const buf = Buffer.from(String(b64), 'base64');
      fs.writeFileSync(path.join(uploadsDir, safe), buf);
      restored += 1;
    } catch (e) {
      errors.push(`${safe}: ${e.message}`);
    }
  }
  return { restored, errors };
}

function registerSystemRoutes(app, db, options = {}) {
  const uploadsDir =
    options.uploadsDir ||
    path.join(
      process.env.DATA_DIR ||
        (process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : '/app/data'),
      'uploads',
    );

  app.get('/system/version', (_req, res) => {
    const version = readLocalVersion();
    res.json({
      version,
      app: 'Alpha GYM',
      self_update_enabled: process.env.ENABLE_SELF_UPDATE === 'true',
      node: process.version,
      env: process.env.NODE_ENV || 'development',
    });
  });

  app.get('/system/updates/check', async (_req, res) => {
    try {
      const local = readLocalVersion();
      const remote = await fetchGithubLatest();
      const hasUpdate =
        remote.remote_version != null ? isNewer(remote.remote_version, local) : false;
      const commitHint = !hasUpdate && remote.commit_sha ? true : false;

      res.json({
        local_version: local,
        update_available: hasUpdate,
        self_update_enabled: process.env.ENABLE_SELF_UPDATE === 'true',
        ...remote,
        note: hasUpdate
          ? 'نسخه جدید روی GitHub موجود است'
          : commitHint
            ? 'نسخه یکسان است؛ ممکن است کامیت‌های جدید بدون افزایش VERSION باشند'
            : 'شما روی آخرین نسخه هستید',
      });
    } catch (err) {
      console.error('updates/check', err);
      res.status(500).json({
        error: 'بررسی به‌روزرسانی ناموفق بود',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/system/updates/apply', async (req, res) => {
    if (process.env.ENABLE_SELF_UPDATE !== 'true') {
      return res.status(403).json({
        error:
          'به‌روزرسانی خودکار غیرفعال است. روی سرور ENABLE_SELF_UPDATE=true تنظیم کنید و مسیر پروژه را درست مانت کنید.',
        feasible: false,
      });
    }

    const projectDir = process.env.UPDATE_PROJECT_DIR || path.join(__dirname, '..', '..');
    const script =
      process.env.UPDATE_COMMAND ||
      'git pull origin master && (docker compose up -d --build || docker-compose up -d --build || npm run build)';

    try {
      const check = await fetchGithubLatest();
      const local = readLocalVersion();

      const { stdout, stderr } = await execAsync(script, {
        cwd: projectDir,
        timeout: 10 * 60 * 1000,
        env: { ...process.env },
        maxBuffer: 10 * 1024 * 1024,
      });

      const newVersion = readLocalVersion();

      res.json({
        ok: true,
        message: 'دستور به‌روزرسانی اجرا شد',
        previous_version: local,
        current_version: newVersion,
        remote: check,
        stdout: String(stdout || '').slice(-4000),
        stderr: String(stderr || '').slice(-2000),
      });
    } catch (err) {
      console.error('updates/apply', err);
      res.status(500).json({
        error: 'اجرای به‌روزرسانی ناموفق بود',
        detail: err instanceof Error ? err.message : String(err),
        stdout: err.stdout ? String(err.stdout).slice(-2000) : undefined,
        stderr: err.stderr ? String(err.stderr).slice(-2000) : undefined,
      });
    }
  });

  app.get('/system/backup', (req, res) => {
    try {
      const sql = buildSqlDump(db);
      const photos = collectPhotos(uploadsDir);
      const counts = tableCounts(db);
      const payload = {
        format: 'alpha-gym-backup',
        format_version: 1,
        exported_at: new Date().toISOString(),
        app_version: readLocalVersion(),
        tables: counts,
        photo_count: Object.keys(photos).length,
        sql,
        photos,
      };

      if (String(req.query.download || '') === '1') {
        const fname = `alpha-gym-backup-${new Date().toISOString().slice(0, 10)}.json`;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
        return res.send(JSON.stringify(payload));
      }

      res.json(payload);
    } catch (err) {
      console.error('system/backup', err);
      res.status(500).json({
        error: 'ساخت پشتیبان ناموفق بود',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get('/system/backup.sql', (_req, res) => {
    try {
      const sql = buildSqlDump(db);
      const fname = `alpha-gym-${new Date().toISOString().slice(0, 10)}.sql`;
      res.setHeader('Content-Type', 'application/sql; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
      res.send(sql);
    } catch (err) {
      console.error('system/backup.sql', err);
      res.status(500).json({ error: 'خروجی SQL ناموفق بود' });
    }
  });

  app.post('/system/restore', (req, res) => {
    try {
      const body = req.body || {};
      let sql = null;
      let photos = null;

      if (typeof body.sql === 'string' && body.sql.trim()) {
        sql = body.sql;
        photos = body.photos && typeof body.photos === 'object' ? body.photos : null;
      } else if (body.format === 'alpha-gym-backup' && body.sql) {
        sql = body.sql;
        photos = body.photos || null;
      }

      if (!sql || !String(sql).trim()) {
        return res.status(400).json({
          error: 'فایل پشتیبان نامعتبر است. باید فیلد sql یا فایل .sql داشته باشد.',
        });
      }

      const forbidden = /\b(ATTACH|DETACH|VACUUM\s+INTO)\b/i;
      if (forbidden.test(sql)) {
        return res.status(400).json({ error: 'دستورات غیرمجاز در فایل SQL' });
      }

      const cleanSql = sanitizeRestoreSql(sql);
      if (!cleanSql.trim()) {
        return res.status(400).json({ error: 'پس از پاک‌سازی، SQL خالی شد' });
      }

      const before = tableCounts(db);

      // better-sqlite3: never nest BEGIN TRANSACTION inside db.transaction()
      const prevFk = db.pragma('foreign_keys', { simple: true });
      db.pragma('foreign_keys = OFF');
      try {
        const run = db.transaction(() => {
          db.exec(cleanSql);
        });
        run();
      } finally {
        db.pragma(`foreign_keys = ${prevFk ? 'ON' : 'OFF'}`);
      }

      const photoResult = restorePhotos(uploadsDir, photos);
      const after = tableCounts(db);

      console.log('[RESTORE] done', { before, after, photos: photoResult.restored });

      res.json({
        ok: true,
        message: 'پشتیبان با موفقیت بازگردانی شد',
        tables_before: before,
        tables_after: after,
        photos_restored: photoResult.restored,
        photo_errors: photoResult.errors,
      });
    } catch (err) {
      console.error('system/restore', err);
      res.status(500).json({
        error: 'بازگردانی ناموفق بود',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get('/system/backup/stats', (_req, res) => {
    try {
      const counts = tableCounts(db);
      let photoCount = 0;
      if (fs.existsSync(uploadsDir)) {
        try {
          photoCount = fs.readdirSync(uploadsDir).filter((n) => !n.startsWith('.')).length;
        } catch {
          photoCount = 0;
        }
      }
      res.json({
        tables: counts,
        photo_count: photoCount,
        uploads_dir: uploadsDir,
        app_version: readLocalVersion(),
      });
    } catch (err) {
      res.status(500).json({ error: 'خواندن آمار ناموفق بود' });
    }
  });
}

module.exports = { registerSystemRoutes, readLocalVersion, sanitizeRestoreSql };
