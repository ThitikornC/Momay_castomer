@echo off
setlocal
cd /d "%~dp0"
echo ============================================
echo   MomayBUU CCTV Relay - setup (Windows)
echo ============================================

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] ไม่พบ Python - ติดตั้ง Python 3.9+ ก่อน: https://www.python.org/downloads/
  echo         ตอนติดตั้งติ๊ก "Add Python to PATH" ด้วย
  pause & exit /b 1
)

if not exist .venv (
  echo [1/3] สร้าง virtualenv...
  python -m venv .venv
)

echo [2/3] ติดตั้ง dependencies...
".venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
".venv\Scripts\python.exe" -m pip install --quiet -r requirements-relay.txt

echo [3/3] เปิด Control Panel (http://127.0.0.1:8090)...
".venv\Scripts\python.exe" panel.py
pause
