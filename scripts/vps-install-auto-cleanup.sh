#!/usr/bin/env bash
# Однократно на VPS от root/sudo: настраивает еженедельную автоочистку и усиливает periodic apt.
#   sudo bash scripts/vps-install-auto-cleanup.sh
set -euo pipefail

WEEKLY="/etc/cron.weekly/timeclock-cleanup"
APT_AUTO="/etc/apt/apt.conf.d/99local-autoclean"

cat >"$APT_AUTO" <<'EOF'
// Еженедельная очистка кэша списков пакетов (см. apt.conf(5))
APT::Periodic::AutocleanInterval "7";
EOF
chmod 644 "$APT_AUTO"

cat >"$WEEKLY" <<'SCRIPT'
#!/bin/sh
# Еженедельная автоочистка (без полного upgrade — его делает unattended-upgrades)
set -eu
export DEBIAN_FRONTEND=noninteractive
/usr/bin/apt-get clean
/usr/bin/apt-get autoremove -y >/dev/null 2>&1 || true
/usr/bin/journalctl --vacuum-time=45d --quiet 2>/dev/null || true
SCRIPT
chmod 755 "$WEEKLY"

echo "Installed: $APT_AUTO"
echo "Installed: $WEEKLY"
echo "systemd timers for apt (unattended-upgrades):"
systemctl list-timers 'apt*' 'dpkg*' 2>/dev/null || true
