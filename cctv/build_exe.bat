@echo off
setlocal
cd /d "%~dp0"
echo ============================================
echo   Build MomayRelay.exe  (PyInstaller)
echo ============================================
echo  รันบนเครื่อง Windows ที่มี Python ครั้งเดียว
echo  ได้ผลลัพธ์เป็นโฟลเดอร์ dist\MomayRelay\ เอาไปแจกได้

where python >nul 2>nul
if errorlevel 1 ( echo [ERROR] ไม่พบ Python 3.9+ & pause & exit /b 1 )

if not exist .venv python -m venv .venv
echo [1/2] ติดตั้ง deps + pyinstaller...
".venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
".venv\Scripts\python.exe" -m pip install --quiet -r requirements-relay.txt -r requirements-build.txt

echo [2/2] build...
".venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean --onedir --name MomayRelay ^
  --add-data "models\ssd_mobilenet_v2_coco.pbtxt;models" ^
  --collect-all cv2 ^
  app.py

echo.
echo ============================================
echo  เสร็จ! โฟลเดอร์พร้อมแจก: dist\MomayRelay\
echo  รัน: dist\MomayRelay\MomayRelay.exe  (เครื่องปลายทางไม่ต้องลง Python)
echo  ทำเป็น Setup.exe ต่อ: เปิด installer.iss ด้วย Inno Setup
echo ============================================
pause
