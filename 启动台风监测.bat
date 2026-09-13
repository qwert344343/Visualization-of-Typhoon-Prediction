@echo off
chcp 65001 >nul
title 台风实时监测 WebGIS
cd /d "%~dp0"

rem ---- 自动挑选可用端口: 8080 -> 8081 -> 8082 ----
set PORT=
for %%P in (8080 8081 8082) do (
  if not defined PORT (
    netstat -ano | findstr /c:":%%P " | findstr /c:"LISTENING" >nul 2>&1
    if errorlevel 1 set PORT=%%P
  )
)
if not defined PORT (
  echo [提示] 8080-8082 均被占用，系统可能已在运行，直接打开页面...
  start "" "http://localhost:8080"
  timeout /t 5 >nul
  exit /b
)

echo ==============================================
echo   台风实时监测预报 WebGIS  (数据源: 中央气象台)
echo   本地端口: http://localhost:%PORT%
echo   关闭弹出的服务窗口即可停止系统
echo ==============================================
echo 正在启动服务，浏览器将自动打开页面...

start "台风WebGIS服务(请勿关闭)" cmd /k "set PORT=%PORT%&& runtime\node.exe server\index.js"
timeout /t 5 /nobreak >nul
start "" "http://localhost:%PORT%"
echo.
echo 如浏览器未自动打开，请手动访问 http://localhost:%PORT%
timeout /t 8 >nul
