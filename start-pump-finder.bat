@echo off
cd /d "%~dp0"

if not exist node_modules (
  echo 首次執行，安裝套件中...
  call npm install
)

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000/pump-finder/index.html"

echo 啟動伺服器中，請勿關閉這個視窗...
node server.js
