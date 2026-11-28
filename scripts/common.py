"""Shared helpers for Alpha GYM ops scripts.

Credentials are loaded from environment variables or a local, ignored `.env`.
Nothing here logs or stores secrets.
"""

from __future__ import annotations

import base64
import datetime as _dt
import os
import re
from pathlib import Path
from typing import Dict, Tuple

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"

ENV_KEYS = (
    "ALPHAGYM_HOST",
    "ALPHAGYM_PORT",
    "ALPHAGYM_USER",
    "ALPHAGYM_PASSWORD",
    "ALPHAGYM_SUDO_PASSWORD",
)

BACKEND_DIR = "/var/www/alphagym/backend"
FRONTEND_DIR = "/var/www/alphagym/frontend"
DB_PATH = BACKEND_DIR + "/gym.db"
SCANNER_PATH = BACKEND_DIR + "/attendanceScan.js"
API_CHECK_URL = "http://127.0.0.1:3001/api/members"
PM2_BIN = "/usr/local/node/bin/pm2"


def load_env() -> Dict[str, str]:
    """Load .env values without overriding real environment variables."""
    values: Dict[str, str] = {}
    if ENV_FILE.exists():
        for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if key in ENV_KEYS:
                values[key] = value.strip().strip('"').strip("'")
    for key in ENV_KEYS:
        if os.environ.get(key):
            values[key] = os.environ[key]
    return values


class RemoteConfig:
    def __init__(self, host: str, port: int, user: str, password: str, sudo_password: str):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.sudo_password = sudo_password or password

    @classmethod
    def from_env(cls) -> "RemoteConfig":
        values = load_env()
        password = values.get("ALPHAGYM_PASSWORD") or ""
        if not password:
            raise SystemExit(
                "ALPHAGYM_PASSWORD is empty. Copy .env.example to .env and fill it locally."
            )
        try:
            port = int(values.get("ALPHAGYM_PORT") or "22")
        except ValueError:
            raise SystemExit("ALPHAGYM_PORT must be an integer.")
        return cls(
            host=values.get("ALPHAGYM_HOST") or "78.157.51.176",
            port=port,
            user=values.get("ALPHAGYM_USER") or "ubuntu",
            password=password,
            sudo_password=values.get("ALPHAGYM_SUDO_PASSWORD") or password,
        )


def connect(cfg: RemoteConfig):
    """Create a Paramiko SSH client. Import is lazy so verify_repo can run without it."""
    try:
        import paramiko
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise SystemExit("paramiko is not installed. Run: py -3 -m pip install -r requirements.txt") from exc

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        cfg.host,
        port=cfg.port,
        username=cfg.user,
        password=cfg.password,
        timeout=20,
        banner_timeout=60,
        auth_timeout=30,
    )
    return client


SECRET_PATTERNS = (
    re.compile(
        r"(?i)\b(password|passwd|pwd|secret|token|api[_-]?key|agent[_-]?key|authorization|bearer)\b"
        r"\s*[:=]\s*['\"]?(?P<value>[^\s'\";,}]{3,})"
    ),
    re.compile(
        r"(?i)\b(anydesk|teamviewer)\b[^\n]{0,60}?\b(password|pass|code|id)\b"
        r"\s*[:=]\s*['\"]?(?P<value>[^\s'\";,}]{3,})"
    ),
)


def redact_text(text: str) -> str:
    """Redact common secret assignments and URL credentials from output."""
    for pattern in SECRET_PATTERNS:
        text = pattern.sub(
            lambda m: m.group(0).replace(m.group("value"), "***REDACTED***"),
            text,
        )
    text = re.sub(r"(?i)(https?://)[^\s:@/]+:[^\s@/]+@", r"\1***REDACTED***@", text)
    return text


SENSITIVE_KEY_PARTS = ("phone", "mobile", "national_id", "agent_key", "password", "token", "secret")


def _mask(value: object) -> str:
    text = str(value)
    if len(text) <= 4:
        return "***"
    return text[:2] + "*" * max(0, len(text) - 4) + text[-2:]


def redact_row(row: dict) -> dict:
    out = {}
    for key, value in row.items():
        lowered = str(key).lower()
        if any(part in lowered for part in SENSITIVE_KEY_PARTS):
            out[key] = _mask(value) if value not in (None, "") else value
        else:
            out[key] = value
    return out


DENY_PATTERNS = (
    r"(?:^|[;&|]\s*)(?:sudo\s+)?(?:rm|rmdir|mv|cp|install|dd|truncate|shred|chmod|chown|chgrp|tee|kill|pkill|killall|systemctl|service|mount|umount|crontab|reboot|shutdown|halt)\b",
    r"\bpm2\s+(?:restart|reload|start|stop|delete|kill|save|resurrect)\b",
    r"\b(?:apt|apt-get|dpkg|yum|dnf|pip|pip3|npm|yarn|bun)\s+(?:install|remove|uninstall|update|upgrade)\b",
    r"\bgit\s+(?:push|commit|reset|clean|checkout|switch|branch|merge|rebase|stash)\b",
    r">>|>\s*[^|&\s]",
    r"\$\(",
    r"`",
    r"\bsed\s+-i\b",
    r"\bperl\s+-pi\b",
    r"\btouch\b",
    r"\bmkdir\b",
    r"\bpython3?\s+.*\b(?:unlink|rmtree|os\.remove|shutil\.move|shutil\.copy)\b",
)


def assert_readonly_command(command: str) -> None:
    """Static guard for remote_run.py. Not a sandbox; use explicit write flags for writes."""
    for pattern in DENY_PATTERNS:
        if re.search(pattern, command, flags=re.IGNORECASE):
            raise SystemExit(
                "Blocked by read-only guard: "
                + pattern
                + "\nUse --allow-write --confirm WRITE only if you truly intend a write."
            )


def run_remote(client, command: str, *, sudo: bool = False, sudo_password: str = "", timeout: int = 60) -> Tuple[int, str, str]:
    full = ("sudo -S -p '' " + command) if sudo else command
    stdin, stdout, stderr = client.exec_command(full, timeout=timeout)
    if sudo:
        stdin.write((sudo_password or "") + "\n")
        stdin.flush()
        try:
            stdin.channel.shutdown_write()
        except Exception:
            pass
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    rc = stdout.channel.recv_exit_status()
    return rc, redact_text(out), redact_text(err)


def run_remote_python(
    client,
    payload: str,
    *,
    sudo: bool = False,
    sudo_password: str = "",
    timeout: int = 60,
) -> Tuple[int, str, str]:
    encoded = base64.b64encode(payload.encode("utf-8")).decode("ascii")
    command = (
        "python3 -c \"import base64;exec(compile(base64.b64decode('"
        + encoded
        + "'), '<alphagym-ops>', 'exec'))\""
    )
    return run_remote(
        client,
        command,
        sudo=sudo,
        sudo_password=sudo_password,
        timeout=timeout,
    )


def upload(client, local: Path, remote: str) -> None:
    sftp = client.open_sftp()
    try:
        sftp.put(str(local), remote)
    finally:
        sftp.close()


def stamp() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%d%H%M%S")


def safe_token(value: str, default: str = "change", limit: int = 60) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-")
    return (cleaned or default)[:limit]


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def print_block(tag: str, out: str, err: str = "", rc: int | None = None) -> None:
    print(f"=== {tag}" + (f" rc={rc}" if rc is not None else "") + " ===")
    if out.strip():
        print(out.strip())
    if err.strip():
        print("STDERR " + err.strip()[:2000])
