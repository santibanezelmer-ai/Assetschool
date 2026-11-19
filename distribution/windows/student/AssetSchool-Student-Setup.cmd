@echo off
:: ==============================================================================
:: ASSETSCHOOL STUDENT — INSTALADOR EJECUTABLE INTERACTIVO PARA WINDOWS 11
:: ==============================================================================
title AssetSchool Student Setup

echo ==============================================================================
echo    ASSETSCHOOL — INSTALADOR INTERACTIVO DE STUDENT (WINDOWS 11 / 10)
echo ==============================================================================
echo.

:: Comprobar privilegios de Administrador y auto-elevar si es necesario
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ELEVACION] Solicitando privilegios de Administrador...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~f0\" %*\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

set SERVER_HOST=192.168.4.42
set SERVER_PORT=3000

if not "%~1"=="" set SERVER_HOST=%~1
if not "%~2"=="" set SERVER_PORT=%~2

echo Servidor AssetSchool en red local: %SERVER_HOST%:%SERVER_PORT%
echo.
echo Presione [ENTER] para iniciar la instalacion con estos valores,
echo o escriba la direccion IP del Mac docente si es diferente:
set /p USER_INPUT="Direccion IP del servidor [%SERVER_HOST%]: "
if not "%USER_INPUT%"=="" set SERVER_HOST=%USER_INPUT%

echo.
echo Ejecutando instalacion mediante PowerShell...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-student.ps1" -ServerHost "%SERVER_HOST%" -ServerPort %SERVER_PORT%

echo.
echo ==============================================================================
echo Proceso finalizado. Presione cualquier tecla para cerrar esta ventana.
pause >nul
