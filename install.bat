@echo off
setlocal enabledelayedexpansion

title XueXiTong Helper - Installer

echo.
echo ==============================================================
echo    XueXiTong Web Learning Helper - Installer v1.1.5
echo ==============================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "PS1=%SCRIPT_DIR%install.ps1"

if not exist "%PS1%" (
    echo [ERROR] install.ps1 not found
    echo.
    echo Keep install.bat and install.ps1 in the SAME folder.
    echo Current: %SCRIPT_DIR%
    echo.
    pause
    exit /b 1
)

REM Check PowerShell availability
set "PS_EXE="
where pwsh >nul 2>&1
if !errorlevel! equ 0 (
    set "PS_EXE=pwsh"
) else (
    where powershell >nul 2>&1
    if !errorlevel! equ 0 (
        set "PS_EXE=powershell"
    )
)

if "!PS_EXE!"=="" (
    echo [ERROR] PowerShell not found
    echo This tool requires Windows PowerShell 5.1 or PowerShell 7+
    echo.
    pause
    exit /b 1
)

echo Using: !PS_EXE!
echo Starting installer...
echo.

!PS_EXE! -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "EXITCODE=!errorlevel!"

echo.
if !EXITCODE! neq 0 (
    echo --------------------------------------------------------------
    echo Exit code: !EXITCODE!
    echo.
    echo Common causes:
    echo   - Node.js not installed
    echo   - Network blocked (cannot reach github.com)
    echo   - Edge browser not found
    echo.
    echo Screenshot the messages above for support.
    echo --------------------------------------------------------------
) else (
    echo --------------------------------------------------------------
    echo Completed successfully.
    echo --------------------------------------------------------------
)
echo.
pause
endlocal
