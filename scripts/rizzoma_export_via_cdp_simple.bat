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
rem --disable-features=CalculateNativeWinOcclusion + --disable-backgrounding-occluded-windows:
rem a covered window is otherwise marked hidden and a hidden Rizzoma tab cannot enter edit mode
rem (rizzoma SKILL "Don't fight the window"). With them the posting window can sit behind other
rem windows, so automation never needs to raise or focus it on the user's screen (2026-09-30).
rem Optional first argument /background: start Chrome minimised and skip the interactive pauses,
rem for relaunching the already-signed-in profile from a hidden launcher without a console.
set "START_MODE="
set "BG="
if /i "%~1"=="/background" (set "START_MODE=/min" & set "BG=1")
start "" %START_MODE% "%CHROME_EXE%" --remote-debugging-port=%CDP_PORT% --remote-allow-origins=* --user-data-dir="%PROFILE_DIR%" --profile-directory=Default --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows "https://www.rizzoma.com/topic/"

echo When the Chrome window loads, make sure you are logged in and can see Rizzoma.
echo Leave Chrome open, return here, and press any key to export the session.
if defined BG (timeout /t 15 /nobreak >nul) else (pause)

echo Exporting storage state via CDP...
"%PYTHON_EXE%" "%REPO_DIR%\scripts\rizzoma_export_via_cdp.py" --cdp-url "http://127.0.0.1:%CDP_PORT%" --out "%STATE_OUT%"

echo Done. If URL/title in the output show you are authenticated, the session is saved at %STATE_OUT%.
if not defined BG pause
