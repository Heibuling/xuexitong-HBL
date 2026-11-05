# XueXiTong Web Learning Helper - Installer
# Usage: double-click install.bat (recommended)
# Or: powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1

try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$SCRIPT_VERSION = '1.1.3'
$REPO     = 'Heibuling/xuexitong-HBL'
$BRANCH   = 'main'
$NODE_MIN = 18

# 设置窗口标题
$Host.UI.RawUI.WindowTitle = 'HBL - XueXiTong Helper'

function Write-Step($n, $text) {
    Write-Host ""
    Write-Host "[$n] $text" -ForegroundColor Cyan
}
function Write-Ok($text)   { Write-Host "    OK  $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "    !   $text" -ForegroundColor Yellow }
function Write-Err($text)  { Write-Host "    X   $text" -ForegroundColor Red }

Write-Host ""
Write-Host "==============================================================" -ForegroundColor White
Write-Host "   XueXiTong Web Learning Helper - Installer v$SCRIPT_VERSION" -ForegroundColor White
Write-Host "==============================================================" -ForegroundColor White
Write-Host ""
Write-Host "  IMPORTANT:" -ForegroundColor Yellow
Write-Host "  This tool completes course video progress, chapter quizzes" -ForegroundColor Yellow
Write-Host "  and in-video tests on your behalf. These are recorded in" -ForegroundColor Yellow
Write-Host "  the school system and count toward grades. Using automation" -ForegroundColor Yellow
Write-Host "  may violate course rules and risk grade invalidation or" -ForegroundColor Yellow
Write-Host "  disciplinary action." -ForegroundColor Yellow
Write-Host ""
$ans = Read-Host "  Type YES to continue, anything else to exit"
if ($ans -ne 'YES') {
    Write-Host ""
    Write-Host "  Cancelled." -ForegroundColor Gray
    exit 0
}

Write-Step 1 "Checking environment"

$os = [System.Environment]::OSVersion.VersionString
Write-Ok "OS: $os"
Write-Ok "PowerShell: $($PSVersionTable.PSVersion)"

$nodeExe = $null

# 1) PATH 里找
$cmd = Get-Command node -ErrorAction SilentlyContinue
if ($cmd) { $nodeExe = $cmd.Source }

# 2) 常见安装路径
if (-not $nodeExe) {
    $nodeCandidates = @(
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
        "$env:APPDATA\npm\node.exe"
    )
    foreach ($c in $nodeCandidates) {
        if (Test-Path $c) { $nodeExe = $c; break }
    }
}

# 3) nvm / volta 等版本管理器
if (-not $nodeExe) {
    $vmPaths = @(
        "$env:APPDATA\nvm",
        "$env:LOCALAPPDATA\Volta\tools\image\node",
        "$env:USERPROFILE\.volta\bin"
    )
    foreach ($vp in $vmPaths) {
        if (Test-Path $vp) {
            $found = Get-ChildItem $vp -Recurse -Filter "node.exe" -ErrorAction SilentlyContinue |
                     Select-Object -First 1
            if ($found) { $nodeExe = $found.FullName; break }
        }
    }
}

# 4) 注册表兜底
if (-not $nodeExe) {
    try {
        $regPath = 'HKLM:\SOFTWARE\Node.js'
        $v = (Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue).InstallPath
        if ($v -and (Test-Path (Join-Path $v 'node.exe'))) { $nodeExe = Join-Path $v 'node.exe' }
    } catch {}
}

if (-not $nodeExe) {
    Write-Warn "Node.js not found"
    Write-Host ""
    Write-Host "  Please install Node.js LTS first, then re-run." -ForegroundColor Yellow
    Write-Host "  Download: https://nodejs.org/en/download" -ForegroundColor White
    Write-Host ""
    Write-Host "  After install, close this window and run install.bat again." -ForegroundColor Gray
    Write-Host ""
    $open = Read-Host "  Open download page now? (Y/n)"
    if ($open -ne 'n') { Start-Process "https://nodejs.org/en/download" }
    exit 1
}

$nodeVer = (& $nodeExe --version 2>&1).ToString().Trim()
Write-Ok "Node.js: $nodeVer"

$verNum = [int]($nodeVer -replace '^v(\d+)\..*$', '$1')
if ($verNum -lt $NODE_MIN) {
    Write-Err "Node.js too old (need v$NODE_MIN+)"
    Start-Process "https://nodejs.org/en/download"
    exit 1
}

$edgeExe = $null
$edgeCandidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)
foreach ($p in $edgeCandidates) {
    if (Test-Path $p) { $edgeExe = $p; break }
}

if (-not $edgeExe) {
    $regPaths = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe'
    )
    foreach ($rp in $regPaths) {
        try {
            $v = (Get-ItemProperty -Path $rp -ErrorAction SilentlyContinue).'(default)'
            if ($v -and (Test-Path $v)) { $edgeExe = $v; break }
        } catch {}
    }
}

if (-not $edgeExe) {
    $cmd = Get-Command msedge.exe -ErrorAction SilentlyContinue
    if ($cmd) { $edgeExe = $cmd.Source }
}

if (-not $edgeExe) {
    Write-Err "Microsoft Edge not found"
    Write-Host "  Tried:" -ForegroundColor Gray
    foreach ($p in $edgeCandidates) { Write-Host "    $p" -ForegroundColor DarkGray }
    Write-Host ""
    Write-Host "  Install Edge: https://www.microsoft.com/edge" -ForegroundColor Yellow
    exit 1
}
Write-Ok "Edge: $((Get-Item $edgeExe).VersionInfo.ProductVersion)  [$edgeExe]"

Write-Step 2 "Fetching program files"

$targetDir = Join-Path $env:USERPROFILE 'xuexitong-HBL'

if (Test-Path (Join-Path $targetDir 'index.mjs')) {
    Write-Ok "Exists: $targetDir"
    $reuse = Read-Host "    Use existing files? (Y/n)"
    if ($reuse -eq 'n') {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $backup = "$targetDir.bak-$stamp"
        Move-Item $targetDir $backup
        Write-Ok "Backed up to: $backup"
    }
}

if (-not (Test-Path (Join-Path $targetDir 'index.mjs'))) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    $downloaded = $false

    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-Host "    Trying git clone ..." -ForegroundColor Gray
        try {
            & git clone --depth 1 --branch $BRANCH "https://github.com/$REPO.git" $targetDir 2>&1 | Out-Null
            if (Test-Path (Join-Path $targetDir 'index.mjs')) {
                Write-Ok "git clone succeeded"
                $downloaded = $true
            }
        } catch {
            Write-Warn "git clone failed, falling back to zip"
        }
    }

    if (-not $downloaded) {
        $zipUrls = @(
            "https://codeload.github.com/$REPO/zip/refs/heads/$BRANCH",
            "https://ghproxy.net/https://codeload.github.com/$REPO/zip/refs/heads/$BRANCH",
            "https://gh-proxy.com/https://codeload.github.com/$REPO/zip/refs/heads/$BRANCH",
            "https://ghfast.top/https://codeload.github.com/$REPO/zip/refs/heads/$BRANCH",
            "https://mirror.ghproxy.com/https://codeload.github.com/$REPO/zip/refs/heads/$BRANCH"
        )
        $zipPath = Join-Path $env:TEMP "hbl-$([guid]::NewGuid().ToString('N').Substring(0,8)).zip"

        foreach ($url in $zipUrls) {
            Write-Host "    Downloading ..." -ForegroundColor Gray
            try {
                Invoke-WebRequest -Uri $url -OutFile $zipPath -TimeoutSec 120 -ErrorAction Stop
                if ((Get-Item $zipPath).Length -gt 1000) { $downloaded = $true; break }
            } catch {
                Write-Warn "This URL failed"
            }
        }

        if (-not $downloaded) {
            Write-Err "Download failed, all sources unreachable"
            Write-Host ""
            Write-Host "  Tried:" -ForegroundColor Gray
            foreach ($u in $zipUrls) { Write-Host "    $u" -ForegroundColor DarkGray }
            Write-Host ""
            Write-Host "  Manual download: https://github.com/$REPO" -ForegroundColor Yellow
            Write-Host "  Then unzip and run install.bat from that folder." -ForegroundColor Yellow
            exit 1
        }

        Write-Host "    Extracting ..." -ForegroundColor Gray
        $extractDir = Join-Path $env:TEMP "hbl-extract-$([guid]::NewGuid().ToString('N').Substring(0,8))"
        Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
        $inner = Get-ChildItem $extractDir -Directory | Select-Object -First 1
        if ($inner) {
            Copy-Item "$($inner.FullName)\*" $targetDir -Recurse -Force
        } else {
            Copy-Item "$extractDir\*" $targetDir -Recurse -Force
        }
        Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

        # 校验核心文件是否齐全
        $requiredFiles = @('index.mjs', 'cdp.mjs', 'config.mjs')
        $missing = @()
        foreach ($rf in $requiredFiles) {
            if (-not (Test-Path (Join-Path $targetDir $rf))) { $missing += $rf }
        }
        if ($missing.Count -gt 0) {
            Write-Err "Missing files after extract: $($missing -join ', ')"
            Write-Host "  The download may be corrupted. Please retry." -ForegroundColor Yellow
            exit 1
        }
        Write-Ok "Extracted (verified)"
    }
}

if (-not (Test-Path (Join-Path $targetDir 'index.mjs'))) {
    Write-Err "Files incomplete, please retry"
    exit 1
}
Write-Ok "Program dir: $targetDir"

Write-Step 3 "Configure course parameters"

$configPath = Join-Path $targetDir 'config.mjs'
Write-Host ""
Write-Host "  Open your course page in browser, copy the full URL." -ForegroundColor White
Write-Host "  It looks like:" -ForegroundColor Gray
Write-Host "  https://mooc1.chaoxing.com/mycourse/studentstudy?courseId=123456&clazzid=789012&cpi=345678" -ForegroundColor DarkGray
Write-Host ""

$url = Read-Host "  Paste course page URL"

$courseId = $null; $clazzId = $null; $cpi = $null
if ($url -match 'courseId=(\d+)') { $courseId = $Matches[1] }
if ($url -match 'clazzid=(\d+)')  { $clazzId  = $Matches[1] }
if ($url -match 'cpi=(\d+)')      { $cpi      = $Matches[1] }

if (-not $courseId -or -not $clazzId -or -not $cpi) {
    Write-Warn "Could not parse all params, enter manually"
    if (-not $courseId) { $courseId = Read-Host "    courseId" }
    if (-not $clazzId)  { $clazzId  = Read-Host "    clazzId" }
    if (-not $cpi)      { $cpi      = Read-Host "    cpi" }
}

Write-Ok "courseId = $courseId"
Write-Ok "clazzId  = $clazzId"
Write-Ok "cpi      = $cpi"

$cfg = Get-Content $configPath -Raw -Encoding UTF8
$cfg = $cfg -replace "courseId:\s*'[^']*'", "courseId: '$courseId'"
$cfg = $cfg -replace "clazzId:\s*'[^']*'",  "clazzId:  '$clazzId'"
$cfg = $cfg -replace "cpi:\s*'[^']*'",      "cpi:      '$cpi'"
Set-Content -Path $configPath -Value $cfg -Encoding UTF8 -NoNewline
Write-Ok "Config written"

Write-Step 4 "Launch browser (isolated profile)"

$profileDir = Join-Path $env:LOCALAPPDATA 'HBL-Browser'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$busy = Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    Write-Warn "Port 9222 is busy"
    $kill = Read-Host "    Kill the process holding it? (Y/n)"
    if ($kill -ne 'n') {
        $procId = ($busy | Select-Object -First 1).OwningProcess
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Ok "Port released"
    }
}

$edgeArgs = @(
    '--remote-debugging-port=9222',
    '--remote-debugging-address=127.0.0.1',
    "--user-data-dir=$profileDir",
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    'https://mooc1.chaoxing.com/'
)
Start-Process -FilePath $edgeExe -ArgumentList $edgeArgs
Write-Ok "Browser launched"
Write-Ok "Listening: 127.0.0.1:9222 (localhost only)"

Write-Host ""
Write-Host "  >>> Log in to your course in the new browser window <<<" -ForegroundColor Yellow
Write-Host ""
Read-Host "  Press Enter after login"

$cdpOk = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        $v = Invoke-RestMethod 'http://127.0.0.1:9222/json/version' -TimeoutSec 3
        Write-Ok "Connected: $($v.Browser)"
        $cdpOk = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $cdpOk) {
    Write-Err "Cannot connect to CDP port"
    Write-Host "  Close all browser windows and retry" -ForegroundColor Yellow
    exit 1
}

Write-Step 5 "Start program"

Write-Host ""
Write-Host "  Press Ctrl+C to stop anytime." -ForegroundColor White
Write-Host ""
$go = Read-Host "  Start now? (Y/n)"
if ($go -eq 'n') {
    Write-Host ""
    Write-Host "  Run manually later:" -ForegroundColor Gray
    Write-Host "    cd `"$targetDir`"" -ForegroundColor Gray
    Write-Host "    node index.mjs" -ForegroundColor Gray
    exit 0
}

Set-Location $targetDir
Write-Host ""
Write-Host "==============================================================" -ForegroundColor Green
Write-Host "   RUNNING - close this window to stop" -ForegroundColor Green
Write-Host "==============================================================" -ForegroundColor Green
Write-Host ""

$Host.UI.RawUI.WindowTitle = 'HBL - Running'
& $nodeExe 'index.mjs'
$Host.UI.RawUI.WindowTitle = 'HBL - Done'

Write-Host ""
Write-Host "  Program exited." -ForegroundColor Gray
Write-Host "  Re-run: cd `"$targetDir`"; node index.mjs" -ForegroundColor Gray
Write-Host "  Script version: $SCRIPT_VERSION" -ForegroundColor DarkGray
Write-Host ""
