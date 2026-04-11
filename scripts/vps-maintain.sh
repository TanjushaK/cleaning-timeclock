#!/usr/bin/env bash
# Запуск на сервере Ubuntu (из каталога приложения или с копией скрипта):
#   sudo bash scripts/vps-maintain.sh
# Обновляет пакеты, удаляет лишнее, чистит кэш apt и сжимает журнал systemd.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get -y full-upgrade
apt-get -y autoremove
apt-get clean
journalctl --vacuum-time=30d --quiet 2>/dev/null || true

echo "=== df / ==="
df -h /
echo "=== journal ==="
journalctl --disk-usage 2>/dev/null || true
