@echo off
setlocal enabledelayedexpansion
title Interior DB Backup

echo ========================================
echo   Interior PostgreSQL - Backup
echo ========================================
echo.

set TOOLS_DIR=%~dp0
set PROJECT_DIR=%TOOLS_DIR%..\
set BACKUP_DIR=%PROJECT_DIR%backups

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

for /f %%a in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set TS=%%a
set BACKUP_FILE=%BACKUP_DIR%\interior-%TS%.sql

where docker >nul 2>&1
if errorlevel 1 (
    echo [DB] Docker is not installed or not in PATH.
    pause
    exit /b 1
)

cd /d "%PROJECT_DIR%"

echo [DB] Writing backup:
echo      %BACKUP_FILE%
echo.

docker compose exec -T db pg_dump -U postgres -d interior > "%BACKUP_FILE%" 2>nul
if not errorlevel 1 (
    echo [DB] Backup completed from Docker Compose service db.
    echo ========================================
    pause
    exit /b 0
)

docker exec interior-postgres pg_dump -U postgres -d interior > "%BACKUP_FILE%" 2>nul
if not errorlevel 1 (
    echo [DB] Backup completed from legacy container interior-postgres.
    echo ========================================
    pause
    exit /b 0
)

echo [DB] Backup failed. Start PostgreSQL first, then retry.
echo [DB] The backup file may be empty if both attempts failed.
echo ========================================
pause
exit /b 1
