@echo off
chcp 65001 > nul
title 瑞城 ERP - 停止系統

echo.
echo ========================================
echo   正在停止瑞城 ERP 系統...
echo ========================================
echo.

:: 停止 Node.js 相關程序 (後端 + 前端)
echo [停止] 後端與前端服務...
taskkill /f /fi "WINDOWTITLE eq 瑞城ERP-後端" > nul 2>&1
taskkill /f /fi "WINDOWTITLE eq 瑞城ERP-前端" > nul 2>&1

:: 確保 port 3001 關閉
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 "') do (
    taskkill /f /pid %%a > nul 2>&1
)

:: 確保 port 3000 關閉
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do (
    taskkill /f /pid %%a > nul 2>&1
)

echo [OK] 系統已停止
echo.
pause
