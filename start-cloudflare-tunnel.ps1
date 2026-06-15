# start-cloudflare-tunnel.ps1
# 一鍵啟動 Cloudflare Tunnel，讓手機透過公開網址預覽系統
# 使用方式：右鍵 → 以 PowerShell 執行

$ErrorActionPreference = "SilentlyContinue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step($msg) { Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "[錯誤] $msg" -ForegroundColor Red }

Clear-Host
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  瑞城 ERP - Cloudflare Tunnel 啟動" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# 1. 確認 cloudflared 已安裝
Write-Step "確認 cloudflared 安裝狀態..."
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "  [安裝] 正在安裝 cloudflared..." -ForegroundColor Yellow
    winget install Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
        Write-Err "cloudflared 安裝失敗，請手動下載："
        Write-Host "  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" -ForegroundColor Yellow
        Read-Host "按 Enter 離開"
        exit 1
    }
}
Write-OK "cloudflared 已就緒"

# 2. 確認後端正在運行
Write-Step "確認後端服務 (port 3001)..."
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/login" -Method POST `
        -ContentType "application/json" -Body '{"username":"x","password":"x"}' `
        -TimeoutSec 3 -ErrorAction SilentlyContinue
} catch {}
$portCheck = Test-NetConnection -ComputerName 127.0.0.1 -Port 3001 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $portCheck) {
    Write-Err "後端服務未啟動！請先執行 start-erp.bat 再執行此腳本"
    Read-Host "按 Enter 離開"
    exit 1
}
Write-OK "後端服務正常"

# 3. 啟動 Backend Tunnel（port 3001）
Write-Step "啟動 Backend Tunnel (port 3001)..."
$backendErrLog = "$env:TEMP\erp-cf-backend.log"
Remove-Item $backendErrLog -ErrorAction SilentlyContinue

$backendJob = Start-Process -FilePath "cloudflared" `
    -ArgumentList "tunnel --url http://localhost:3001 --no-autoupdate 2>&1" `
    -RedirectStandardError $backendErrLog `
    -PassThru -WindowStyle Hidden

# 等待 Backend URL 出現
$backendUrl = ""
Write-Host "  等待 Tunnel URL（最多 30 秒）" -NoNewline
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    Write-Host "." -NoNewline
    $log = Get-Content $backendErrLog -Raw -ErrorAction SilentlyContinue
    if ($log -match "(https://[a-z0-9\-]+\.trycloudflare\.com)") {
        $backendUrl = $Matches[1]
        break
    }
}
Write-Host ""

if ($backendUrl -eq "") {
    Write-Err "無法取得 Backend Tunnel URL，請確認網路連線"
    $backendJob | Stop-Process -ErrorAction SilentlyContinue
    Read-Host "按 Enter 離開"
    exit 1
}
Write-OK "Backend Tunnel: $backendUrl"

# 4. 更新前端設定，將 API URL 改為 Tunnel URL
Write-Step "更新前端 API 位址..."
$envFile = Join-Path $ScriptDir "frontend\.env.local"
"NEXT_PUBLIC_API_URL=$backendUrl" | Set-Content $envFile -Encoding UTF8
Write-OK "已更新 .env.local"

# 5. 重啟前端（使用新的 API URL）
Write-Step "重啟前端服務..."
# 關閉舊的前端
Get-Process "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*next*" -or $_.MainWindowTitle -like "*瑞城ERP-前端*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 2

# 啟動新的前端（監聽所有介面）
Start-Process -FilePath "cmd" `
    -ArgumentList "/k title 瑞城ERP-前端 && chcp 65001 && cd /d `"$ScriptDir\frontend`" && npx next dev --hostname 0.0.0.0" `
    -WindowStyle Normal

Write-Host "  等待前端重啟（15 秒）" -NoNewline
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    Write-Host "." -NoNewline
}
Write-Host ""
Write-OK "前端服務已重啟"

# 6. 啟動 Frontend Tunnel（port 3000）
Write-Step "啟動 Frontend Tunnel (port 3000)..."
$frontendErrLog = "$env:TEMP\erp-cf-frontend.log"
Remove-Item $frontendErrLog -ErrorAction SilentlyContinue

$frontendJob = Start-Process -FilePath "cloudflared" `
    -ArgumentList "tunnel --url http://localhost:3000 --no-autoupdate 2>&1" `
    -RedirectStandardError $frontendErrLog `
    -PassThru -WindowStyle Hidden

# 等待 Frontend URL 出現
$frontendUrl = ""
Write-Host "  等待 Tunnel URL（最多 30 秒）" -NoNewline
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    Write-Host "." -NoNewline
    $log = Get-Content $frontendErrLog -Raw -ErrorAction SilentlyContinue
    if ($log -match "(https://[a-z0-9\-]+\.trycloudflare\.com)") {
        $frontendUrl = $Matches[1]
        break
    }
}
Write-Host ""

if ($frontendUrl -eq "") {
    Write-Err "無法取得 Frontend Tunnel URL"
    Read-Host "按 Enter 離開"
    exit 1
}
Write-OK "Frontend Tunnel: $frontendUrl"

# 7. 產生 QR Code 並顯示結果
$qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + [System.Uri]::EscapeDataString($frontendUrl)

Write-Host ""
Write-Host "=======================================" -ForegroundColor Green
Write-Host "  Cloudflare Tunnel 啟動完成！" -ForegroundColor Green
Write-Host "---------------------------------------" -ForegroundColor Green
Write-Host "  手機預覽網址:" -ForegroundColor White
Write-Host "  $frontendUrl" -ForegroundColor Yellow
Write-Host "---------------------------------------" -ForegroundColor Green
Write-Host "  帳號: admin1    密碼: erp20261" -ForegroundColor White
Write-Host "=======================================" -ForegroundColor Green
Write-Host ""

# 複製到剪貼簿
$frontendUrl | Set-Clipboard
Write-Host "  ✅ 網址已複製到剪貼簿" -ForegroundColor Cyan
Write-Host ""

# 開啟 QR Code（用瀏覽器顯示讓手機掃描）
Write-Host "  [開啟] QR Code 讓手機掃描..." -ForegroundColor Cyan
Start-Process $qrUrl

# 開啟電腦瀏覽器預覽
Start-Process $frontendUrl

Write-Host ""
Write-Host "  Tunnel 持續在背景運行中" -ForegroundColor Gray
Write-Host "  關閉本視窗將停止 Tunnel 連線" -ForegroundColor Gray
Write-Host ""
Read-Host "按 Enter 停止 Tunnel 並離開"

# 清理
$backendJob | Stop-Process -ErrorAction SilentlyContinue
$frontendJob | Stop-Process -ErrorAction SilentlyContinue

# 還原 .env.local 為本機設定
"NEXT_PUBLIC_API_URL=http://localhost:3001" | Set-Content $envFile -Encoding UTF8
Write-OK "已還原本機設定"
Write-Host ""
