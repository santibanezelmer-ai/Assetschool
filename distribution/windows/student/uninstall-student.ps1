<#
.SYNOPSIS
    Desinstalación limpia de AssetSchool Student en Windows.
.DESCRIPTION
    Detiene y elimina el servicio de Windows, remueve la clave Run del SessionAgent,
    limpia las reglas de firewall y opcionalmente borra el directorio de instalación y datos.
#>
param(
    [string]$ServiceName = "AssetSchoolStudentService",
    [string]$InstallDir = "C:\Program Files\AssetSchool\Student",
    [string]$DataDir = "C:\ProgramData\AssetSchool\Student",
    [switch]$KeepData = $false
)

# Requiere elevación como Administrador
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Este script de desinstalación requiere privilegios elevados de Administrador."
}

$ErrorActionPreference = "SilentlyContinue"

Write-Host "======================================================================" -ForegroundColor Yellow
Write-Host "   ASSETSCHOOL — DESINSTALACIÓN DE STUDENT WINDOWS                    " -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Yellow

# 1. Detener y eliminar servicio Windows
Write-Host "[1/4] Deteniendo y eliminando servicio Windows '$ServiceName'..." -ForegroundColor Yellow
Stop-Service -Name $ServiceName -Force
Start-Sleep -Seconds 2
sc.exe delete $ServiceName | Out-Null
Write-Host "  ✓ Servicio Windows desregistrado." -ForegroundColor Green

# 2. Eliminar clave de inicio Run
Write-Host "[2/4] Removiendo clave de inicio de SessionAgent..." -ForegroundColor Yellow
$runKeyPath = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run"
Remove-ItemProperty -Path $runKeyPath -Name "AssetSchoolStudentSessionAgent" -ErrorAction SilentlyContinue
Write-Host "  ✓ Clave de registro removida." -ForegroundColor Green

# 3. Eliminar reglas de firewall
Write-Host "[3/4] Eliminando reglas de Windows Firewall..." -ForegroundColor Yellow
netsh.exe advfirewall firewall delete rule name="AssetSchool Student (UDP Discovery)" | Out-Null
netsh.exe advfirewall firewall delete rule name="AssetSchool Student UDP Discovery" | Out-Null
netsh.exe advfirewall firewall delete rule name="AssetSchool Student (Mediasoup SFU WebRTC)" | Out-Null
netsh.exe advfirewall firewall delete rule name="AssetSchool Student SFU WebRTC" | Out-Null
netsh.exe advfirewall firewall delete rule name="AssetSchool Student (Signaling Outbound)" | Out-Null
netsh.exe advfirewall firewall delete rule name="AssetSchool Student Outbound Signaling" | Out-Null
netsh.exe advfirewall firewall delete rule name="AssetSchool Student Service Program" | Out-Null
Write-Host "  ✓ Reglas de firewall eliminadas." -ForegroundColor Green

# 4. Limpieza de archivos
Write-Host "[4/4] Limpiando archivos del sistema..." -ForegroundColor Yellow
if (Test-Path $InstallDir) {
    Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue
    Write-Host "  ✓ Directorio $InstallDir eliminado." -ForegroundColor Green
}
if (-not $KeepData -and (Test-Path $DataDir)) {
    Remove-Item -Recurse -Force $DataDir -ErrorAction SilentlyContinue
    Write-Host "  ✓ Directorio de datos $DataDir eliminado." -ForegroundColor Green
}

Write-Host "`nDesinstalación completada con éxito." -ForegroundColor Green
