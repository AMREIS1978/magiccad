#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
tools_root="${MAGICCAD_TOOLS_ROOT:-/workspace/.tools}"
revision=e3774bd4020fcfebb68150361db74b8b34d170fe
mkdir -p "$tools_root"
if [[ ! -x "$tools_root/cmake-venv/bin/cmake" ]]; then
  python3 -m venv "$tools_root/cmake-venv"
fi
"$tools_root/cmake-venv/bin/python" -m pip install --disable-pip-version-check --cache-dir "$tools_root/pip-cache" cmake==3.31.10
if [[ ! -d "$tools_root/libredwg-source/.git" ]]; then
  git clone --depth 1 --branch 0.13.4 https://github.com/LibreDWG/libredwg.git "$tools_root/libredwg-source"
fi
if [[ "$(git -C "$tools_root/libredwg-source" rev-parse HEAD)" != "$revision" ]]; then
  echo 'LibreDWG source revision differs from the tested version; no files were reset.' >&2
  exit 1
fi
git -C "$tools_root/libredwg-source" submodule update --init --depth 1 jsmn
cd "$tools_root/libredwg-source"
"$tools_root/cmake-venv/bin/cmake" -S . -B "$tools_root/libredwg-build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DENABLE_LTO=OFF -DDISABLE_WERROR=ON
"$tools_root/cmake-venv/bin/cmake" --build "$tools_root/libredwg-build" --target dwg2dxf --parallel 2
cd "$repo_root"
"$tools_root/cmake-venv/bin/cmake" -S native -B "$tools_root/magiccad-native" -DLIBREDWG_SOURCE="$tools_root/libredwg-source" -DLIBREDWG_BUILD="$tools_root/libredwg-build"
"$tools_root/cmake-venv/bin/cmake" --build "$tools_root/magiccad-native" --parallel 2
cp "$tools_root/magiccad-native/magiccad-dwg-write" "$tools_root/libredwg-build/magiccad-dwg-write"
export NODE_USE_ENV_PROXY=1
export electron_config_cache="$tools_root/electron-cache"
npm --cache "$tools_root/npm-cache" ci --no-audit --no-fund
node node_modules/electron/install.js
npm test
LIBREDWG_BIN="$tools_root/libredwg-build" npm run test:dwg
