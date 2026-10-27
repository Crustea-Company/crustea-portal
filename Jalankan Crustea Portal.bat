@echo off
rem Klik dua kali file ini untuk menyalakan Crustea Portal di laptop.
rem Selama jendela hitam ini terbuka, aplikasi bisa dibuka. Tutup jendela = server mati.

title Crustea Portal - server (JANGAN tutup jendela ini selama dipakai)
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang di laptop ini. Hubungi Vio atau Claude.
  pause
  exit /b 1
)

echo ============================================================
echo   Menyalakan Crustea Portal...
echo.
echo   Buka di laptop : http://localhost:3000
echo   Buka di HP     : http://192.168.1.185:3000  (Wi-Fi yang sama)
echo.
echo   Untuk mematikan: tutup jendela ini.
echo ============================================================
echo.

if not exist node_modules (
  echo Memasang paket untuk pertama kali, tunggu beberapa menit...
  call npm install
)

rem Buka browser setelah beberapa detik, sambil server menyala.
start "" /min cmd /c "timeout /t 6 >nul & start "" http://localhost:3000"

call npm run dev

echo.
echo Server berhenti. Tekan tombol apa saja untuk menutup jendela ini.
pause >nul
