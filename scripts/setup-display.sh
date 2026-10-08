#!/usr/bin/env bash
# Optional, portable display for cloud tests. No system installation and no trust bypass.
set -euo pipefail
tools_root="${MAGICCAD_TOOLS_ROOT:-/workspace/.tools}"
apt_root="$tools_root/apt"
mkdir -p "$apt_root/etc/apt/sources.list.d" "$apt_root/etc/apt/apt.conf.d" "$apt_root/etc/apt/preferences.d" "$apt_root/var/lib/apt/lists/partial" "$apt_root/var/cache/apt/archives/partial" "$tools_root/xvfb-debs"
cat > "$apt_root/etc/apt/sources.list" <<'SOURCES'
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie main
SOURCES
cat > "$apt_root/apt.conf" <<CONFIG
Dir "$apt_root";
Dir::State "var/lib/apt";
Dir::Cache "var/cache/apt";
Dir::Etc "etc/apt";
Dir::State::status "/var/lib/dpkg/status";
APT::Sandbox::User "$(id -un)";
CONFIG
APT_CONFIG="$apt_root/apt.conf" /usr/bin/apt-get update
cd "$tools_root/xvfb-debs"
APT_CONFIG="$apt_root/apt.conf" /usr/bin/apt-get download xvfb libxfont2 xserver-common
for package in ./*.deb; do dpkg-deb -x "$package" "$tools_root/xvfb"; done
