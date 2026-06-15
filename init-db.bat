@echo off
chcp 65001 > nul
title 瑞城 ERP - 初始化資料庫

echo.
echo ========================================
echo   瑞城 ERP 資料庫初始化
echo   (首次使用時執行一次即可)
echo ========================================
echo.

set PGPASSWORD=erp_secure_2026

:: 確認 psql 是否存在
where psql > nul 2>&1
if %errorlevel% neq 0 (
    echo [錯誤] 找不到 psql 指令
    echo 請確認 PostgreSQL 已安裝，並將 bin 目錄加入 PATH
    echo 預設路徑: C:\Program Files\PostgreSQL\16\bin
    pause
    exit /b 1
)

echo [步驟 1/3] 建立資料庫使用者與資料庫...
psql -U postgres -h 127.0.0.1 -c "CREATE USER erp_user WITH PASSWORD 'erp_secure_2026';" > nul 2>&1
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE ruicheng_erp OWNER erp_user;" > nul 2>&1
psql -U postgres -h 127.0.0.1 -c "GRANT ALL PRIVILEGES ON DATABASE ruicheng_erp TO erp_user;" > nul 2>&1
echo [OK] 資料庫準備完成

echo.
echo [步驟 2/3] 執行資料庫 Migrations...
psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%~dp0migrations\001_phase1_base.sql"
if %errorlevel% neq 0 goto :error
echo   [OK] Migration 001

psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%~dp0migrations\002_phase2a_purchasing.sql"
echo   [OK] Migration 002

psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%~dp0migrations\003_phase2b_sales.sql"
echo   [OK] Migration 003

psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%~dp0migrations\004_phase2c_inventory.sql"
echo   [OK] Migration 004

psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%~dp0migrations\005_phase2d_ar_ap.sql"
echo   [OK] Migration 005

psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%~dp0migrations\006_phase3_landed_cost.sql"
echo   [OK] Migration 006

psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%~dp0migrations\007_phase4_reporting.sql"
echo   [OK] Migration 007

psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%~dp0migrations\008_phase5_notifications.sql"
echo   [OK] Migration 008

echo.
echo [步驟 3/3] 建立管理員帳號...
psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -c "INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES ('admin1', '$2b$12$m1JFBId2RskByWzyW9Bo2.ztIJvfg.G6t334/UTPeDIYBEDgepyum', '系統管理員', 'owner', TRUE) ON CONFLICT (username) DO NOTHING;"
echo [OK] 管理員帳號建立完成

echo.
echo ========================================
echo   資料庫初始化完成！
echo ----------------------------------------
echo   帳號: admin1
echo   密碼: erp20261
echo ========================================
echo.
echo 現在可以執行 start-erp.bat 啟動系統
echo.
pause
exit /b 0

:error
echo.
echo [錯誤] Migration 執行失敗，請確認編碼設定
echo 請在 cmd 中執行: chcp 65001
echo 然後重新執行本腳本
pause
exit /b 1
