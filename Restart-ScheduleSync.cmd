@echo off
setlocal
powershell -NoLogo -ExecutionPolicy Bypass -File "%~dp0scripts\Restart-ScheduleSync-Web.ps1" %*
exit /b %errorlevel%
