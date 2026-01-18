@echo off
setlocal

REM Export storage state from an existing manual Chrome profile (e.g., rizzoma_manual_chrome.bat).
REM Requires the venv at .venv-win with Playwright installed.

set "REPO_DIR=%~dp0.."
set "PYTHON_EXE=%REPO_DIR%\.venv-win\Scripts\python.exe"
set "PROFILE_DIR=%TEMP%\rizzoma-manual"
set "STATE_OUT=%REPO_DIR%\scripts\rizzoma-session-state.json"

if not exist "%PYTHON_EXE%" (
  echo Python venv not found at %PYTHON_EXE%
  echo Create it first:
  echo   python -m venv .venv-win
  echo   .\.venv-win\Scripts\pip install playwright
  echo   .\.venv-win\Scripts\playwright install chromium
  exit /b 1
)

echo Exporting storage state from "%PROFILE_DIR%" to "%STATE_OUT%" ...
"%PYTHON_EXE%" scripts\rizzoma_export_manual_profile.py --profile-dir "%PROFILE_DIR%" --out "%STATE_OUT%" --channel chrome

echo Done. If URL/title shows you are authenticated, I can reuse scripts\rizzoma-session-state.json for automation.
pause
