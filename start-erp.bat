@echo off
chcp 65001 > nul
title 瑞城 ERP - 啟動系統

echo.
echo ========================================
echo   瑞城 ERP 系統啟動中...
echo ========================================
echo.

:: 確認 Node.js 是否安裝
where node > nul 2>&1
if %errorlevel% neq 0 (
    echo [錯誤] 找不到 Node.js，請先安裝 Node.js v18 以上
    echo 下載網址: https://nodejs.org
    pause
    exit /b 1
)

:: 確認 PostgreSQL 是否運行
pg_isready -h 127.0.0.1 -p 5432 > nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] PostgreSQL 尚未啟動，正在嘗試啟動...
    net start postgresql-x64-16 > nul 2>&1
    if %errorlevel% neq 0 (
        echo [錯誤] 無法啟動 PostgreSQL，請手動開啟 PostgreSQL 服務
        pause
        exit /b 1
    )
    echo [OK] PostgreSQL 啟動成功
) else (
    echo [OK] PostgreSQL 已運行
)

:: 確認 backend 套件已安裝
if not exist "%~dp0backend\node_modules" (
    echo [安裝] 正在安裝後端套件，請稍候...
    cd /d "%~dp0backend"
    call npm install
    cd /d "%~dp0"
)

:: 確認 frontend 套件已安裝
if not exist "%~dp0frontend\node_modules" (
    echo [安裝] 正在安裝前端套件，請稍候...
    cd /d "%~dp0frontend"
    call npm install
    cd /d "%~dp0"
)

echo.
echo [啟動] 後端 API 伺服器 (port 3001)...
start "瑞城ERP-後端" cmd /k "chcp 65001 && cd /d %~dp0backend && node src/index.js"

echo [啟動] 前端介面 (port 3000)...
start "瑞城ERP-前端" cmd /k "chcp 65001 && cd /d %~dp0frontend && npm run dev"

echo.
echo [等待] 系統啟動中，請稍候 10 秒...
timeout /t 10 /nobreak > nul

echo.
echo [開啟] 瀏覽器...
start http://localhost:3000

echo.
echo ========================================
echo   系統已啟動！
echo ----------------------------------------
echo   前端介面: http://localhost:3000
echo   後端 API: http://localhost:3001
echo ----------------------------------------
echo   帳號: admin1
echo   密碼: erp20261
echo ========================================
echo.
echo 關閉本視窗不會停止系統。
echo 如需停止系統請執行 stop-erp.bat
echo.
pause
