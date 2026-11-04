# 学习通网页学习助手 — 一键安装脚本
# 用法：右键「使用 PowerShell 运行」
# 或：powershell -ExecutionPolicy Bypass -File .\install.ps1

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$REPO   = 'Heibuling/xuexitong-HBL'
$BRANCH = 'main'
$NODE_MIN = 18

function Write-Step($n, $text) {
    Write-Host ""
    Write-Host "[$n] $text" -ForegroundColor Cyan
}
function Write-Ok($text)   { Write-Host "    OK  $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "    !   $text" -ForegroundColor Yellow }
function Write-Err($text)  { Write-Host "    X   $text" -ForegroundColor Red }

Write-Host ""
Write-Host "==============================================================" -ForegroundColor White
Write-Host "   学习通网页学习助手 — 安装程序" -ForegroundColor White
Write-Host "==============================================================" -ForegroundColor White
Write-Host ""
Write-Host "  重要提示：" -ForegroundColor Yellow
Write-Host "  本工具会代替你完成课程视频进度、章节自测和随堂测评。" -ForegroundColor Yellow
Write-Host "  这些内容在校方系统中计入学习记录与成绩。" -ForegroundColor Yellow
Write-Host "  使用自动化工具可能违反课程规定，存在成绩作废或" -ForegroundColor Yellow
Write-Host "  纪律处理的风险。请确认你已了解并愿意承担后果。" -ForegroundColor Yellow
Write-Host ""
$ans = Read-Host "  输入 YES 继续安装，其他任意键退出"
if ($ans -ne 'YES') {
    Write-Host ""
    Write-Host "  已取消。" -ForegroundColor Gray
    exit 0
}

# ---------------------------------------------------------------- 1. 环境检查
Write-Step 1 "检查运行环境"

$os = [System.Environment]::OSVersion.VersionString
Write-Ok "系统: $os"

# PowerShell 版本
Write-Ok "PowerShell: $($PSVersionTable.PSVersion)"

# Node.js
$nodeExe = $null
$candidates = @('node', "$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe")
foreach ($c in $candidates) {
    try {
        $p = Get-Command $c -ErrorAction SilentlyContinue
        if ($p) { $nodeExe = $p.Source; break }
    } catch {}
}

if (-not $nodeExe -and (Test-Path "$env:ProgramFiles\nodejs\node.exe")) {
    $nodeExe = "$env:ProgramFiles\nodejs\node.exe"
}

if (-not $nodeExe) {
    Write-Warn "未检测到 Node.js，需要安装"
    Write-Host ""
    Write-Host "  将打开 Node.js 官方下载页，请安装 LTS 版本后重新运行本脚本。" -ForegroundColor Yellow
    Write-Host "  下载地址: https://nodejs.org/zh-cn/download" -ForegroundColor White
    Write-Host ""
    $open = Read-Host "  现在打开下载页？(Y/n)"
    if ($open -ne 'n') { Start-Process "https://nodejs.org/zh-cn/download" }
    exit 1
}

$nodeVer = (& $nodeExe --version 2>&1).Trim()
Write-Ok "Node.js: $nodeVer"

$verNum = [int]($nodeVer -replace '^v(\d+)\..*$', '$1')
if ($verNum -lt $NODE_MIN) {
    Write-Err "Node.js 版本过低（需要 v$NODE_MIN+），请升级后重试"
    Start-Process "https://nodejs.org/zh-cn/download"
    exit 1
}

# Edge
$edgeExe = $null
foreach ($p in @(
    "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)) {
    if (Test-Path $p) { $edgeExe = $p; break }
}
if (-not $edgeExe) {
    Write-Err "未找到 Microsoft Edge"
    Write-Host "  请先安装 Edge 浏览器: https://www.microsoft.com/edge" -ForegroundColor Yellow
    exit 1
}
Write-Ok "Edge: $((Get-Item $edgeExe).VersionInfo.ProductVersion)"

# ---------------------------------------------------------------- 2. 获取代码
Write-Step 2 "获取程序文件"

$targetDir = Join-Path $env:USERPROFILE 'xuexitong-HBL'

if (Test-Path (Join-Path $targetDir 'index.mjs')) {
    Write-Ok "已存在: $targetDir"
    $reuse = Read-Host "    使用现有文件？(Y/n)"
    if ($reuse -eq 'n') {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $backup = "$targetDir.bak-$stamp"
        Move-Item $targetDir $backup
        Write-Ok "旧版本已备份到: $backup"
    }
}

if (-not (Test-Path (Join-Path $targetDir 'index.mjs'))) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

    $downloaded = $false

    # 优先 git clone
    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-Host "    尝试 git clone ..." -ForegroundColor Gray
        try {
            & git clone --depth 1 --branch $BRANCH "https://github.com/$REPO.git" $targetDir 2>&1 | Out-Null
            if (Test-Path (Join-Path $targetDir 'index.mjs')) {
                Write-Ok "git clone 成功"
                $downloaded = $true
            }
        } catch {
            Write-Warn "git clone 失败，改用压缩包"
        }
    }

    # 回退：zip 下载
    if (-not $downloaded) {
        $zipUrls = @(
            "https://codeload.github.com/$REPO/zip/refs/heads/$BRANCH",
            "https://ghproxy.net/https://codeload.github.com/$REPO/zip/refs/heads/$BRANCH"
        )

        $zipPath = Join-Path $env:TEMP "hbl-$([guid]::NewGuid().ToString('N').Substring(0,8)).zip"

        foreach ($url in $zipUrls) {
            Write-Host "    尝试下载: $($url.Substring(0, [Math]::Min(60, $url.Length)))..." -ForegroundColor Gray
            try {
                Invoke-WebRequest -Uri $url -OutFile $zipPath -TimeoutSec 120 -ErrorAction Stop
                if ((Get-Item $zipPath).Length -gt 1000) { $downloaded = $true; break }
            } catch {
                Write-Warn "该地址失败"
            }
        }

        if (-not $downloaded) {
            Write-Err "下载失败，请检查网络"
            Write-Host "  可手动下载: https://github.com/$REPO" -ForegroundColor Yellow
            exit 1
        }

        Write-Host "    解压中 ..." -ForegroundColor Gray
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
        Write-Ok "解压完成"
    }
}

if (-not (Test-Path (Join-Path $targetDir 'index.mjs'))) {
    Write-Err "文件不完整，请重试"
    exit 1
}
Write-Ok "程序目录: $targetDir"

# ---------------------------------------------------------------- 3. 配置参数
Write-Step 3 "配置课程参数"

$configPath = Join-Path $targetDir 'config.mjs'
Write-Host ""
Write-Host "  请在浏览器中打开你的学习通课程页面，然后复制地址栏的完整网址。" -ForegroundColor White
Write-Host "  网址看起来像这样：" -ForegroundColor Gray
Write-Host "  https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=xxx&courseId=123456&clazzid=789012&cpi=345678" -ForegroundColor DarkGray
Write-Host ""

$url = Read-Host "  粘贴课程页面网址"

$courseId = $null; $clazzId = $null; $cpi = $null
if ($url -match 'courseId=(\d+)')    { $courseId = $Matches[1] }
if ($url -match 'clazzid=(\d+)')     { $clazzId  = $Matches[1] }
if ($url -match 'cpi=(\d+)')         { $cpi      = $Matches[1] }

if (-not $courseId -or -not $clazzId -or -not $cpi) {
    Write-Warn "网址中未完整找到参数，改为手动输入"
    if (-not $courseId) { $courseId = Read-Host "    courseId" }
    if (-not $clazzId)  { $clazzId  = Read-Host "    clazzId" }
    if (-not $cpi)      { $cpi      = Read-Host "    cpi" }
}

Write-Ok "courseId = $courseId"
Write-Ok "clazzId  = $clazzId"
Write-Ok "cpi      = $cpi"

# 写入配置
$cfg = Get-Content $configPath -Raw -Encoding UTF8
$cfg = $cfg -replace "courseId:\s*'[^']*'", "courseId: '$courseId'"
$cfg = $cfg -replace "clazzId:\s*'[^']*'",  "clazzId:  '$clazzId'"
$cfg = $cfg -replace "cpi:\s*'[^']*'",      "cpi:      '$cpi'"
Set-Content -Path $configPath -Value $cfg -Encoding UTF8 -NoNewline
Write-Ok "配置已写入 config.mjs"

# ---------------------------------------------------------------- 4. 启动浏览器
Write-Step 4 "启动浏览器（独立配置，不影响日常使用）"

$profileDir = Join-Path $env:LOCALAPPDATA 'HBL-Browser'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

# 检查端口占用
$busy = Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    Write-Warn "端口 9222 已被占用"
    $kill = Read-Host "    关闭占用该端口的进程？(Y/n)"
    if ($kill -ne 'n') {
        $procId = ($busy | Select-Object -First 1).OwningProcess
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Ok "已释放端口"
    }
}

# 安全检查：不使用 --remote-allow-origins
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
Write-Ok "浏览器已启动（独立配置目录）"
Write-Ok "监听地址: 127.0.0.1:9222（仅本机）"

Write-Host ""
Write-Host "  >>> 请在弹出的浏览器窗口中登录学习通 <<<" -ForegroundColor Yellow
Write-Host ""
Read-Host "  登录完成后按回车继续"

# 验证 CDP
$cdpOk = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        $v = Invoke-RestMethod 'http://127.0.0.1:9222/json/version' -TimeoutSec 3
        Write-Ok "浏览器已连接: $($v.Browser)"
        $cdpOk = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $cdpOk) {
    Write-Err "无法连接浏览器调试端口"
    Write-Host "  请关闭所有浏览器窗口，重新运行本脚本" -ForegroundColor Yellow
    exit 1
}

# ---------------------------------------------------------------- 5. 运行
Write-Step 5 "启动程序"

Write-Host ""
Write-Host "  即将开始运行。按 Ctrl+C 可随时停止。" -ForegroundColor White
Write-Host ""
$go = Read-Host "  现在开始？(Y/n)"
if ($go -eq 'n') {
    Write-Host ""
    Write-Host "  稍后可手动运行：" -ForegroundColor Gray
    Write-Host "    cd `"$targetDir`"" -ForegroundColor Gray
    Write-Host "    node index.mjs" -ForegroundColor Gray
    exit 0
}

Set-Location $targetDir
Write-Host ""
Write-Host "==============================================================" -ForegroundColor Green
Write-Host "   运行中 - 关闭本窗口即停止" -ForegroundColor Green
Write-Host "==============================================================" -ForegroundColor Green
Write-Host ""

& $nodeExe 'index.mjs'

Write-Host ""
Write-Host "  程序已退出。" -ForegroundColor Gray
Write-Host "  重新运行: cd `"$targetDir`"; node index.mjs" -ForegroundColor Gray
Write-Host ""
