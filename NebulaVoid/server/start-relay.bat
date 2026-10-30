@echo off
title NEBULA VOID Relay
cd /d "%~dp0"
if not exist "node_modules\ws" (
  echo Installing dependencies...
  call npm install
)
echo.
echo Relay: ws://127.0.0.1:8080
echo Leave this window open while playing multiplayer.
echo.
node index.js
pause
