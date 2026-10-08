@echo off
setlocal
cd /d "%~dp0"
title MagicCAD
where node >nul 2>&1
if errorlevel 1 (
  echo Instala o Node.js 24 LTS em https://nodejs.org/ e volta a abrir este ficheiro.
  pause
  exit /b 1
)
node -e "if (Number(process.versions.node.split('.')[0]) < 24) process.exit(1)"
if errorlevel 1 (
  echo Atualiza o Node.js para a versao 24 LTS ou superior.
  pause
  exit /b 1
)
echo A preparar o MagicCAD. Aguarda ate a instalacao terminar.
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 (
  echo Nao foi possivel instalar as dependencias. Guarda a mensagem de erro acima.
  pause
  exit /b 1
)
echo A abrir o MagicCAD...
call npm.cmd start
if errorlevel 1 (
  echo Nao foi possivel abrir o MagicCAD. Guarda a mensagem de erro acima.
  pause
  exit /b 1
)
endlocal
