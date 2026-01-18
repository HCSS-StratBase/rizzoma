@echo off
setlocal

REM Launch a normal Chrome window with a dedicated profile for manual Google SSO/Rizzoma login.
REM After login, this profile (cookies/session) can be reused by Playwright.

set "PROFILE_DIR=%TEMP%\rizzoma-manual"
set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"

if not exist "%CHROME_EXE%" (
  echo Chrome not found at "%CHROME_EXE%". Adjust CHROME_EXE to your installation path.
  pause
  exit /b 1
)

echo Launching Chrome with profile "%PROFILE_DIR%"...
"%CHROME_EXE%" --user-data-dir="%PROFILE_DIR%" --profile-directory=Default "https://www.rizzoma.com/topic/"

echo When you finish logging in (Google SSO) and can see your Rizzoma content, close Chrome and return here.
pause
