@echo off
rem Start the Vue frontend only. Start the Spring backend with start-backend.cmd.
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

if not defined HOST set "HOST=127.0.0.1"
if not defined PORT set "PORT=5173"
if not defined BACKEND_URL set "BACKEND_URL=http://127.0.0.1:8080"
set "EXTRA_ARGS="

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="-h" goto usage
if /i "%~1"=="--help" goto usage
if /i "%~1"=="--host" (
  if "%~2"=="" (
    echo [error] --host requires a value
    exit /b 2
  )
  set "HOST=%~2"
  shift
  shift
  goto parse_args
)
if /i "%~1"=="--port" (
  if "%~2"=="" (
    echo [error] --port requires a value
    exit /b 2
  )
  set "PORT=%~2"
  shift
  shift
  goto parse_args
)
if /i "%~1"=="--backend-url" (
  if "%~2"=="" (
    echo [error] --backend-url requires a value
    exit /b 2
  )
  set "BACKEND_URL=%~2"
  shift
  shift
  goto parse_args
)
set "EXTRA_ARGS=!EXTRA_ARGS! %~1"
shift
goto parse_args

:args_done
where node >nul 2>nul
if errorlevel 1 (
  echo [error] Node.js not found. Install Node.js 22.18+ or 24.12+.
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>22?0:1)"
if errorlevel 1 (
  for /f "delims=" %%V in ('node -v') do echo [error] Node.js %%V is too old. Vite 8 requires Node.js 20.19+ or 22.12+.
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit((a===22&&b>=18)||(a===24&&b>=12)||a>24?0:1)" >nul 2>nul
if errorlevel 1 (
  for /f "delims=" %%V in ('node -v') do echo [warn] Node.js %%V is below package.json engines 22.18+ / 24.12+; the dev server should still run.
)

if not exist "node_modules\vite\bin\vite.js" (
  echo [info] Installing frontend dependencies...
  if exist "package-lock.json" (
    call npm ci
  ) else (
    call npm install
  )
  if errorlevel 1 (
    echo [error] Dependency installation failed.
    exit /b 1
  )
)

echo [info] Frontend: http://%HOST%:%PORT%/login
echo [info] API proxy: %BACKEND_URL%
call npm run dev -- --host %HOST% --port %PORT% --strictPort!EXTRA_ARGS!
exit /b %errorlevel%

:usage
echo Usage: start-frontend.cmd [--port 5173] [--host 127.0.0.1] [--backend-url http://127.0.0.1:8080]
echo.
echo   --port N         Vite dev server port (default 5173)
echo   --host HOST      Bind address (default 127.0.0.1)
echo   --backend-url U  Backend origin for the /api proxy (default http://127.0.0.1:8080)
echo.
echo Examples:
echo   start-frontend.cmd
echo   start-frontend.cmd --port 5174 --backend-url http://127.0.0.1:8081
exit /b 0