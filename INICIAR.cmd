@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 goto PASTA_INCOMPLETA
title MagicCAD
if not exist "package.json" goto PASTA_INCOMPLETA
if not exist "package-lock.json" goto PASTA_INCOMPLETA
if not exist "src\main.cjs" goto PASTA_INCOMPLETA
where node >nul 2>&1
if errorlevel 1 (
  echo Instala o Node.js 24 LTS em https://nodejs.org/ e volta a abrir este ficheiro.
  pause
  exit /b 1
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo O npm nao foi encontrado. Reinstala o Node.js 24 LTS com as opcoes padrao.
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
echo O registo completo fica em magiccad-instalacao.log nesta pasta.
call npm.cmd ci --include=dev --no-audit --no-fund > "magiccad-instalacao.log" 2>&1
if errorlevel 1 (
  type "magiccad-instalacao.log"
  echo.
  echo A instalacao falhou. Envia o ficheiro magiccad-instalacao.log para diagnostico.
  pause
  exit /b 1
)
echo Dependencias instaladas. A abrir o MagicCAD...
call npm.cmd start
if errorlevel 1 (
  echo Nao foi possivel abrir o MagicCAD. Guarda a mensagem de erro acima.
  pause
  exit /b 1
)
endlocal
exit /b 0

:PASTA_INCOMPLETA
echo.
echo Os ficheiros do MagicCAD nao estao juntos nesta pasta.
echo Se abriste INICIAR.cmd dentro do ZIP, primeiro extrai TODOS os ficheiros:
echo.
echo 1. Fecha esta janela.
echo 2. Clica no ZIP com o botao direito e escolhe Extrair Tudo.
echo 3. Clica em Extrair e abre a pasta extraida.
echo 4. Faz duplo clique em INICIAR.cmd nessa pasta.
echo.
echo A pasta deve conter INICIAR.cmd, package.json, package-lock.json e a pasta src.
echo Nao copies apenas INICIAR.cmd para outra pasta.
pause
exit /b 1
