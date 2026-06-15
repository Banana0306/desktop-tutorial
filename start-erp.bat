@echo off
chcp 65001 > nul
title 瑞城 ERP - 啟動系統（含手機預覽）

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

:: 取得本機 IP 位址
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1" ^| findstr /v "169.254"') do (
    set LOCAL_IP=%%a
    goto :got_ip
)
:got_ip
set LOCAL_IP=%LOCAL_IP: =%

if "%LOCAL_IP%"=="" (
    echo [警告] 無法取得本機 IP，手機預覽功能可能無法使用
    set LOCAL_IP=localhost
)

echo [OK] 本機 IP: %LOCAL_IP%

:: 確認 PostgreSQL 是否運行
pg_isready -h 127.0.0.1 -p 5432 > nul 2>&1
if %errorlevel% neq 0 (
    echo [啟動] 正在啟動 PostgreSQL...
    net start postgresql-x64-16 > nul 2>&1
    if %errorlevel% neq 0 (
        echo [錯誤] 無法啟動 PostgreSQL，請手動開啟 PostgreSQL 服務
        pause
        exit /b 1
    )
)
echo [OK] PostgreSQL 運行中

:: 安裝套件（如果尚未安裝）
if not exist "%~dp0backend\node_modules" (
    echo [安裝] 安裝後端套件中...
    cd /d "%~dp0backend"
    call npm install
    cd /d "%~dp0"
)
if not exist "%~dp0frontend\node_modules" (
    echo [安裝] 安裝前端套件中...
    cd /d "%~dp0frontend"
    call npm install
    cd /d "%~dp0"
)

:: 更新前端 API 位址為本機 IP（讓手機也能連到後端）
echo NEXT_PUBLIC_API_URL=http://%LOCAL_IP%:3001 > "%~dp0frontend\.env.local"
echo [OK] 前端 API 位址已設為 http://%LOCAL_IP%:3001

:: 啟動後端（監聽所有網路介面）
echo [啟動] 後端 API 伺服器 (port 3001)...
start "瑞城ERP-後端" cmd /k "chcp 65001 && cd /d %~dp0backend && node src/index.js"

:: 啟動前端（監聽所有網路介面，讓手機可以連線）
echo [啟動] 前端介面 (port 3000)...
start "瑞城ERP-前端" cmd /k "chcp 65001 && cd /d %~dp0frontend && npx next dev --hostname 0.0.0.0"

echo.
echo [等待] 系統啟動中，請稍候 12 秒...
timeout /t 12 /nobreak > nul

:: 開啟瀏覽器
start http://localhost:3000

echo.
echo ========================================
echo   系統已啟動！
echo ----------------------------------------
echo   電腦瀏覽器:  http://localhost:3000
echo   手機預覽:    http://%LOCAL_IP%:3000
echo ----------------------------------------
echo   帳號: admin1
echo   密碼: erp20261
echo ========================================
echo.
echo [手機使用說明]
echo 1. 確認手機和電腦連接同一個 WiFi
echo 2. 手機瀏覽器輸入: http://%LOCAL_IP%:3000
echo 3. 如無法連線請確認 Windows 防火牆允許 port 3000
echo.
pause
