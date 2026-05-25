@echo off
cd /d %~dp0
if not exist node_modules (
    echo Instalando dependencias pela primeira vez...
    call npm install
)
call npm run dev
