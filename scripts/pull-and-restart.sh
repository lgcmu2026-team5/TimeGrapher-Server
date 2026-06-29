#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-tg-gemini-backend}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8787/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-10}"
HEALTH_RETRY_DELAY_SECONDS="${HEALTH_RETRY_DELAY_SECONDS:-1}"

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
for attempt in $(seq 1 "${HEALTH_RETRIES}"); do
  if curl -fsS "${HEALTH_URL}"; then
    echo
    echo "==> Done"
    exit 0
  fi

  if [ "${attempt}" -lt "${HEALTH_RETRIES}" ]; then
    echo "Health check failed; retrying in ${HEALTH_RETRY_DELAY_SECONDS}s (${attempt}/${HEALTH_RETRIES})"
    sleep "${HEALTH_RETRY_DELAY_SECONDS}"
  fi
done

echo "Health check failed after ${HEALTH_RETRIES} attempts."
sudo journalctl -u "${SERVICE_NAME}" -n 50 --no-pager
exit 1
