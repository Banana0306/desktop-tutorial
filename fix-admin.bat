@echo off
chcp 65001 > nul
title 建立管理員帳號

net session > nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

set "DIR=%~dp0"
set "DIR=%DIR:~0,-1%"
set PGPASSWORD=erp_secure_2026

echo.
echo  正在建立管理員帳號...
echo.

psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f "%DIR%\create-admin.sql"

echo.
echo  ================================
echo   完成！請用以下帳密登入：
echo   帳號：admin1
echo   密碼：erp20261
echo   網址：http://localhost:3000
echo  ================================
echo.
pause
