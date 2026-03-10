@echo off
setlocal
powershell -NoLogo -ExecutionPolicy Bypass -File "%~dp0scripts\Setup-WebWorkspace.ps1" -Launch
exit /b %errorlevel%
