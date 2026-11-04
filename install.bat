@echo off
setlocal

title XueXiTong Helper - Installer

echo.
echo ==============================================================
echo    XueXiTong Web Learning Helper - Installer
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

echo Starting installer...
echo.

where pwsh >nul 2>&1
if %errorlevel% equ 0 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
)

set "EXITCODE=%errorlevel%"

echo.
if %EXITCODE% neq 0 (
    echo --------------------------------------------------------------
    echo Exit code: %EXITCODE%
    echo Please screenshot the error above.
    echo --------------------------------------------------------------
) else (
    echo --------------------------------------------------------------
    echo Done.
    echo --------------------------------------------------------------
)
echo.
pause
endlocal
