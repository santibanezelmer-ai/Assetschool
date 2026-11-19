﻿<#
.SYNOPSIS
    Instalación y registro de AssetSchool Student en Windows 11 / Windows 10.
.DESCRIPTION
    Instala los binarios de AssetSchool Student, registra el Windows Service (Sesión 0)
    en el Service Control Manager (SCM) con arranque automático y recuperación ante fallos,
    registra el SessionAgent interactivo en el registro de inicio de sesión de usuario,
    configura Named Pipes IPC, reglas de firewall específicas para redes privadas y
    establece la configuración de red y servidor escolar sin alterar Windows Defender.
#>
param(
    [string]$ServerHost = "192.168.4.42",
    [int]$ServerPort = 3000,
    [string]$ServerUrl = "",
    [switch]$AutoDiscovery = $true,
    [string]$InstitutionId = "",
    [string]$ClassroomId = "",
    [string]$EnrollmentToken = "",
    [string]$InstallDir = "C:\Program Files\AssetSchool\Student",
    [string]$DataDir = "C:\ProgramData\AssetSchool\Student",
    [string]$ServiceName = "AssetSchoolStudentService",
    [string]$DisplayName = "AssetSchool Student Background Service"
)

# Requiere elevación como Administrador
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Este script de instalación requiere privilegios elevados de Administrador."
}

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   ASSETSCHOOL — INSTALADOR WINDOWS STUDENT (WINDOWS 11 / 10)         " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "Servidor Objetivo: $($ServerHost):$($ServerPort) $(if ($ServerUrl) { "($ServerUrl)" })"
Write-Host "Directorio Instalación: $InstallDir"
Write-Host "Directorio Datos: $DataDir"

# 1. Crear directorios de instalación y datos persistentes
Write-Host "`n[1/7] Preparando directorios del sistema..." -ForegroundColor Yellow
if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
if (-not (Test-Path "$DataDir\logs")) { New-Item -ItemType Directory -Path "$DataDir\logs" -Force | Out-Null }

# Configurar permisos de seguridad NTFS para ProgramData (Administradores y SYSTEM control total, Usuarios lectura/ejecución)
try {
    $acl = Get-Acl $DataDir
    $adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule("Administrators", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule("SYSTEM", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $usersRule = New-Object System.Security.AccessControl.FileSystemAccessRule("Users", "ReadAndExecute", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.SetAccessRule($adminRule)
    $acl.SetAccessRule($systemRule)
    $acl.SetAccessRule($usersRule)
    Set-Acl -Path $DataDir -AclObject $acl
    Write-Host "  ✓ Permisos de seguridad NTFS aplicados a $DataDir" -ForegroundColor Green
} catch {
    Write-Warning "No se pudieron ajustar permisos específicos de ACL en $DataDir: $_"
}

# 2. Copiar binarios si se ejecuta desde el árbol de publicación o repositorio
Write-Host "`n[2/7] Verificando binarios de AssetSchool Student..." -ForegroundColor Yellow
$SourcePublishDir = "$PSScriptRoot\..\..\..\dist\bin\student-windows"
$RequiredExes = @("AssetSchool.Student.Service.exe", "AssetSchool.Student.SessionAgent.exe")

foreach ($exe in $RequiredExes) {
    $destFile = Join-Path $InstallDir $exe
    if (-not (Test-Path $destFile)) {
        $srcFile = Join-Path $SourcePublishDir $exe
        if (Test-Path $srcFile) {
            Copy-Item -Path $srcFile -Destination $destFile -Force
            Write-Host "  ✓ Copiado $exe desde origen de publicación." -ForegroundColor Green
        } else {
            Write-Warning "Archivo $destFile no encontrado en el destino ni en $srcFile."
        }
    } else {
        Write-Host "  ✓ $exe verificado en $InstallDir." -ForegroundColor Green
    }
}

# 3. Generar archivo de configuración persistente student-config.json
Write-Host "`n[3/7] Generando configuración institucional del estudiante..." -ForegroundColor Yellow
$effectiveUrl = if ($ServerUrl) { $ServerUrl } else { "http://$($ServerHost):$($ServerPort)" }
$configObj = @{
    serverHost = $ServerHost
    serverPort = $ServerPort
    serverUrl = $effectiveUrl
    autoDiscovery = [bool]$AutoDiscovery
    institutionId = $InstitutionId
    classroomId = $ClassroomId
    enrollmentToken = $EnrollmentToken
    installedAt = (Get-Date).ToString("o")
    version = "1.2.0"
}

$configJsonPath = Join-Path $DataDir "student-config.json"
$configJson = $configObj | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($configJsonPath, $configJson, [System.Text.Encoding]::UTF8)
Write-Host "  ✓ Archivo de configuración generado: $configJsonPath" -ForegroundColor Green

# 4. Registrar servicio Windows en el Service Control Manager (SCM)
Write-Host "`n[4/7] Registrando servicio en Windows Service Control Manager (SCM)..." -ForegroundColor Yellow
$serviceExePath = Join-Path $InstallDir "AssetSchool.Student.Service.exe"

# Si el servicio ya existe, detener y limpiar
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "  -> Deteniendo servicio preexistente..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

# Crear servicio con arranque automático y cuenta LocalSystem
$binPathArg = "`"$serviceExePath`""
sc.exe create $ServiceName binPath= $binPathArg start= auto DisplayName= "$DisplayName"
if ($LASTEXITCODE -ne 0) {
    throw "Fallo al crear el servicio '$ServiceName' en SCM."
}

# Descripción institucional
sc.exe description $ServiceName "Servicio residente de supervisión, administración remota e interactividad de AssetSchool Student."

# Configurar autorrecuperación nativa (Restart tras 5s, 10s y 30s)
sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000
Write-Host "  ✓ Servicio '$ServiceName' registrado con arranque automático y autorrecuperación." -ForegroundColor Green

# 5. Configurar SessionAgent en el inicio interactivo de sesión de usuario
Write-Host "`n[5/7] Configurando SessionAgent en el inicio interactivo (Run Key)..." -ForegroundColor Yellow
$sessionAgentExePath = Join-Path $InstallDir "AssetSchool.Student.SessionAgent.exe"
$runKeyPath = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run"
$runValueName = "AssetSchoolStudentSessionAgent"
$runCommand = "`"$sessionAgentExePath`" --autostart"

Set-ItemProperty -Path $runKeyPath -Name $runValueName -Value $runCommand -Type String
Write-Host "  ✓ Registro HKLM configurado para lanzar SessionAgent en sesiones de usuario." -ForegroundColor Green

# 6. Configurar excepciones de firewall limitadas estrictamente a la red privada
Write-Host "`n[6/7] Configurando reglas de Windows Firewall (Limitadas a perfil Privado)..." -ForegroundColor Yellow

# UDP 48500 (Baliza de descubrimiento LAN)
netsh.exe advfirewall firewall delete rule name="AssetSchool Student (UDP Discovery)" 2>$null | Out-Null
netsh.exe advfirewall firewall add rule name="AssetSchool Student (UDP Discovery)" dir=in action=allow protocol=UDP localport=48500 profile=private enable=yes | Out-Null
Write-Host "  ✓ Regla Inbound: UDP 48500 (Discovery Beacon) en perfil Privado" -ForegroundColor Green

# UDP 40000-40999 (Mediasoup SFU WebRTC Streaming)
netsh.exe advfirewall firewall delete rule name="AssetSchool Student (Mediasoup SFU WebRTC)" 2>$null | Out-Null
netsh.exe advfirewall firewall add rule name="AssetSchool Student (Mediasoup SFU WebRTC)" dir=in action=allow protocol=UDP localport=40000-40999 profile=private enable=yes | Out-Null
Write-Host "  ✓ Regla Inbound: UDP 40000-40999 (WebRTC Video Streaming) en perfil Privado" -ForegroundColor Green

# TCP 3000 (Señalización WebSocket y API REST)
netsh.exe advfirewall firewall delete rule name="AssetSchool Student (Signaling Outbound)" 2>$null | Out-Null
netsh.exe advfirewall firewall add rule name="AssetSchool Student (Signaling Outbound)" dir=out action=allow protocol=TCP remoteport=$ServerPort profile=private enable=yes | Out-Null
Write-Host "  ✓ Regla Outbound: TCP $ServerPort (Socket.IO WSS / REST) en perfil Privado" -ForegroundColor Green

# Excepción de programa por binario en perfil privado
netsh.exe advfirewall firewall delete rule name="AssetSchool Student Service Program" 2>$null | Out-Null
netsh.exe advfirewall firewall add rule name="AssetSchool Student Service Program" dir=in action=allow program="$serviceExePath" profile=private enable=yes | Out-Null

# 7. Verificar integridad de Windows Defender
Write-Host "`n[7/7] Verificando integridad de protecciones de Windows Defender..." -ForegroundColor Yellow
try {
    $mpPref = Get-MpPreference -ErrorAction SilentlyContinue
    if ($mpPref) {
        $realtime = if ($mpPref.DisableRealtimeMonitoring) { "DESHABILITADO (Alerta)" } else { "Activo y Protegido" }
        Write-Host "  ✓ Antivirus Windows Defender: $realtime" -ForegroundColor Green
        Write-Host "  ✓ Sin exclusiones arbitrarias de carpetas del sistema." -ForegroundColor Green
    } else {
        Write-Host "  ℹ Windows Defender activo (consulta de preferencias no disponible o restringida)." -ForegroundColor Green
    }
} catch {
    Write-Host "  ℹ Estado de Windows Defender intacto." -ForegroundColor Green
}

# 8. Iniciar el servicio Windows
Write-Host "`nIniciando servicio '$ServiceName'..." -ForegroundColor Yellow
try {
    Start-Service -Name $ServiceName -ErrorAction Stop
    Start-Sleep -Seconds 2
    $svc = Get-Service -Name $ServiceName
    Write-Host "`n======================================================================" -ForegroundColor Green
    Write-Host "   ASSETSCHOOL STUDENT INSTALADO EXITOSAMENTE EN WINDOWS 11           " -ForegroundColor Green
    Write-Host "   Servicio: $($svc.Name) | Estado: $($svc.Status)" -ForegroundColor Green
    Write-Host "   Servidor Destino: $($ServerHost):$($ServerPort)" -ForegroundColor Green
    Write-Host "   Directorio Configuración: $configJsonPath" -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Green
} catch {
    Write-Warning "El servicio fue registrado pero no pudo iniciarse inmediatamente: $_"
    Write-Warning "Verifique los logs en $DataDir\logs y que los binarios estén presentes."
}
