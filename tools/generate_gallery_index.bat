@echo off
setlocal

rem Run from repo root regardless of where the batch file is executed from.
cd /d "%~dp0.."

py -3 tools\generate_gallery_index.py
if errorlevel 1 (
  echo.
  echo Gallery index generation FAILED.
  exit /b 1
)

echo.
echo Gallery index generation complete.
exit /b 0