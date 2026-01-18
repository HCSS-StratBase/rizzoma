@echo off
setlocal

set "REPO_DIR=%~dp0.."
set "PYTHON_EXE=%REPO_DIR%\.venv-win\Scripts\python.exe"
set "PROFILE_DIR=%TEMP%\rizzoma-manual"
set "STATE_OUT=%REPO_DIR%\scripts\rizzoma-session-state.json"
set "CDP_PORT=9222"
set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"

if not exist "%PYTHON_EXE%" (
  echo Python venv not found at %PYTHON_EXE%
  pause
  exit /b 1
)

if not exist "%CHROME_EXE%" (
  echo Chrome not found at "%CHROME_EXE%". Edit CHROME_EXE in this file.
  pause
  exit /b 1
)

echo Starting Chrome with remote debugging on port %CDP_PORT% using profile "%PROFILE_DIR%"...
start "" "%CHROME_EXE%" --remote-debugging-port=%CDP_PORT% --user-data-dir="%PROFILE_DIR%" --profile-directory=Default "https://www.rizzoma.com/topic/"

echo When the Chrome window loads, make sure you are logged in and can see Rizzoma.
echo Leave Chrome open, return here, and press any key to export the session.
pause

echo Exporting storage state via CDP...
"%PYTHON_EXE%" scripts\rizzoma_export_via_cdp.py --cdp-url "http://127.0.0.1:%CDP_PORT%" --out "%STATE_OUT%"

echo Done. If URL/title in the output show you are authenticated, the session is saved at %STATE_OUT%.
pause
