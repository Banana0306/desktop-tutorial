@echo off
chcp 65001 > nul
title 解除 PowerShell 執行限制

net session > nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo 正在解除 PowerShell 執行限制...
powershell -Command "Set-ExecutionPolicy RemoteSigned -Scope LocalMachine -Force"
powershell -Command "Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force"
echo.
echo 完成！現在可以執行 .ps1 腳本了
echo.
pause
