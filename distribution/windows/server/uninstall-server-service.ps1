<#
.SYNOPSIS
    Desinstalación limpia del servicio AssetSchool Server en Windows.
#>
param(
    [string]$ServiceName = "AssetSchoolServer",
    [switch]$RemoveData = $false
)

$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Este script debe ejecutarse con privilegios elevados de Administrador."
}

$ErrorActionPreference = "Continue"

Write-Host "======================================================================" -ForegroundColor Yellow
Write-Host "   ASSETSCHOOL — DESINSTALACIÓN DEL SERVICIO WINDOWS                 " -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Yellow

# 1. Detener servicio
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "Deteniendo servicio '$ServiceName'..."
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    # 2. Eliminar del SCM
    Write-Host "Eliminando registro del servicio..."
    sc.exe delete $ServiceName | Out-Null
    Write-Host "  ✓ Servicio eliminado de SCM." -ForegroundColor Green
} else {
    Write-Host "El servicio '$ServiceName' no se encuentra registrado."
}

# 3. Eliminar reglas de firewall
Write-Host "Eliminando reglas de firewall..."
netsh.exe advfirewall firewall delete rule name="AssetSchool Server HTTP" 2>$null | Out-Null
netsh.exe advfirewall firewall delete rule name="AssetSchool Discovery UDP" 2>$null | Out-Null
netsh.exe advfirewall firewall delete rule name="AssetSchool Mediasoup SFU UDP" 2>$null | Out-Null
Write-Host "  ✓ Reglas de firewall removidas." -ForegroundColor Green

# 4. Datos institucionales
if ($RemoveData) {
    Write-Host "Eliminando datos institucionales de ProgramData..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force "C:\ProgramData\AssetSchool\Server" -ErrorAction SilentlyContinue
    Write-Host "  ✓ Datos eliminados." -ForegroundColor Green
} else {
    Write-Host "  ℹ Los datos y bases de datos en 'C:\ProgramData\AssetSchool\Server' han sido conservados." -ForegroundColor Cyan
}

Write-Host "`nDesinstalación finalizada con éxito." -ForegroundColor Green
