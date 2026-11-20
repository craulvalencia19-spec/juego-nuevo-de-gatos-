@echo off
title Cats Frost PUBLICO
where node >nul 2>nul
if errorlevel 1 (
  echo Falta instalar Node.js: https://nodejs.org
  pause
  exit /b
)
start "Servidor" cmd /k "node server.js"
timeout /t 3 >nul
start http://localhost:8080
echo Abajo aparecera un enlace https://...trycloudflare.com : ese es el que compartes.
echo Para subir videos usa SIEMPRE http://localhost:8080 como administrador.
npx --yes cloudflared tunnel --url http://localhost:8080
pause
