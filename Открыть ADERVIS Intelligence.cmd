@echo off
rem Starts the local server and opens the browser. Close this window to stop.
title ADERVIS Intelligence
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js not found. Install it from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)
node "tools\serve.mjs"
pause
