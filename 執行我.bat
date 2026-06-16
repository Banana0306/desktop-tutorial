@echo off
chcp 65001 > nul
title 瑞城 ERP - 安裝與啟動

:: 以系統管理員身份重新執行
net session > nul 2>&1
if %errorlevel% neq 0 (
    echo 正在請求系統管理員權限...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cls
echo.
echo  ================================================
echo       瑞城 ERP  全自動安裝與啟動
echo  ================================================
echo.

set "DIR=%~dp0"
set "DIR=%DIR:~0,-1%"
set PGPASSWORD=erp_secure_2026

:: ── 步驟 1：確認 Node.js ─────────────────────────
echo [1/6] 確認 Node.js...
node -v > nul 2>&1
if %errorlevel% neq 0 (
    echo       未安裝，正在透過 winget 安裝...
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    echo       請安裝完成後重新執行本腳本
    pause & exit /b 1
)
for /f %%v in ('node -v') do echo       Node.js %%v  OK

:: ── 步驟 2：確認 PostgreSQL ──────────────────────
echo.
echo [2/6] 確認 PostgreSQL...
pg_isready -h 127.0.0.1 -p 5432 > nul 2>&1
if %errorlevel% neq 0 (
    echo       嘗試啟動 PostgreSQL 服務...
    net start postgresql-x64-16 > nul 2>&1
    net start postgresql-x64-15 > nul 2>&1
    net start postgresql-x64-14 > nul 2>&1
    pg_isready -h 127.0.0.1 -p 5432 > nul 2>&1
    if %errorlevel% neq 0 (
        echo       [錯誤] PostgreSQL 無法啟動
        echo       請確認已安裝 PostgreSQL 並手動啟動服務
        pause & exit /b 1
    )
)
echo       PostgreSQL  OK

:: ── 步驟 3：初始化資料庫 ─────────────────────────
echo.
echo [3/6] 初始化資料庫...
psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -c "SELECT 1" > nul 2>&1
if %errorlevel% equ 0 (
    echo       資料庫已存在，跳過初始化
    goto :skip_db
)

echo       建立資料庫使用者...
psql -U postgres -h 127.0.0.1 -c "CREATE USER erp_user WITH PASSWORD 'erp_secure_2026';" > nul 2>&1
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE ruicheng_erp OWNER erp_user;" > nul 2>&1
psql -U postgres -h 127.0.0.1 -c "GRANT ALL PRIVILEGES ON DATABASE ruicheng_erp TO erp_user;" > nul 2>&1

echo       執行 Migrations...
psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%DIR%\migrations\001_phase1_base.sql" > nul 2>&1
psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%DIR%\migrations\002_phase2a_purchasing.sql" > nul 2>&1
psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%DIR%\migrations\003_phase2b_sales.sql" > nul 2>&1
psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%DIR%\migrations\004_phase2c_inventory.sql" > nul 2>&1
psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%DIR%\migrations\005_phase2d_ar_ap.sql" > nul 2>&1
psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%DIR%\migrations\006_phase3_landed_cost.sql" > nul 2>&1
psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%DIR%\migrations\007_phase4_reporting.sql" > nul 2>&1
psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%DIR%\migrations\008_phase5_notifications.sql" > nul 2>&1

echo       建立管理員帳號...
psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -c "INSERT INTO users (username,password_hash,full_name,role,is_active) VALUES ('admin1','$2b$12$m1JFBId2RskByWzyW9Bo2.ztIJvfg.G6t334/UTPeDIYBEDgepyum','系統管理員','owner',TRUE) ON CONFLICT (username) DO NOTHING;" > nul 2>&1
echo       資料庫初始化  OK

:skip_db

:: ── 步驟 4：安裝套件 ─────────────────────────────
echo.
echo [4/6] 安裝套件...
if not exist "%DIR%\backend\node_modules" (
    echo       安裝後端套件...
    cd /d "%DIR%\backend" && call npm install --silent > nul 2>&1
)
if not exist "%DIR%\frontend\node_modules" (
    echo       安裝前端套件（約需 1-2 分鐘）...
    cd /d "%DIR%\frontend" && call npm install --silent > nul 2>&1
)
echo       套件安裝  OK

:: ── 步驟 5：防火牆 ───────────────────────────────
echo.
echo [5/6] 設定防火牆...
netsh advfirewall firewall add rule name="ERP-3000" dir=in action=allow protocol=TCP localport=3000 > nul 2>&1
netsh advfirewall firewall add rule name="ERP-3001" dir=in action=allow protocol=TCP localport=3001 > nul 2>&1
echo       防火牆  OK

:: ── 步驟 6：取得本機 IP 並更新設定 ──────────────
echo.
echo [6/6] 取得網路資訊...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1" ^| findstr /v "169.254"') do (
    set LOCALIP=%%a
    goto :got_ip
)
:got_ip
set LOCALIP=%LOCALIP: =%
if "%LOCALIP%"=="" set LOCALIP=localhost
echo       本機 IP：%LOCALIP%

echo NEXT_PUBLIC_API_URL=http://%LOCALIP%:3001 > "%DIR%\frontend\.env.local"

:: ── 啟動服務 ─────────────────────────────────────
echo.
echo  ================================================
echo    安裝完成！正在啟動系統...
echo  ================================================
echo.

start "瑞城ERP-後端" cmd /k "title 瑞城ERP-後端 && cd /d "%DIR%\backend" && node src/index.js"
timeout /t 4 /nobreak > nul
start "瑞城ERP-前端" cmd /k "title 瑞城ERP-前端 && cd /d "%DIR%\frontend" && npx next dev --hostname 0.0.0.0"

echo  等待系統啟動（15秒）...
timeout /t 15 /nobreak > nul

start http://localhost:3000

echo.
echo  ================================================
echo    系統已啟動！
echo  ------------------------------------------------
echo    電腦瀏覽器：http://localhost:3000
echo    手機預覽：  http://%LOCALIP%:3000
echo  ------------------------------------------------
echo    帳  號：admin1
echo    密  碼：erp20261
echo  ================================================
echo.
echo  手機需與電腦連同一個 WiFi
echo  關閉此視窗不會停止系統
echo.
pause
