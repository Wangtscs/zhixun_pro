@echo off
rem Start the Spring Boot backend only. Start the Vue frontend with start-frontend.cmd.
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

if not defined PORT set "PORT=8080"
set "BUILD=0"
set "EXTRA_ARGS="

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="-h" goto usage
if /i "%~1"=="--help" goto usage
if /i "%~1"=="--build" (
  set "BUILD=1"
  shift
  goto parse_args
)
if /i "%~1"=="--port" (
  if "%~2"=="" (
    echo [error] --port requires a value, for example: start-backend.cmd --port 8081
    exit /b 2
  )
  set "PORT=%~2"
  shift
  shift
  goto parse_args
)
set "EXTRA_ARGS=!EXTRA_ARGS! %~1"
shift
goto parse_args

:args_done
call :find_java
if errorlevel 1 exit /b 1
call :fix_java_home
if errorlevel 1 exit /b 1

set "LIBS=..\.nephh-runtime\lib"
set "HAS_LIBS=0"
for %%F in ("%LIBS%\*.jar") do set "HAS_LIBS=1"

if "%BUILD%"=="1" goto build
if exist "target\classes\com\nephh\NephhApplication.class" if "%HAS_LIBS%"=="1" goto run_classes

:build
echo [info] Building backend with Maven (first run may download dependencies)...
call :maven_build
if errorlevel 1 (
  echo [error] Backend build failed.
  exit /b 1
)
goto run_jar

:run_classes
echo [info] Starting backend from target\classes on http://127.0.0.1:%PORT%
echo [info] Health: http://127.0.0.1:%PORT%/api/health
echo [info] Database: .local-database.yml (MySQL) when present, otherwise local H2.
"%JAVA_EXE%" -Dfile.encoding=UTF-8 -cp "src\main\resources;target\classes;%LIBS%\*" com.nephh.NephhApplication --server.address=127.0.0.1 --server.port=%PORT%!EXTRA_ARGS!
goto end

:run_jar
echo [info] Starting backend jar on http://127.0.0.1:%PORT%
echo [info] Health: http://127.0.0.1:%PORT%/api/health
"%JAVA_EXE%" -Dfile.encoding=UTF-8 -jar "target\nephh-backend-0.0.1-SNAPSHOT.jar" --server.address=127.0.0.1 --server.port=%PORT%!EXTRA_ARGS!
goto end

:find_java
set "JAVA_EXE="
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" set "JAVA_EXE=%JAVA_HOME%\bin\java.exe"
if not defined JAVA_EXE for /f "delims=" %%J in ('where java 2^>nul') do if not defined JAVA_EXE set "JAVA_EXE=%%J"
if not defined JAVA_EXE for %%J in ("C:\Program Files\Java\jdk-21\bin\java.exe" "C:\Program Files\Java\jdk-17\bin\java.exe") do if not defined JAVA_EXE if exist "%%~J" set "JAVA_EXE=%%~J"
if not defined JAVA_EXE (
  echo [error] Java 17+ not found. Install a JDK 17 or newer, or set JAVA_HOME.
  exit /b 1
)
"%JAVA_EXE%" -version 2>&1 | findstr /r /c:"version \"1[7-9]\." /c:"version \"[2-9][0-9]" >nul
if errorlevel 1 (
  echo [error] "%JAVA_EXE%" is not Java 17 or newer.
  exit /b 1
)
exit /b 0

:fix_java_home
if exist "%JAVA_HOME%\bin\java.exe" exit /b 0
for /f "usebackq delims=" %%H in (`powershell -NoProfile -Command "$p = (& '%JAVA_EXE%' -XshowSettings:properties -version 2>&1 ^| Select-String 'java.home ='); if ($p) { ($p.ToString() -split '=',2)[1].Trim() }"`) do set "JAVA_HOME=%%H"
if not exist "%JAVA_HOME%\bin\java.exe" (
  echo [error] Could not determine JAVA_HOME for "%JAVA_EXE%".
  exit /b 1
)
exit /b 0

:maven_build
if exist "mvnw.cmd" goto use_wrapper
where mvn >nul 2>nul
if not errorlevel 1 goto use_mvn
echo [error] Neither mvnw.cmd nor mvn was found. Install Maven or build the project in your IDE first.
exit /b 1
:use_wrapper
call mvnw.cmd -DskipTests package
exit /b %errorlevel%
:use_mvn
call mvn -DskipTests package
exit /b %errorlevel%

:usage
echo Usage: start-backend.cmd [--port 8080] [--build] [extra Spring Boot args]
echo.
echo   --port N   Listen port (default 8080)
echo   --build    Rebuild the backend with Maven before starting
echo.
echo Examples:
echo   start-backend.cmd
echo   start-backend.cmd --port 8081
echo   start-backend.cmd --spring.profiles.active=local
exit /b 0

:end
exit /b %errorlevel%