#!/usr/bin/env bash
set -Eeuo pipefail

# Alpha Gym deployment helper.
# Usage:
#   sudo APP_DIR=/opt/alpha-gym BRANCH=master /tmp/alpha-reportfix-deploy.sh
# Optional:
#   DEPLOY_MODE=docker|systemd (default: docker)
#   SYSTEMD_UNIT=alpha-gym.service
#   HEALTH_URL=http://127.0.0.1:8000/health
#   COMPOSE_FILE=docker-compose.yml

APP_DIR="${APP_DIR:-/opt/alpha-gym}"
BRANCH="${BRANCH:-master}"
DEPLOY_MODE="${DEPLOY_MODE:-docker}"
SYSTEMD_UNIT="${SYSTEMD_UNIT:-alpha-gym.service}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8000/health}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/alpha-gym}"
LOCK_FILE="/var/lock/alpha-gym-deploy.lock"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

log() { printf '[alpha-deploy] %s\n' "$*"; }
fail() { log "ERROR: $*"; exit 1; }
cleanup() { rm -f "$LOCK_FILE"; }
trap cleanup EXIT
trap 'fail "deployment failed at line ${BASH_LINENO[0]}"' ERR

[[ "${EUID}" -eq 0 ]] || fail 'run with sudo/root'
command -v git >/dev/null || fail 'git is required'
command -v npm >/dev/null || fail 'npm is required'
command -v curl >/dev/null || fail 'curl is required'
[[ -d "$APP_DIR/.git" ]] || fail "not a git checkout: $APP_DIR"

mkdir -p "$BACKUP_ROOT"
( set -o noclobber; : > "$LOCK_FILE" ) 2>/dev/null || fail 'another deployment is already running'
mkdir -p "$BACKUP_DIR"

cd "$APP_DIR"
log "repository: $APP_DIR"
log "branch: $BRANCH"

# Do not destroy uncommitted server-side changes or secrets.
if [[ -n "$(git status --porcelain)" ]]; then
  fail 'working tree is not clean; commit or stash server-side changes first'
fi

log 'creating configuration and database backups'
for candidate in ".env" "backend/.env" "backend/gym.db" "data/gym.db"; do
  if [[ -f "$candidate" ]]; then
    cp -a "$candidate" "$BACKUP_DIR/$(echo "$candidate" | tr '/' '_')"
  fi
done

# If the application is already running in Compose, also copy the container DB.
if [[ "$DEPLOY_MODE" == "docker" ]] && command -v docker >/dev/null && [[ -f "$COMPOSE_FILE" ]]; then
  compose_service="$(docker compose -f "$COMPOSE_FILE" config --services 2>/dev/null | head -n1 || true)"
  if [[ -n "$compose_service" ]] && docker compose -f "$COMPOSE_FILE" ps --status running --services 2>/dev/null | grep -qx "$compose_service"; then
    docker compose -f "$COMPOSE_FILE" cp "$compose_service:/app/data/gym.db" "$BACKUP_DIR/container-gym.db" 2>/dev/null || true
  fi
fi

log 'fetching approved commit'
git fetch --prune origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

log 'installing exact locked dependencies'
npm ci
if [[ -f backend/package-lock.json ]]; then
  # Do not use --ignore-scripts: better-sqlite3 needs its native postinstall build.
  (cd backend && npm ci)
fi

log 'running pre-deploy validation'
npm run typecheck
npm run lint
npm run build
(cd backend && node --check server.js && node --check import-from-excel.js)

if [[ "$DEPLOY_MODE" == "docker" ]]; then
  command -v docker >/dev/null || fail 'docker is required for DEPLOY_MODE=docker'
  [[ -f "$COMPOSE_FILE" ]] || fail "compose file not found: $COMPOSE_FILE"
  log 'building and restarting Docker Compose'
  docker compose -f "$COMPOSE_FILE" build --pull
  docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
elif [[ "$DEPLOY_MODE" == "systemd" ]]; then
  command -v systemctl >/dev/null || fail 'systemctl is required for DEPLOY_MODE=systemd'
  log "restarting $SYSTEMD_UNIT"
  systemctl restart "$SYSTEMD_UNIT"
else
  fail "unknown DEPLOY_MODE: $DEPLOY_MODE"
fi

log "waiting for health endpoint: $HEALTH_URL"
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
    log 'health check passed'
    log "backup: $BACKUP_DIR"
    log 'deployment completed successfully'
    exit 0
  fi
  sleep 2
done

log 'health check failed; collecting service status'
if [[ "$DEPLOY_MODE" == "docker" ]]; then
  docker compose -f "$COMPOSE_FILE" ps || true
  docker compose -f "$COMPOSE_FILE" logs --tail=100 || true
else
  systemctl --no-pager --full status "$SYSTEMD_UNIT" || true
  journalctl -u "$SYSTEMD_UNIT" -n 100 --no-pager || true
fi
fail 'service did not become healthy; restore from the backup and inspect logs'
