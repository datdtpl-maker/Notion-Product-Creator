@echo off
title Build Electron Native Setup - Notion Product Creator
cd /d "%~dp0"
echo ==================================================
echo   DONG GOI NOTION PRODUCT CREATOR THANH APP NATIVE (ELECTRON)
echo ==================================================
echo.
echo Dang chay build electron-builder...
call npm run electron-build
echo.
echo Hoan thanh! File bo cai dat Setup moi cua ban nam tai: dist-electron\
echo.
pause
