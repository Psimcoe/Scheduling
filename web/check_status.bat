@echo off
cd /d "%~dp0"
echo FRONTEND: > _status.txt
curl -s -o NUL -w "%%{http_code}" http://localhost:5173 >> _status.txt 2>&1
echo. >> _status.txt
echo BACKEND: >> _status.txt
curl -s -o NUL -w "%%{http_code}" http://localhost:3000 >> _status.txt 2>&1
echo. >> _status.txt
echo PROCESSES: >> _status.txt
tasklist /FI "IMAGENAME eq node.exe" /NH >> _status.txt 2>&1
