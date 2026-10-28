@echo off
title Smart Middleware Diagnostics
echo ===================================================
echo           SMART MIDDLEWARE DIAGNOSTICS
echo ===================================================
echo.
if exist "%~dp0LAST_ERROR.json" (
    echo [Latest Failure Details]
    type "%~dp0LAST_ERROR.json"
    echo.
) else (
    echo [Status] No errors recorded.
    echo.
)
if exist "%~dp0error.log" (
    echo [Recent Error Log]
    type "%~dp0error.log"
) else (
    echo [Log] error.log is empty.
)
echo.
echo ===================================================
pause
