@echo off
setlocal

REM Launch Chrome with remote debugging and export storage state via CDP.

set "REPO_DIR=%~dp0.."
set "PYTHON_EXE=%REPO_DIR%\.venv-win\Scripts\python.exe"
set "PROFILE_DIR=%TEMP%\rizzoma-manual"
set "STATE_OUT=%REPO_DIR%\scripts\rizzoma-session-state.json"
set "CDP_PORT=9222"
set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"

if not exist "%PYTHON_EXE%" (
  echo Python venv not found at %PYTHON_EXE%
  echo Create it first:
  echo   python -m venv .venv-win
  echo   .\.venv-win\Scripts\pip install playwright
  echo   .\.venv-win\Scripts\playwright install chromium
  pause
  exit /b 1
)

if not exist "%CHROME_EXE%" (
  echo Chrome not found at "%CHROME_EXE%". Adjust CHROME_EXE in this file.
  pause
  exit /b 1
)

echo Starting Chrome with remote debugging on port %CDP_PORT% using profile "%PROFILE_DIR%"...
start "" "%CHROME_EXE%" --remote-debugging-port=%CDP_PORT% --user-data-dir="%PROFILE_DIR%" --profile-directory=Default "https://www.rizzoma.com/topic/"

echo Wait for the page to finish loading. If prompted, ensure you are logged in (Google SSO).
pause

echo Exporting storage state via CDP...
"%PYTHON_EXE%" scripts\rizzoma_export_via_cdp.py --cdp-url "http://127.0.0.1:%CDP_PORT%" --out "%STATE_OUT%"

echo Done. If URL/title show you are authenticated, I can reuse scripts\rizzoma-session-state.json for automation.
pause
