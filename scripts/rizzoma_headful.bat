@echo off
setlocal

REM Headed Playwright launcher for manual Rizzoma login (Windows PowerShell/cmd friendly)
REM Prereqs: run once in this repo
REM   python -m venv .venv-win
REM   .\.venv-win\Scripts\pip install playwright
REM   .\.venv-win\Scripts\playwright install chromium

set "REPO_DIR=%~dp0.."
set "PYTHON_EXE=%REPO_DIR%\.venv-win\Scripts\python.exe"
set "USER_DATA_DIR=%TEMP%\rizzoma-headful-profile"

if not exist "%PYTHON_EXE%" (
  echo Python venv not found at %PYTHON_EXE%
  echo Create it first:
  echo   python -m venv .venv-win
  echo   .\.venv-win\Scripts\pip install playwright
  echo   .\.venv-win\Scripts\playwright install chromium
  exit /b 1
)

pushd "%REPO_DIR%"
echo Launching headed Chromium with profile "%USER_DATA_DIR%" ...
"%PYTHON_EXE%" scripts\rizzoma_headful.py --start-url https://www.rizzoma.com/topic/ --user-data-dir "%USER_DATA_DIR%" --channel chrome
popd

echo Done. If the browser did not appear, ensure you ran this in a Windows shell (not WSL) and the venv + Playwright are installed.
pause
