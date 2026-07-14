@echo off
title Build Electron Installer - Notion Product Creator
cd /d "%~dp0"
echo ==================================================
echo   DONG GOI NOTION PRODUCT CREATOR BANG ELECTRON
echo ==================================================
echo.
echo Dang build bo cai dat Electron...
call npm run electron-build
echo.
echo Hoan thanh! Bo cai dat moi nam tai: dist-electron\
echo.
pause
