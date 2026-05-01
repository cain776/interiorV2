@echo off
setlocal enabledelayedexpansion
title Interior Quote Server

echo ========================================
echo   Interior Quote Server - Start
echo ========================================
echo.

set TOOLS_DIR=%~dp0
set PROJECT_DIR=%TOOLS_DIR%..\

set PORT=3001
if exist "%PROJECT_DIR%backend\.env" (
    for /f "usebackq tokens=1,2 delims==" %%a in ("%PROJECT_DIR%backend\.env") do (
        if /i "%%a"=="PORT" set PORT=%%b
    )
    echo [ENV] backend\.env loaded
)

set PORT=%PORT:"=%

call :ensure_postgres
if errorlevel 1 (
    echo.
    echo [DB] PostgreSQL is not ready. Server start cancelled.
    echo.
    pause
    exit /b 1
)

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :%PORT% ^| findstr LISTENING') do (
    echo [Port :%PORT%] killing PID %%a
    taskkill /PID %%a /T /F >nul 2>&1
)

cd /d "%PROJECT_DIR%backend"
echo [DB] Running migrations...
call npm run migrate
if errorlevel 1 (
    echo.
    echo [DB] Migration failed. Server start cancelled.
    echo.
    pause
    exit /b 1
)

echo.
echo [Server]   http://localhost:%PORT%
echo [Frontend] http://localhost:%PORT%/   (served by backend)
echo [API]      http://localhost:%PORT%/api/*
echo.
echo ========================================
echo Press Ctrl+C to stop the server.
echo ========================================
echo.

call npm run dev
exit /b %errorlevel%

:ensure_postgres
echo.
echo [DB] Checking PostgreSQL on 127.0.0.1:5432...

netstat -aon 2>nul | findstr ":5432" | findstr LISTENING >nul
if not errorlevel 1 (
    echo [DB] PostgreSQL is already listening on port 5432.
    exit /b 0
)

where docker >nul 2>&1
if errorlevel 1 (
    echo [DB] Docker is not installed or not in PATH.
    echo [DB] Start PostgreSQL manually, or install Docker Desktop.
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [DB] Docker Desktop is not running. Trying to start it...
    if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
        start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    ) else (
        echo [DB] Docker Desktop app was not found.
    )

    for /l %%i in (1,1,60) do (
        docker info >nul 2>&1
        if not errorlevel 1 goto docker_ready
        timeout /t 2 /nobreak >nul
    )

    echo [DB] Docker did not become ready in time.
    exit /b 1
)

:docker_ready
docker inspect interior-postgres >nul 2>&1
if not errorlevel 1 (
    echo [DB] Starting PostgreSQL container interior-postgres...
    docker start interior-postgres >nul 2>&1
    goto postgres_started
)

if exist "%PROJECT_DIR%docker-compose.yml" (
    docker compose version >nul 2>&1
    if not errorlevel 1 (
        echo [DB] Starting PostgreSQL with Docker Compose...
        cd /d "%PROJECT_DIR%"
        docker compose up -d db
        goto postgres_started
    )
)

echo [DB] Creating PostgreSQL container interior-postgres...
docker run -d --name interior-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=interior -p 5432:5432 postgres:16-alpine

:postgres_started
if errorlevel 1 (
    echo [DB] Failed to start PostgreSQL.
    exit /b 1
)

echo [DB] Waiting for PostgreSQL...
for /l %%i in (1,1,30) do (
    netstat -aon 2>nul | findstr ":5432" | findstr LISTENING >nul
    if not errorlevel 1 (
        echo [DB] PostgreSQL is ready.
        exit /b 0
    )
    timeout /t 1 /nobreak >nul
)

echo [DB] PostgreSQL did not open port 5432 in time.
exit /b 1
