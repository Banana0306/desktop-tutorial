@echo off
:: 需要以系統管理員身份執行
title 瑞城 ERP - 開啟防火牆連接埠

echo.
echo ========================================
echo   開啟防火牆（讓手機可以連線）
echo   請以系統管理員身份執行此腳本
echo ========================================
echo.

:: 開啟 port 3000（前端）
netsh advfirewall firewall add rule ^
    name="瑞城ERP-前端 Port 3000" ^
    dir=in action=allow protocol=TCP localport=3000 > nul 2>&1
echo [OK] 已開啟 Port 3000（前端介面）

:: 開啟 port 3001（後端 API）
netsh advfirewall firewall add rule ^
    name="瑞城ERP-後端 Port 3001" ^
    dir=in action=allow protocol=TCP localport=3001 > nul 2>&1
echo [OK] 已開啟 Port 3001（後端 API）

echo.
echo ========================================
echo   防火牆設定完成！
echo   現在手機可以透過 WiFi 連線預覽系統
echo ========================================
echo.
pause
