@echo off
setlocal
powershell -NoLogo -ExecutionPolicy Bypass -File "%~dp0scripts\Launch-WebApp.ps1" -Mode Launch
exit /b %errorlevel%
