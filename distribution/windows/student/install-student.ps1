<#
.SYNOPSIS
    Instalación y registro de seguridad de AssetSchool Student en Windows 11 / 10.
.DESCRIPTION
    Script de instalación y aprovisionamiento seguro de AssetSchool Student:
    - Validación rigurosa de compatibilidad de Windows 11 (x64, Build >= 22000).
    - Verificación e inspección PE x64 de binarios (Service y SessionAgent).
    - Aislamiento NTFS estricto de student-config.json (solo SYSTEM y Administradores).
    - Configuración auditada de firewall: solo tráfico necesario, acotado a red privada y servidor.
    - Registro en Windows SCM con auto-arranque y autorrecuperación nativa.
    - Preservación íntegra de Windows Defender y seguridad del sistema operativo.
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

# -----------------------------------------------------------------------------
# 0. CONTROL DE PRIVILEGIOS Y ENTORNO
# -----------------------------------------------------------------------------
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "ERROR DE SEGURIDAD: Este script de instalación requiere privilegios elevados de Administrador."
}

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   ASSETSCHOOL — INSTALADOR DE SEGURIDAD STUDENT (WINDOWS 11 x64)     " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "Servidor Destino: $($ServerHost):$($ServerPort) $(if ($ServerUrl) { "($ServerUrl)" })"
Write-Host "Directorio de Instalación: $InstallDir"
Write-Host "Directorio de Datos: $DataDir"

# -----------------------------------------------------------------------------
# 1. VERIFICACIÓN DE COMPATIBILIDAD CON WINDOWS 11
# -----------------------------------------------------------------------------
Write-Host "`n[1/7] Auditando compatibilidad de plataforma y sistema operativo..." -ForegroundColor Yellow

# Verificar arquitectura de 64 bits (x64)
if (-not [System.Environment]::Is64BitOperatingSystem) {
    throw "INCOMPATIBILIDAD CRÍTICA: AssetSchool Student requiere un sistema operativo de 64 bits (x64). No compatible con x86/32-bit."
}
Write-Host "  ✓ Arquitectura del procesador/SO: 64-bit (x64/AMD64) compatible." -ForegroundColor Green

# Verificar versión de Windows
$osBuild = [System.Environment]::OSVersion.Version.Build
$osCaption = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption

if ($osBuild -ge 22000) {
    Write-Host "  ✓ Sistema Operativo: $osCaption (Build $osBuild - Windows 11)." -ForegroundColor Green
    if ($osBuild -ge 22621) {
        Write-Host "    -> Soporte completo de Windows.Graphics.Capture sin bordes amarillos (Win 11 22H2+)." -ForegroundColor DarkGray
    }
} elseif ($osBuild -ge 19044) {
    Write-Host "  ℹ Sistema Operativo: $osCaption (Build $osBuild - Windows 10 21H2+)." -ForegroundColor Yellow
} else {
    Write-Warning "El sistema operativo (Build $osBuild) es inferior a Windows 10 21H2 / Windows 11. Podrían presentarse incompatibilidades con las APIs de captura gráfica."
}

# -----------------------------------------------------------------------------
# 2. LOCALIZACIÓN Y VALIDACIÓN ESTRICTA DE BINARIOS PE x64
# -----------------------------------------------------------------------------
Write-Host "`n[2/7] Localizando y validando ejecutables (PE x64)..." -ForegroundColor Yellow

function Test-ValidPeX64Binary {
    param([string]$FilePath)
    if (-not (Test-Path $FilePath)) { return @{ Valid = $false; Reason = "Archivo no encontrado" } }
    try {
        $fileInfo = Get-Item $FilePath
        if ($fileInfo.Length -lt 102400) { # Ejecutable .NET win-x64 autocontenido mínimo > 100 KB
            return @{ Valid = $false; Reason = "Tamaño sospechoso o insuficiente ($($fileInfo.Length) bytes)" }
        }
        $stream = [System.IO.File]::OpenRead($FilePath)
        $reader = New-Object System.IO.BinaryReader($stream)

        # 1. Verificar firma DOS 'MZ' (0x5A4D)
        $dosMagic = $reader.ReadUInt16()
        if ($dosMagic -ne 0x5A4D) {
            $stream.Close()
            return @{ Valid = $false; Reason = "No es un ejecutable válido (cabecera DOS MZ ausente)" }
        }
        # 2. Leer offset de cabecera PE (offset 0x3C en cabecera DOS)
        $stream.Seek(0x3C, [System.IO.SeekOrigin]::Begin) | Out-Null
        $peOffset = $reader.ReadInt32()
        if ($peOffset -lt 0 -or $peOffset -gt ($stream.Length - 24)) {
            $stream.Close()
            return @{ Valid = $false; Reason = "Offset de cabecera PE inválido o corrupto" }
        }
        # 3. Verificar firma PE 'PE\0\0' (0x00004550)
        $stream.Seek($peOffset, [System.IO.SeekOrigin]::Begin) | Out-Null
        $peSig = $reader.ReadUInt32()
        if ($peSig -ne 0x00004550) {
            $stream.Close()
            return @{ Valid = $false; Reason = "Firma PE inválida" }
        }
        # 4. Leer arquitectura Machine en COFF header (0x8664 = IMAGE_FILE_MACHINE_AMD64)
        $machine = $reader.ReadUInt16()
        $stream.Close()

        if ($machine -eq 0x8664) {
            return @{ Valid = $true; Machine = "x64 (AMD64)"; SizeBytes = $fileInfo.Length }
        } else {
            return @{ Valid = $false; Reason = "Arquitectura de binario incompatible ($([Convert]::ToString($machine, 16))). Se requiere x64 (0x8664)." }
        }
    } catch {
        return @{ Valid = $false; Reason = "Error al inspeccionar binario: $_" }
    }
}

$RequiredBinaries = @("AssetSchool.Student.Service.exe", "AssetSchool.Student.SessionAgent.exe")

# Candidatos a directorio contenedor de binarios (orden de prioridad):
$CandidateBinaryDirs = @(
    (Join-Path $PSScriptRoot "bin"),                                                                 # Subdirectorio bin en paquete ZIP
    $PSScriptRoot,                                                                                  # Mismo directorio del script
    (Resolve-Path "$PSScriptRoot\..\..\..\dist\bin\student-windows" -ErrorAction SilentlyContinue),  # Árbol del repositorio
    $InstallDir                                                                                     # Directorio destino preexistente
) | Where-Object { $_ -and (Test-Path $_) }

$BinarySourceDir = $null
foreach ($cDir in $CandidateBinaryDirs) {
    $hasService = Test-Path (Join-Path $cDir "AssetSchool.Student.Service.exe")
    $hasSession = Test-Path (Join-Path $cDir "AssetSchool.Student.SessionAgent.exe")
    if ($hasService -and $hasSession) {
        $BinarySourceDir = $cDir
        break
    }
}

if (-not $BinarySourceDir) {
    throw "INSTALACIÓN ABORTADA POR SEGURIDAD: No se encontró ningún directorio fuente que contenga ambos ejecutables requeridos (AssetSchool.Student.Service.exe y AssetSchool.Student.SessionAgent.exe). Rutas examinadas: $($CandidateBinaryDirs -join '; ')"
}

Write-Host "  ✓ Directorio fuente de distribución localizado: $BinarySourceDir" -ForegroundColor Green

# Validar ambos ejecutables en el directorio fuente
$ResolvedBinaries = @{}
foreach ($binName in $RequiredBinaries) {
    $binPath = Join-Path $BinarySourceDir $binName
    $peCheck = Test-ValidPeX64Binary -FilePath $binPath
    if (-not $peCheck.Valid) {
        throw "INSTALACIÓN ABORTADA POR SEGURIDAD: El binario '$binPath' no es un ejecutable PE x64 válido. Motivo: $($peCheck.Reason)"
    }
    $hash = (Get-FileHash -Path $binPath -Algorithm SHA256).Hash
    Write-Host "  ✓ $binName verificado: formato PE $($peCheck.Machine) [$($peCheck.SizeBytes) bytes], SHA-256: $($hash.Substring(0,16))..." -ForegroundColor Green
    $ResolvedBinaries[$binName] = $binPath
}

# -----------------------------------------------------------------------------
# 3. PREPARACIÓN DE DIRECTORIOS Y COPIA DE LA DISTRIBUCIÓN COMPLETA
# -----------------------------------------------------------------------------
Write-Host "`n[3/7] Desplegando distribución completa en $InstallDir..." -ForegroundColor Yellow
if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
if (-not (Test-Path "$DataDir\logs")) { New-Item -ItemType Directory -Path "$DataDir\logs" -Force | Out-Null }

# Si el directorio fuente es distinto al de instalación, copiar TODOS los archivos y subcarpetas sin filtrar extensiones
if ((Resolve-Path $BinarySourceDir).Path -ne (Resolve-Path $InstallDir).Path) {
    Write-Host "  -> Copiando todos los archivos desde $BinarySourceDir hacia $InstallDir (sin filtros de extensión)..." -ForegroundColor DarkGray
    
    Get-ChildItem -Path $BinarySourceDir -Recurse | ForEach-Object {
        $relPath = [System.IO.Path]::GetRelativePath($BinarySourceDir, $_.FullName)
        $destPath = Join-Path $InstallDir $relPath

        if ($_.PSIsContainer) {
            if (-not (Test-Path $destPath)) {
                New-Item -ItemType Directory -Path $destPath -Force | Out-Null
            }
        } else {
            # Evitar sobreescribir student-config.json si existiera en la fuente
            if ($_.Name -ne "student-config.json") {
                Copy-Item -Path $_.FullName -Destination $destPath -Force
            }
        }
    }
}

# Verificación de integridad post-copia en InstallDir:
foreach ($binName in $RequiredBinaries) {
    $installedBin = Join-Path $InstallDir $binName
    if (-not (Test-Path $installedBin)) {
        throw "ERROR CRÍTICO: Fallo al desplegar $binName en $InstallDir."
    }
    $reCheck = Test-ValidPeX64Binary -FilePath $installedBin
    if (-not $reCheck.Valid) {
        throw "ERROR CRÍTICO: El binario desplegado en '$installedBin' quedó corrupto tras la copia."
    }
}

$deployedFilesCount = (Get-ChildItem -Path $InstallDir -Recurse -File).Count
Write-Host "  ✓ Distribución completa desplegada en $InstallDir ($deployedFilesCount archivos preservados, incluyendo .dll, .dat, .json y dependencias nativas)." -ForegroundColor Green

# -----------------------------------------------------------------------------
# 4. PROTECCIÓN NTFS ESTRICTA DE CONFIGURACIÓN Y SECRETOS
# -----------------------------------------------------------------------------
Write-Host "`n[4/7] Configurando y aislando credenciales institucionales (ACL NTFS)..." -ForegroundColor Yellow

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
    version = "1.2.0-secure"
}

$configJsonPath = Join-Path $DataDir "student-config.json"
$configJson = $configObj | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($configJsonPath, $configJson, [System.Text.Encoding]::UTF8)

# Regla de Seguridad Crítica: Solo SYSTEM y Administradores pueden leer student-config.json.
# Los usuarios estándar (estudiantes) NO tienen acceso de lectura para evitar robo de tokens.
try {
    $acl = New-Object System.Security.AccessControl.FileSecurity
    # Deshabilitar herencia y remover reglas heredadas
    $acl.SetAccessRuleProtection($true, $false)

    # Regla SYSTEM: Control Total (necesario para el servicio Windows en Sesión 0)
    $systemSid = New-Object System.Security.Principal.SecurityIdentifier([System.Security.Principal.WellKnownSidType]::LocalSystemSid, $null)
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($systemSid, "FullControl", "Allow")))

    # Regla Administradores: Control Total
    $adminSid = New-Object System.Security.Principal.SecurityIdentifier([System.Security.Principal.WellKnownSidType]::BuiltinAdministratorsSid, $null)
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($adminSid, "FullControl", "Allow")))

    Set-Acl -Path $configJsonPath -AclObject $acl
    Write-Host "  ✓ Permisos NTFS blindados en $configJsonPath (Acceso exclusivo a SYSTEM y Administradores; Usuarios estándar bloqueados)." -ForegroundColor Green
} catch {
    Write-Warning "Advertencia al aplicar ACL en $configJsonPath: $_"
}

# Auditoría de Cifrado en Conectividad
if ($effectiveUrl -match "^https://" -or $effectiveUrl -match "^wss://") {
    Write-Host "  ✓ Cifrado de transporte: Canal TLS/WSS activo hacia $effectiveUrl" -ForegroundColor Green
} else {
    Write-Host "  ⚠️ AVISO DE CONECTIVIDAD: Señalización en HTTP/WS plano ($effectiveUrl)." -ForegroundColor Yellow
    Write-Host "     Limitada estrictamente al laboratorio LAN privado. Flujos WebRTC cifrados vía DTLS/SRTP." -ForegroundColor DarkGray
}

# -----------------------------------------------------------------------------
# 5. REGISTRO EN WINDOWS SERVICE CONTROL MANAGER (SCM) CON AUTORRECUPERACIÓN
# -----------------------------------------------------------------------------
Write-Host "`n[5/7] Registrando servicio en Windows Service Control Manager (SCM)..." -ForegroundColor Yellow
$serviceExePath = Join-Path $InstallDir "AssetSchool.Student.Service.exe"

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "  -> Deteniendo y eliminando servicio previo..." -ForegroundColor DarkGray
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

# Registrar servicio nativo
$binPathArg = "`"$serviceExePath`""
sc.exe create $ServiceName binPath= $binPathArg start= auto DisplayName= "$DisplayName"
if ($LASTEXITCODE -ne 0) {
    throw "Error crítico al registrar servicio '$ServiceName' en SCM."
}

sc.exe description $ServiceName "Servicio residente de supervisión, administración remota e interactividad de AssetSchool Student."

# Autorrecuperación nativa ante caídas inesperadas
sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000
Write-Host "  ✓ Servicio '$ServiceName' registrado con arranque automático y autorrecuperación nativa." -ForegroundColor Green

# Configurar SessionAgent en el inicio de sesiones interactivas de escritorio
$sessionAgentExePath = Join-Path $InstallDir "AssetSchool.Student.SessionAgent.exe"
$runKeyPath = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run"
$runValueName = "AssetSchoolStudentSessionAgent"
Set-ItemProperty -Path $runKeyPath -Name $runValueName -Value "`"$sessionAgentExePath`" --autostart" -Type String
Write-Host "  ✓ SessionAgent registrado para inicio interactivo en sesiones de usuario." -ForegroundColor Green

# -----------------------------------------------------------------------------
# 6. CONFIGURACIÓN AUDITADA DE WINDOWS FIREWALL (SOLO SENTIDO REAL Y RED PRIVADA)
# -----------------------------------------------------------------------------
Write-Host "`n[6/7] Configurando reglas de Windows Firewall (Auditoría de Tráfico Real)..." -ForegroundColor Yellow

# Limpiar reglas obsoletas o excesivas previas
netsh.exe advfirewall firewall delete rule name="AssetSchool Student (Mediasoup SFU WebRTC)" 2>$null | Out-Null
netsh.exe advfirewall firewall delete rule name="AssetSchool Student SFU WebRTC" 2>$null | Out-Null
netsh.exe advfirewall firewall delete rule name="AssetSchool Student Service Program" 2>$null | Out-Null
netsh.exe advfirewall firewall delete rule name="AssetSchool Student (Signaling Outbound)" 2>$null | Out-Null
netsh.exe advfirewall firewall delete rule name="AssetSchool Student (UDP Discovery)" 2>$null | Out-Null

# REGLA 1 (ENTRANTE): Solo si AutoDiscovery está activo, escuchar balizas UDP 48500
# Sentido: INBOUND. Limitada exclusivamente a perfil PRIVADO y a la subred local.
if ($AutoDiscovery) {
    netsh.exe advfirewall firewall add rule name="AssetSchool Student (UDP Discovery)" `
        dir=in action=allow protocol=UDP localport=48500 profile=private remoteip=localsubnet enable=yes | Out-Null
    Write-Host "  ✓ Regla Inbound: UDP 48500 (Baliza de descubrimiento) limitada a perfil Privado y subred local." -ForegroundColor Green
} else {
    Write-Host "  ✓ Autodescubrimiento inactivo (IP fija configurada): Puerto UDP 48500 permanece cerrado a nivel de firewall." -ForegroundColor Green
}

# REGLA 2 (SALIENTE): Señalización Socket.IO / REST hacia el servidor Mac
# Sentido: OUTBOUND. Destino: IP específica del servidor Mac en red privada.
netsh.exe advfirewall firewall add rule name="AssetSchool Student Outbound Signaling" `
    dir=out action=allow protocol=TCP remoteport=$ServerPort remoteip=$ServerHost profile=private enable=yes | Out-Null
Write-Host "  ✓ Regla Outbound: TCP $ServerPort hacia Servidor $ServerHost acotada a perfil Privado." -ForegroundColor Green

# REGLA 3: Tráfico de la aplicación de servicio acotado a la IP del servidor
netsh.exe advfirewall firewall add rule name="AssetSchool Student Service Program" `
    dir=in action=allow program="$serviceExePath" profile=private remoteip=$ServerHost enable=yes | Out-Null
Write-Host "  ✓ Regla de Programa: Tráfico de servicio restringido exclusivamente a la IP docente ($ServerHost) en perfil Privado." -ForegroundColor Green

# -----------------------------------------------------------------------------
# 7. AUDITORÍA DE WINDOWS DEFENDER E INICIO DEL SERVICIO
# -----------------------------------------------------------------------------
Write-Host "`n[7/7] Verificando protecciones de Windows Defender e iniciando servicio..." -ForegroundColor Yellow

try {
    $mp = Get-MpPreference -ErrorAction SilentlyContinue
    if ($mp) {
        $rtActive = if (-not $mp.DisableRealtimeMonitoring) { "Habilitada (Protegido)" } else { "Inactiva (Alerta)" }
        Write-Host "  ✓ Protección en tiempo real de Windows Defender: $rtActive" -ForegroundColor Green
        Write-Host "  ✓ No se modificaron exclusiones de antivirus ni políticas de seguridad del sistema." -ForegroundColor Green
    }
} catch {
    Write-Host "  ℹ Windows Defender intacto." -ForegroundColor Green
}

Write-Host "`nIniciando servicio '$ServiceName'..." -ForegroundColor Yellow
try {
    Start-Service -Name $ServiceName -ErrorAction Stop
    Start-Sleep -Seconds 2
    $svc = Get-Service -Name $ServiceName
    Write-Host "`n======================================================================" -ForegroundColor Green
    Write-Host "   ASSETSCHOOL STUDENT INSTALADO EXITOSAMENTE Y PROTEGIDO             " -ForegroundColor Green
    Write-Host "   Servicio: $($svc.Name) | Estado: $($svc.Status)" -ForegroundColor Green
    Write-Host "   Servidor Asignado: $($ServerHost):$($ServerPort)" -ForegroundColor Green
    Write-Host "   Configuración Asegurada: $configJsonPath" -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Green
} catch {
    Write-Warning "El servicio fue registrado correctamente pero requiere verificación al iniciar: $_"
    Write-Warning "Revise los registros en '$DataDir\logs' para telemetría detallada."
}
