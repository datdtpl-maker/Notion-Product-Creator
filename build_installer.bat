@echo off
title Build Installer Setup - Notion Product Creator
cd /d "%~dp0"
echo ==================================================
echo   TAO BO CAI DAT ELECTRON
echo ==================================================
echo.
call npm run electron-build
echo.
pause
