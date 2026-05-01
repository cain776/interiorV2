@echo off
setlocal enabledelayedexpansion
title Interior Quote Server Shutdown

echo ========================================
echo   Interior Quote Server - Shutdown
echo ========================================
echo.

set TOOLS_DIR=%~dp0
set PROJECT_DIR=%TOOLS_DIR%..\

set PORT=3001
if exist "%PROJECT_DIR%backend\.env" (
    for /f "usebackq tokens=1,2 delims==" %%a in ("%PROJECT_DIR%backend\.env") do (
        if /i "%%a"=="PORT" set PORT=%%b
    )
)
set PORT=%PORT:"=%

set FOUND=0

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :%PORT% ^| findstr LISTENING') do (
    echo [Server :%PORT%] PID %%a kill
    taskkill /PID %%a /T /F >nul 2>&1
    set FOUND=1
)

taskkill /FI "WINDOWTITLE eq Interior Quote Server" /T /F >nul 2>&1

if %FOUND%==0 (
    echo No running server found on port %PORT%.
) else (
    echo.
    echo Server stopped.
)

echo ========================================
pause
