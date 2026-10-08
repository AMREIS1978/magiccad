$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $repoRoot 'tools'
$source = Join-Path $tools 'libredwg-source'
$build = Join-Path $tools 'libredwg-build'
$nativeBuild = Join-Path $tools 'magiccad-native'
$bin = Join-Path $tools 'libredwg'
$revision = 'e3774bd4020fcfebb68150361db74b8b34d170fe'
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" } }
New-Item -ItemType Directory -Force -Path $tools, $bin | Out-Null
if (-not (Test-Path (Join-Path $source '.git'))) {
  git clone --depth 1 --branch 0.13.4 https://github.com/LibreDWG/libredwg.git $source
  Check-Exit
}
$actual = git -C $source rev-parse HEAD
Check-Exit
if ($actual -ne $revision) { throw 'LibreDWG source revision differs; no source files were reset.' }
git -C $source submodule update --init --depth 1 jsmn
Check-Exit
Push-Location $source
try {
  cmake -S . -B $build -DBUILD_SHARED_LIBS=OFF -DENABLE_LTO=OFF -DDISABLE_WERROR=ON
  Check-Exit
  cmake --build $build --config Release --target dwg2dxf --parallel 2
  Check-Exit
} finally { Pop-Location }
cmake -S (Join-Path $repoRoot 'native') -B $nativeBuild "-DLIBREDWG_SOURCE=$source" "-DLIBREDWG_BUILD=$build"
Check-Exit
cmake --build $nativeBuild --config Release --parallel 2
Check-Exit
$converter = Join-Path $build 'Release/dwg2dxf.exe'
if (-not (Test-Path $converter)) { $converter = Join-Path $build 'dwg2dxf.exe' }
$writer = Join-Path $nativeBuild 'Release/magiccad-dwg-write.exe'
if (-not (Test-Path $writer)) { $writer = Join-Path $nativeBuild 'magiccad-dwg-write.exe' }
Copy-Item $converter (Join-Path $bin 'dwg2dxf.exe')
Copy-Item $writer (Join-Path $bin 'magiccad-dwg-write.exe')
Copy-Item (Join-Path $source 'COPYING') (Join-Path $bin 'COPYING.libredwg')
$env:LIBREDWG_BIN = $bin
Push-Location $repoRoot
try { npm run test:dwg; Check-Exit } finally { Pop-Location }
Write-Host 'LibreDWG and the MagicCAD adapter are prepared. Windows build still requires validation on this machine.'
