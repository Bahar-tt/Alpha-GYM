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

  // 1) try latest release
  let release = null;
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers });
    if (r.ok) release = await r.json();
  } catch {
    /* no releases */
  }

  // 2) latest commit on branch
  let commit = null;
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${branch}`, { headers });
    if (r.ok) commit = await r.json();
  } catch {
    /* */
  }

  // 3) VERSION file from repo
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

function registerSystemRoutes(app) {
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

      // اگر VERSION یکسان بود ولی commit جدیدتر باشد، فقط اطلاع بده
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
      // بررسی اولیه
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
}

module.exports = { registerSystemRoutes, readLocalVersion };
