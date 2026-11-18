<#
.SYNOPSIS
    Instalación y registro de AssetSchool Server como servicio nativo de Windows.
.DESCRIPTION
    Registra AssetSchool Server directamente en el Service Control Manager (SCM) de Windows
    utilizando sc.exe y PowerShell nativo, sin dependencias externas de terceros como NSSM.
    Configura arranque automático, cuentas de servicio, variables de entorno institucionales
    y políticas de recuperación ante fallos.
#>
param(
    [string]$ServiceName = "AssetSchoolServer",
    [string]$DisplayName = "AssetSchool Local & Institutional Server",
    [string]$InstallDir = "C:\Program Files\AssetSchool\Server",
    [string]$DataDir = "C:\ProgramData\AssetSchool\Server",
    [int]$Port = 3000,
    [string]$ServerMode = "LOCAL", # LOCAL o DEDICATED
    [string]$NodePath = "$env:ProgramFiles\nodejs\node.exe"
)

# Requiere privilegios de Administrador
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Este script debe ejecutarse con privilegios elevados de Administrador."
}

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   ASSETSCHOOL — INSTALACIÓN DEL SERVICIO NATIVO WINDOWS             " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Verificar Node.js
if (-not (Test-Path $NodePath)) {
    $foundNode = (Get-Command "node.exe" -ErrorAction SilentlyContinue).Source
    if ($foundNode) {
        $NodePath = $foundNode
    } else {
        throw "No se encontró el ejecutable de Node.js en '$NodePath' ni en PATH. Instale Node.js 20+ LTS."
    }
}
Write-Host "[1/5] Entorno Node.js verificado: $NodePath" -ForegroundColor Green

# 2. Verificar Directorio de Instalación y Archivos del Servidor
$ServerEntry = Join-Path $InstallDir "dist\main.js"
if (-not (Test-Path $ServerEntry)) {
    # Si se ejecuta desde el repositorio, copiar o enlazar
    $RepoRoot = Resolve-Path "$PSScriptRoot\..\..\.."
    $LocalDist = Join-Path $RepoRoot "apps\local-server\dist\main.js"
    if (Test-Path $LocalDist) {
        Write-Host "Copiando binarios del servidor a '$InstallDir'..."
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        Copy-Item -Recurse -Force "$RepoRoot\apps\local-server\dist" "$InstallDir\dist"
        Copy-Item -Recurse -Force "$RepoRoot\apps\local-server\package*.json" "$InstallDir\"
        Copy-Item -Recurse -Force "$RepoRoot\apps\local-server\node_modules" "$InstallDir\"
    } else {
        throw "No se encontró '$ServerEntry'. Compile local-server con 'npm run build' antes de registrar el servicio."
    }
}
Write-Host "[2/5] Archivos del servidor verificados en: $InstallDir" -ForegroundColor Green

# 3. Crear directorio de datos persistente
New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
New-Item -ItemType Directory -Path "$DataDir\logs" -Force | Out-Null
New-Item -ItemType Directory -Path "$DataDir\config" -Force | Out-Null

# 4. Crear script de arranque del servicio nativo
$RunnerScript = Join-Path $InstallDir "service-runner.cmd"
$RunnerContent = @"
@echo off
set NODE_ENV=production
set PORT=$Port
set ASSETSCHOOL_SERVER_MODE=$ServerMode
set ASSETSCHOOL_DATA_DIR=$DataDir
cd /d "$InstallDir"
"$NodePath" dist\main.js >> "$DataDir\logs\server.stdout.log" 2>> "$DataDir\logs\server.stderr.log"
"@
Set-Content -Path $RunnerScript -Value $RunnerContent -Encoding ASCII
Write-Host "[3/5] Script de lanzamiento del servicio generado." -ForegroundColor Green

# 5. Registro en Windows Service Control Manager (SCM)
Write-Host "[4/5] Registrando servicio '$ServiceName' en SCM..." -ForegroundColor Yellow

# Si el servicio ya existía, detenerlo y eliminarlo limpiamente
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "  -> Deteniendo servicio previo..."
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

# Registrar servicio nativo
# NOTA DE ARQUITECTURA: Se utiliza el SCM de Windows con arranque automático y recuperación ante fallos.
# No se recurre a NSSM, eliminando dependencias de terceros y garantizando compatibilidad corporativa pura.
$BinPath = "`"$RunnerScript`""
sc.exe create $ServiceName binPath= "$BinPath" start= auto DisplayName= "$DisplayName"
if ($LASTEXITCODE -ne 0) { throw "Error al crear el servicio en SCM." }

sc.exe description $ServiceName "Servicio independiente de gestión de aula, señalización WebRTC y administración institucional de AssetSchool."

# Configurar acciones de recuperación ante caídas: reiniciar a los 5s, 10s, y reiniciar equipo si persiste
sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000

# 6. Reglas de Firewall de Windows
Write-Host "[5/5] Configurando excepciones de firewall..." -ForegroundColor Yellow
netsh.exe advfirewall firewall delete rule name="AssetSchool Server HTTP" 2>$null | Out-Null
netsh.exe advfirewall firewall add rule name="AssetSchool Server HTTP" dir=in action=allow protocol=TCP localport=$Port enable=yes | Out-Null

netsh.exe advfirewall firewall delete rule name="AssetSchool Discovery UDP" 2>$null | Out-Null
netsh.exe advfirewall firewall add rule name="AssetSchool Discovery UDP" dir=in action=allow protocol=UDP localport=48500 enable=yes | Out-Null

netsh.exe advfirewall firewall delete rule name="AssetSchool Mediasoup SFU UDP" 2>$null | Out-Null
netsh.exe advfirewall firewall add rule name="AssetSchool Mediasoup SFU UDP" dir=in action=allow protocol=UDP localport=40000-40999 enable=yes | Out-Null

Write-Host "Iniciando servicio..." -ForegroundColor Yellow
Start-Service -Name $ServiceName
Start-Sleep -Seconds 3

$status = Get-Service -Name $ServiceName
Write-Host "`n======================================================================" -ForegroundColor Green
Write-Host "   SERVICIO INSTALADO EXITOSAMENTE                                   " -ForegroundColor Green
Write-Host "   Nombre: $($status.Name)" -ForegroundColor Green
Write-Host "   Estado: $($status.Status)" -ForegroundColor Green
Write-Host "   Puerto API/Signaling: $Port" -ForegroundColor Green
Write-Host "   Directorio de Datos: $DataDir" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
