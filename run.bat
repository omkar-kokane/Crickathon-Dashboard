@echo off
REM ╔════════════════════════════════════════════════════════════════════════════╗
REM ║                    Crickathon Dashboard — Launcher                        ║
REM ║  Starts PostgreSQL (Docker), Backend (FastAPI), and Frontend (Next.js)    ║
REM ╚════════════════════════════════════════════════════════════════════════════╝

title Crickathon Dashboard Launcher
color 0A

echo.
echo  ====================================================
echo        Crickathon Dashboard — Full Stack Launcher
echo  ====================================================
echo.

REM ── Step 0: Check prerequisites ──────────────────────────────────────────────
where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [WARNING] Docker not found. Skipping database container startup.
    echo            Make sure PostgreSQL is running manually on port 5432.
    echo.
    goto :skip_docker
)

REM ── Step 1: Start PostgreSQL via Docker Compose ─────────────────────────────
echo  [1/5] Starting PostgreSQL via Docker Compose...
docker compose up -d
if %ERRORLEVEL% NEQ 0 (
    echo  [WARNING] Docker Compose failed. Is Docker Desktop running?
    echo            Continuing without database container...
)
echo.

:skip_docker

REM ── Step 2: Check for .env files ────────────────────────────────────────────
if not exist "backend\.env" (
    echo  [WARNING] backend\.env not found!
    echo            Copy backend\.env.example to backend\.env and fill in your values.
    echo.
)
if not exist "frontend\.env.local" (
    echo  [WARNING] frontend\.env.local not found!
    echo            Copy frontend\.env.local.example to frontend\.env.local and fill in your values.
    echo.
)

REM ── Step 3: Install & Start Backend ─────────────────────────────────────────
echo  [2/5] Setting up Python virtual environment...
if not exist "backend\venv" (
    python -m venv backend\venv
)

echo  [3/5] Installing backend dependencies...
call backend\venv\Scripts\activate.bat
pip install -r backend\requirements.txt --quiet 2>nul

echo  [4/5] Starting FastAPI backend on http://localhost:8000 ...
start "Crickathon Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\activate.bat && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
echo.

REM ── Step 4: Install & Start Frontend ────────────────────────────────────────
echo  [5/5] Installing frontend dependencies and starting dev server...
pushd frontend
call npm install --silent 2>nul
popd

start "Crickathon Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo.

REM ── Step 5: Wait & Open Browser ─────────────────────────────────────────────
echo  ====================================================
echo    Waiting 8 seconds for servers to start...
echo  ====================================================
timeout /t 8 /nobreak >nul

echo.
echo  Opening http://localhost:3000 ...
start http://localhost:3000

echo.
echo  ====================================================
echo    All services are running!
echo  ----------------------------------------------------
echo    Frontend : http://localhost:3000
echo    Backend  : http://localhost:8000
echo    API Docs : http://localhost:8000/docs
echo    Database : localhost:5432 (PostgreSQL)
echo  ====================================================
echo.
echo  Press any key to close this launcher window...
echo  (Backend and Frontend will keep running in their own windows)
pause >nul
