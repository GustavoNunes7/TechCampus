@echo off
setlocal enabledelayedexpansion
title TechCampus - AAPM

:: Ativa suporte a cores ANSI no console
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1

:: Definicao de cores ANSI
set "ESC="
set "RED=%ESC%[91m"
set "BOLD_RED=%ESC%[1;91m"
set "RESET=%ESC%[0m"
set "WHITE=%ESC%[97m"
set "GRAY=%ESC%[90m"

cd /d "%~dp0"
cls

echo %BOLD_RED%=======================================================%RESET%
echo %BOLD_RED%                  TECHCAMPUS - AAPM                    %RESET%
echo %BOLD_RED%=======================================================%RESET%
echo %BOLD_RED%              Produzido por COD New Era                %RESET%
echo %BOLD_RED%=======================================================%RESET%
echo.

:: 1. VERIFICACAO DE AMBIENTE
where node >nul 2>&1
if !errorlevel! neq 0 (
    echo %RED%[ERRO] Node.js nao encontrado no sistema.%RESET%
    echo %WHITE%Instale o Node.js para continuar.%RESET%
    goto :ERRO
)

where npm >nul 2>&1
if !errorlevel! neq 0 (
    echo %RED%[ERRO] npm nao encontrado.%RESET%
    goto :ERRO
)

:: 2. VERIFICACAO DO .ENV
if not exist ".env" (
    echo %RED%[ERRO] Arquivo .env nao encontrado.%RESET%
    goto :ERRO
)

:: 3. LEITURA DA PORTA
for /f "delims=" %%P in ('node -e "require('dotenv').config(); process.stdout.write(process.env.PORT || '3000')" 2^>nul') do set "PORT=%%P"

if not defined PORT set "PORT=3000"
set "URL=http://localhost:%PORT%/"

echo %RED%[*]" Porta configurada: %WHITE%%PORT%%RESET%
echo.

:: 4. GERENCIAMENTO DE DEPENDENCIAS
if not exist "node_modules\" (
    echo %RED%[*]" Instalando dependencias do TechCampus...%RESET%
    echo.
    call npm install
    if !errorlevel! neq 0 (
        echo.
        echo %RED%[AVISO] Tentando instalar better-sqlite3...%RESET%
        call npm install better-sqlite3
        if !errorlevel! neq 0 (
            echo %RED%[ERRO] Nao foi possivel instalar o better-sqlite3.%RESET%
            goto :ERRO
        )
        call npm install
        if !errorlevel! neq 0 (
            echo %RED%[ERRO] Nao foi possivel concluir a instalacao.%RESET%
            goto :ERRO
        )
    )
    echo %RED%[OK] Dependencias instaladas com sucesso!%RESET%
    echo.
)

:: 5. VERIFICACAO SE JA ESTA EM EXECUCAO
powershell -NoProfile -Command "$r = try { (Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2).StatusCode } catch { 0 }; if ($r -ge 200 -and $r -lt 500) { exit 0 } else { exit 1 }" >nul 2>&1
if !errorlevel! equ 0 (
    echo %RED%[INFO] TechCampus ja esta funcionando!%RESET%
    echo %WHITE%Abrindo a Landing Page...%RESET%
    start "" "%URL%"
    timeout /t 3 >nul
    exit /b 0
)

:: 6. VERIFICACAO DE CONFLITO DE PORTA
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if !errorlevel! equ 0 (
    echo %RED%[ERRO] A porta %PORT% esta ocupada, mas a Landing Page nao respondeu.%RESET%
    echo %WHITE%Verifique a janela do servidor ou altere a porta no .env.%RESET%
    goto :ERRO
)

:: 7. INICIALIZACAO DO SERVIDOR
echo %RED%[*]" Iniciando o servidor do TechCampus...%RESET%
start "TechCampus - Servidor" cmd /k "cd /d ""%~dp0"" && npm start"

:: 8. AGUARDAR RESPOSTA DO SERVIDOR
echo %RED%[*]" Aguardando o servidor iniciar...%RESET%

powershell -NoProfile -Command "$u='%URL%'; for($i=0;$i -lt 30;$i++){try{$r=(Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 1).StatusCode; if($r -ge 200 -and $r -lt 500){Start-Process $u; exit 0}}catch{}; Start-Sleep -Seconds 1}; exit 1"

if !errorlevel! neq 0 (
    echo.
    echo %RED%[ERRO] O servidor nao respondeu em 30 segundos.%RESET%
    echo %WHITE%Confira a janela do servidor para verificar o erro.%RESET%
    goto :ERRO
)

echo.
echo %BOLD_RED%=======================================================%RESET%
echo %BOLD_RED%        TechCampus iniciado com sucesso!               %RESET%
echo %BOLD_RED%=======================================================%RESET%
timeout /t 3 >nul
exit /b 0

:ERRO
echo.
echo %BOLD_RED%=======================================================%RESET%
echo %RED%                 FALHA NA INICIALIZACAO                %RESET%
echo %BOLD_RED%=======================================================%RESET%
pause
exit /b 1
