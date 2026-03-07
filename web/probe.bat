@echo off
cd /d "C:\Users\psimcoe\source\repos\Psimcoe\Scheduling\web"
netstat -ano | findstr ":5173 :3000" > result.log 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo NO_LISTENERS >> result.log
)
tasklist /FI "IMAGENAME eq node.exe" /NH >> result.log 2>&1
