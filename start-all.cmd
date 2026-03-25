@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-all.ps1" %*
endlocal
