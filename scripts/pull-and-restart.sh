#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-tg-gemini-backend}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8787/health}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo "==> Pulling latest changes in ${REPO_ROOT}"
git pull --ff-only

echo "==> Restarting ${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"

echo "==> Checking ${SERVICE_NAME} status"
sudo systemctl status "${SERVICE_NAME}" --no-pager

echo "==> Checking health endpoint: ${HEALTH_URL}"
curl -fsS "${HEALTH_URL}"
echo

echo "==> Done"
