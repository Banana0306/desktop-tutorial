# 瑞城 ERP - 全自動安裝與啟動腳本
# 使用方式：在 PowerShell（系統管理員）執行
# Set-ExecutionPolicy RemoteSigned -Scope CurrentUser  （首次需執行）

param([switch]$SkipInstall)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ErrorActionPreference = "SilentlyContinue"

function Write-Title($t)  { Write-Host "`n$t" -ForegroundColor Cyan }
function Write-OK($t)     { Write-Host "  [OK] $t" -ForegroundColor Green }
function Write-Step($t)   { Write-Host "  [..] $t" -ForegroundColor Yellow }
function Write-Fail($t)   { Write-Host "  [!!] $t" -ForegroundColor Red }

Clear-Host
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "     瑞城 ERP 全自動安裝程式 v1.0" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# ── 步驟 1：確認 Node.js ──────────────────────────
Write-Title "步驟 1/6  確認 Node.js"
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVer = (node -v)
    Write-OK "Node.js 已安裝：$nodeVer"
} else {
    Write-Fail "未偵測到 Node.js，正在安裝..."
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
    if (Get-Command node -ErrorAction SilentlyContinue) {
        Write-OK "Node.js 安裝成功：$(node -v)"
    } else {
        Write-Fail "Node.js 安裝失敗，請手動安裝 https://nodejs.org 後重試"
        Read-Host "按 Enter 離開"; exit 1
    }
}

# ── 步驟 2：確認 PostgreSQL ───────────────────────
Write-Title "步驟 2/6  確認 PostgreSQL"
$pgReady = Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet -WarningAction SilentlyContinue

if (-not $pgReady) {
    Write-Step "PostgreSQL 未啟動，嘗試啟動服務..."
    $pgServices = Get-Service | Where-Object { $_.Name -like "postgresql*" }
    if ($pgServices) {
        $pgServices | Start-Service
        Start-Sleep -Seconds 3
        $pgReady = Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet -WarningAction SilentlyContinue
        if ($pgReady) { Write-OK "PostgreSQL 已啟動" }
        else {
            Write-Fail "PostgreSQL 無法啟動，請確認已安裝 PostgreSQL 16"
            Write-Host "  下載：https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
            Read-Host "按 Enter 離開"; exit 1
        }
    } else {
        Write-Fail "找不到 PostgreSQL 服務，請安裝 PostgreSQL 16"
        Write-Host "  下載：https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
        Read-Host "按 Enter 離開"; exit 1
    }
} else {
    Write-OK "PostgreSQL 已在執行"
}

# ── 步驟 3：初始化資料庫 ─────────────────────────
Write-Title "步驟 3/6  初始化資料庫"
$env:PGPASSWORD = "erp_secure_2026"

# 嘗試連線確認資料庫是否已建立
$dbExists = & psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -c "SELECT 1" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-OK "資料庫 ruicheng_erp 已存在，跳過初始化"
} else {
    Write-Step "建立資料庫使用者與資料庫..."
    $env:PGPASSWORD = ""
    & psql -U postgres -h 127.0.0.1 -c "CREATE USER erp_user WITH PASSWORD 'erp_secure_2026';" 2>&1 | Out-Null
    & psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE ruicheng_erp OWNER erp_user;" 2>&1 | Out-Null
    & psql -U postgres -h 127.0.0.1 -c "GRANT ALL PRIVILEGES ON DATABASE ruicheng_erp TO erp_user;" 2>&1 | Out-Null
    $env:PGPASSWORD = "erp_secure_2026"

    Write-Step "執行資料庫 Migrations..."
    $migrations = @(
        "001_phase1_base.sql","002_phase2a_purchasing.sql","003_phase2b_sales.sql",
        "004_phase2c_inventory.sql","005_phase2d_ar_ap.sql","006_phase3_landed_cost.sql",
        "007_phase4_reporting.sql","008_phase5_notifications.sql"
    )
    foreach ($m in $migrations) {
        $path = Join-Path $ScriptDir "migrations\$m"
        & psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -f $path 2>&1 | Out-Null
        Write-OK "  $m"
    }

    Write-Step "建立管理員帳號..."
    & psql -U erp_user -d ruicheng_erp -h 127.0.0.1 -c "INSERT INTO users (username,password_hash,full_name,role,is_active) VALUES ('admin1','\$2b\$12\$m1JFBId2RskByWzyW9Bo2.ztIJvfg.G6t334/UTPeDIYBEDgepyum','系統管理員','owner',TRUE) ON CONFLICT (username) DO NOTHING;" 2>&1 | Out-Null
    Write-OK "管理員帳號建立完成（admin1 / erp20261）"
}

# ── 步驟 4：安裝 npm 套件 ────────────────────────
Write-Title "步驟 4/6  安裝套件"
if (-not (Test-Path (Join-Path $ScriptDir "backend\node_modules"))) {
    Write-Step "安裝後端套件..."
    Push-Location (Join-Path $ScriptDir "backend")
    & npm install --silent 2>&1 | Out-Null
    Pop-Location
    Write-OK "後端套件安裝完成"
} else { Write-OK "後端套件已存在" }

if (-not (Test-Path (Join-Path $ScriptDir "frontend\node_modules"))) {
    Write-Step "安裝前端套件（約需 1-2 分鐘）..."
    Push-Location (Join-Path $ScriptDir "frontend")
    & npm install --silent 2>&1 | Out-Null
    Pop-Location
    Write-OK "前端套件安裝完成"
} else { Write-OK "前端套件已存在" }

# ── 步驟 5：開啟防火牆 ───────────────────────────
Write-Title "步驟 5/6  設定防火牆"
netsh advfirewall firewall add rule name="ERP-Port-3000" dir=in action=allow protocol=TCP localport=3000 2>&1 | Out-Null
netsh advfirewall firewall add rule name="ERP-Port-3001" dir=in action=allow protocol=TCP localport=3001 2>&1 | Out-Null
Write-OK "防火牆 Port 3000、3001 已開啟"

# ── 步驟 6：取得本機 IP ──────────────────────────
Write-Title "步驟 6/6  取得網路資訊"
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch "^127\." -and $_.IPAddress -notmatch "^169\." } | Select-Object -First 1).IPAddress
if (-not $localIP) { $localIP = "localhost" }
Write-OK "本機 IP：$localIP"

# 更新前端 API 位址
"NEXT_PUBLIC_API_URL=http://${localIP}:3001" | Set-Content (Join-Path $ScriptDir "frontend\.env.local") -Encoding UTF8
Write-OK "前端 API 位址已設定"

# ── 啟動所有服務 ─────────────────────────────────
Write-Host "`n================================================" -ForegroundColor Green
Write-Host "  安裝完成！正在啟動系統..." -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green

Start-Process "cmd" -ArgumentList "/k title 瑞城ERP-後端 && cd /d `"$ScriptDir\backend`" && node src/index.js"
Start-Sleep -Seconds 3
Start-Process "cmd" -ArgumentList "/k title 瑞城ERP-前端 && cd /d `"$ScriptDir\frontend`" && npx next dev --hostname 0.0.0.0"

Write-Step "等待系統啟動（15 秒）..."
Start-Sleep -Seconds 15

# 開啟瀏覽器
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "   系統已啟動！" -ForegroundColor Green
Write-Host "------------------------------------------------" -ForegroundColor Green
Write-Host "   電腦瀏覽器： http://localhost:3000" -ForegroundColor White
Write-Host "   手機預覽：   http://${localIP}:3000" -ForegroundColor Yellow
Write-Host "------------------------------------------------" -ForegroundColor Green
Write-Host "   帳號：admin1" -ForegroundColor White
Write-Host "   密碼：erp20261" -ForegroundColor White
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  手機與電腦需連同一 WiFi 才能使用手機預覽" -ForegroundColor Gray
Write-Host "  如需 Cloudflare 公開網址，請執行 start-cloudflare-tunnel.ps1" -ForegroundColor Gray
Write-Host ""
Read-Host "按 Enter 關閉此視窗（系統繼續運行）"
