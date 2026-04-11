#!/usr/bin/env bash
# Example one-shot deploy on VPS (adjust APP_DIR and SERVICE_NAME).
# After merge to main: git pull, install, build, restart, readiness-check.
set -euo pipefail

APP_DIR="${APP_DIR:-/root/cleaning-timeclock}"
SERVICE_NAME="${SERVICE_NAME:-cleaning-timeclock}"

cd "$APP_DIR"
git pull origin main
npm ci
npm run build
sudo systemctl restart "$SERVICE_NAME"

bash scripts/readiness-check.sh "http://127.0.0.1:3000" 40 1
