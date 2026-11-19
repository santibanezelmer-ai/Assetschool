<#
.SYNOPSIS
    Script de compilación, segregación arquitectónica y empaquetado de AssetSchool Student Windows.
.DESCRIPTION
    1. Compila en modo Release autocontenido (win-x64) AssetSchool.Student.Service y
       AssetSchool.Student.SessionAgent en directorios segregados e independientes:
       dist/bin/student-windows/Service y dist/bin/student-windows/SessionAgent.
    2. Elimina cualquier fusión o resolución artificial de colisiones entre dependencias autocontenidas.
    3. Valida byte a byte la integridad de ambos ejecutables (cabeceras DOS MZ, PE\0\0, arquitectura AMD64).
    4. Falla inmediatamente si falta algún ejecutable o si no es un binario PE x64 válido.
    5. Preserva el 100% de los archivos generados por dotnet publish (.exe, DLLs administradas, DLLs nativas,
       archivos .dat, runtimeconfig, deps y subdirectorios).
    6. Intenta generar el paquete MSI con WiX Toolset; si WiX no está disponible, informa claramente
       que el MSI no se ha generado (sin recurrir a archivos simulados).
    7. Genera el paquete ZIP de validación con la distribución segregada preservada.
#>
param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [string]$OutputPath = "$PSScriptRoot\..\..\..\dist\installers\windows",
    [switch]$SkipMsi = $false
)

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   ASSETSCHOOL — COMPILACIÓN Y ENSAMBLADO SEGURO (STUDENT WINDOWS)   " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Configuración: $Configuration | Runtime: $Runtime"

# -----------------------------------------------------------------------------
# 0. VERIFICACIÓN DE HERRAMIENTAS DE COMPILACIÓN (.NET SDK)
# -----------------------------------------------------------------------------
$dotnetCmd = Get-Command "dotnet" -ErrorAction SilentlyContinue
if (-not $dotnetCmd) {
    throw "ERROR CRÍTICO: No se encontró 'dotnet' en PATH. Se requiere .NET 8 SDK (winget install Microsoft.DotNet.SDK.8) para compilar los proyectos C#."
}

$RepoRoot = Resolve-Path "$PSScriptRoot\..\..\.."
$ServiceProject = "$RepoRoot\agents\student-windows\src\AssetSchool.Student.Service\AssetSchool.Student.Service.csproj"
$SessionProject = "$RepoRoot\agents\student-windows\src\AssetSchool.Student.SessionAgent\AssetSchool.Student.SessionAgent.csproj"

if (-not (Test-Path $ServiceProject)) { throw "Proyecto no encontrado: $ServiceProject" }
if (-not (Test-Path $SessionProject)) { throw "Proyecto no encontrado: $SessionProject" }

$PublishDir = "$RepoRoot\dist\bin\student-windows"
$ServicePublishDir = Join-Path $PublishDir "Service"
$SessionPublishDir = Join-Path $PublishDir "SessionAgent"

# Limpiar directorios de publicación previa
if (Test-Path $PublishDir) { Remove-Item -Recurse -Force $PublishDir }
New-Item -ItemType Directory -Path $ServicePublishDir -Force | Out-Null
New-Item -ItemType Directory -Path $SessionPublishDir -Force | Out-Null

# -----------------------------------------------------------------------------
# 1. FUNCIÓN DE VALIDACIÓN BINARIA ESTRICTA (PE x64 / AMD64)
# -----------------------------------------------------------------------------
function Test-ValidPeX64Binary {
    param([string]$FilePath)
    if (-not (Test-Path $FilePath)) {
        return @{ Valid = $false; Reason = "El archivo no existe en el disco." }
    }
    try {
        $fileInfo = Get-Item $FilePath
        if ($fileInfo.Length -lt 102400) { # Ejecutable .NET win-x64 autocontenido mínimo > 100 KB
            return @{ Valid = $false; Reason = "Tamaño sospechoso o insuficiente ($($fileInfo.Length) bytes)." }
        }
        $stream = [System.IO.File]::OpenRead($FilePath)
        $reader = New-Object System.IO.BinaryReader($stream)

        # 1. Cabecera DOS 'MZ' (0x5A4D)
        $dosMagic = $reader.ReadUInt16()
        if ($dosMagic -ne 0x5A4D) {
            $stream.Close()
            return @{ Valid = $false; Reason = "Cabecera DOS MZ ausente (no es un ejecutable Windows)." }
        }

        # 2. Offset a cabecera PE en 0x3C
        $stream.Seek(0x3C, [System.IO.SeekOrigin]::Begin) | Out-Null
        $peOffset = $reader.ReadInt32()
        if ($peOffset -lt 0 -or $peOffset -gt ($stream.Length - 24)) {
            $stream.Close()
            return @{ Valid = $false; Reason = "Offset de cabecera PE inválido o fuera de rango ($peOffset)." }
        }

        # 3. Firma PE 'PE\0\0' (0x00004550)
        $stream.Seek($peOffset, [System.IO.SeekOrigin]::Begin) | Out-Null
        $peSig = $reader.ReadUInt32()
        if ($peSig -ne 0x00004550) {
            $stream.Close()
            return @{ Valid = $false; Reason = "Firma PE inválida (no es formato PE)." }
        }

        # 4. Arquitectura Machine en COFF header (0x8664 = IMAGE_FILE_MACHINE_AMD64)
        $machine = $reader.ReadUInt16()
        $stream.Close()

        if ($machine -eq 0x8664) {
            return @{ Valid = $true; Machine = "AMD64 / x64"; SizeBytes = $fileInfo.Length }
        } else {
            return @{ Valid = $false; Reason = "Arquitectura de procesador incompatible ($([Convert]::ToString($machine, 16))). Se requiere 0x8664 (AMD64)." }
        }
    } catch {
        return @{ Valid = $false; Reason = "Error durante el análisis del binario: $_" }
    }
}

# -----------------------------------------------------------------------------
# 2. PUBLICACIÓN SEGREGADA DE AMBOS PROYECTOS (ARQUITECTURA AISLADA)
# -----------------------------------------------------------------------------
Write-Host "`n[1/5] Publicando proyectos C# en directorios segregados e independientes..." -ForegroundColor Yellow

# A. Publicar AssetSchool.Student.Service
Write-Host "  -> Compilando AssetSchool.Student.Service ($Configuration, $Runtime, self-contained)..." -ForegroundColor DarkGray
& dotnet publish $ServiceProject -c $Configuration -r $Runtime --self-contained true -o $ServicePublishDir
if ($LASTEXITCODE -ne 0) {
    throw "COMPILACIÓN FALLIDA: Fallo al publicar AssetSchool.Student.Service. Código de salida: $LASTEXITCODE"
}

# B. Publicar AssetSchool.Student.SessionAgent
Write-Host "  -> Compilando AssetSchool.Student.SessionAgent ($Configuration, $Runtime, self-contained)..." -ForegroundColor DarkGray
& dotnet publish $SessionProject -c $Configuration -r $Runtime --self-contained true -o $SessionPublishDir
if ($LASTEXITCODE -ne 0) {
    throw "COMPILACIÓN FALLIDA: Fallo al publicar AssetSchool.Student.SessionAgent. Código de salida: $LASTEXITCODE"
}

# -----------------------------------------------------------------------------
# 3. VALIDACIÓN ESTRICTA DE EJECUTABLES (PE x64 / AMD64 Y SHA-256)
# -----------------------------------------------------------------------------
Write-Host "`n[2/5] Validando cabeceras PE, arquitectura AMD64 y firmas SHA-256..." -ForegroundColor Yellow

$FinalServiceExe = Join-Path $ServicePublishDir "AssetSchool.Student.Service.exe"
$FinalSessionExe = Join-Path $SessionPublishDir "AssetSchool.Student.SessionAgent.exe"

$checkService = Test-ValidPeX64Binary -FilePath $FinalServiceExe
if (-not $checkService.Valid) {
    throw "ERROR CRÍTICO: AssetSchool.Student.Service.exe no superó la validación. Motivo: $($checkService.Reason)"
}
$hashService = (Get-FileHash -Path $FinalServiceExe -Algorithm SHA256).Hash
Write-Host "  ✓ AssetSchool.Student.Service.exe válido [$($checkService.Machine), $($checkService.SizeBytes) bytes]" -ForegroundColor Green
Write-Host "    Ruta:    $FinalServiceExe" -ForegroundColor DarkGray
Write-Host "    SHA-256: $hashService" -ForegroundColor DarkGray

$checkSession = Test-ValidPeX64Binary -FilePath $FinalSessionExe
if (-not $checkSession.Valid) {
    throw "ERROR CRÍTICO: AssetSchool.Student.SessionAgent.exe no superó la validación. Motivo: $($checkSession.Reason)"
}
$hashSession = (Get-FileHash -Path $FinalSessionExe -Algorithm SHA256).Hash
Write-Host "  ✓ AssetSchool.Student.SessionAgent.exe válido [$($checkSession.Machine), $($checkSession.SizeBytes) bytes]" -ForegroundColor Green
Write-Host "    Ruta:    $FinalSessionExe" -ForegroundColor DarkGray
Write-Host "    SHA-256: $hashSession" -ForegroundColor DarkGray

# -----------------------------------------------------------------------------
# 4. AUDITORÍA DE DEPENDENCIAS DE RUNTIME .NET 8 AUTOCONTENIDO
# -----------------------------------------------------------------------------
Write-Host "`n[3/5] Auditando componentes de runtime .NET 8 autocontenidos en cada directorio..." -ForegroundColor Yellow

$CriticalRuntimeFiles = @("coreclr.dll", "hostfxr.dll", "hostpolicy.dll")
foreach ($comp in @(@{ Name = "Service"; Dir = $ServicePublishDir }, @{ Name = "SessionAgent"; Dir = $SessionPublishDir })) {
    Write-Host "  -> Verificando $($comp.Name) ($($comp.Dir))..." -ForegroundColor DarkGray
    $dirFiles = (Get-ChildItem -Path $comp.Dir -Recurse -File).Count
    Write-Host "     Total de archivos: $dirFiles" -ForegroundColor DarkGray
    foreach ($crf in $CriticalRuntimeFiles) {
        $crfPath = Join-Path $comp.Dir $crf
        if (Test-Path $crfPath) {
            Write-Host "     ✓ Componente runtime preservado: $crf" -ForegroundColor DarkGray
        } else {
            Write-Warning "Componente runtime no encontrado en $($comp.Name): $crf"
        }
    }
}

$totalPublishedFiles = (Get-ChildItem -Path $PublishDir -Recurse -File).Count
Write-Host "  ✓ Estructura segregada lista en $PublishDir ($totalPublishedFiles archivos en total, sin colisiones ni sobreescrituras)." -ForegroundColor Green

# -----------------------------------------------------------------------------
# 5. GENERACIÓN DEL PAQUETE MSI (WIX TOOLSET)
# -----------------------------------------------------------------------------
Write-Host "`n[4/5] Evaluando generación de instalador MSI..." -ForegroundColor Yellow
if (-not (Test-Path $OutputPath)) { New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null }
$WxsFile = "$PSScriptRoot\AssetSchool.Student.wxs"
$MsiOutput = "$OutputPath\AssetSchool.Student.msi"

# Eliminar descriptor simulado si existía previamente
$legacyWixReady = "$OutputPath\AssetSchool.Student.wix-ready.txt"
if (Test-Path $legacyWixReady) { Remove-Item -Force $legacyWixReady }

$wixBuilt = $false
if (-not $SkipMsi) {
    if (Get-Command "wix" -ErrorAction SilentlyContinue) {
        Write-Host "  -> Compilando con WiX v4..." -ForegroundColor DarkGray
        & wix build $WxsFile -d PublishDir=$PublishDir -o $MsiOutput
        if ($LASTEXITCODE -eq 0 -and (Test-Path $MsiOutput)) {
            $msiHash = (Get-FileHash -Path $MsiOutput -Algorithm SHA256).Hash
            $msiSize = (Get-Item $MsiOutput).Length
            Write-Host "  ✓ Instalador MSI generado con éxito: $MsiOutput [$msiSize bytes, SHA-256: $msiHash]" -ForegroundColor Green
            $wixBuilt = $true
        } else {
            Write-Warning "Fallo en la ejecución de WiX v4 (código de salida: $LASTEXITCODE)."
        }
    } elseif (Get-Command "candle" -ErrorAction SilentlyContinue -and Get-Command "light" -ErrorAction SilentlyContinue) {
        Write-Host "  -> Compilando con WiX v3 (candle & light)..." -ForegroundColor DarkGray
        $WixObj = "$PublishDir\AssetSchool.Student.wixobj"
        & candle -dPublishDir=$PublishDir $WxsFile -o $WixObj
        & light -ext WixUIExtension $WixObj -o $MsiOutput
        if ($LASTEXITCODE -eq 0 -and (Test-Path $MsiOutput)) {
            $msiHash = (Get-FileHash -Path $MsiOutput -Algorithm SHA256).Hash
            $msiSize = (Get-Item $MsiOutput).Length
            Write-Host "  ✓ Instalador MSI generado con éxito: $MsiOutput [$msiSize bytes, SHA-256: $msiHash]" -ForegroundColor Green
            $wixBuilt = $true
        } else {
            Write-Warning "Fallo en la ejecución de WiX v3 (código de salida: $LASTEXITCODE)."
        }
    }
}

if (-not $wixBuilt) {
    Write-Host "  ℹ [ESTADO MSI]: WiX Toolset no detectado en PATH. El archivo MSI NO se ha generado." -ForegroundColor Yellow
    Write-Host "    Los binarios compilados están listos en '$PublishDir'." -ForegroundColor Yellow
    Write-Host "    Para generar el MSI: instale WiX (dotnet tool install --global wix) y vuelva a ejecutar este script." -ForegroundColor DarkGray
}

# -----------------------------------------------------------------------------
# 6. GENERACIÓN DEL PAQUETE ZIP DE VALIDACIÓN CON DISTRIBUCIÓN COMPLETA
# -----------------------------------------------------------------------------
Write-Host "`n[5/5] Generando paquete ZIP de validación con distribución completa..." -ForegroundColor Yellow

$ZipStaging = "$OutputPath\_zip_staging"
if (Test-Path $ZipStaging) { Remove-Item -Recurse -Force $ZipStaging }
New-Item -ItemType Directory -Path "$ZipStaging\bin" -Force | Out-Null

# Copiar scripts de instalación a la raíz del paquete
$SetupFiles = @(
    "AssetSchool-Student-Setup.cmd",
    "install-student.ps1",
    "uninstall-student.ps1",
    "AssetSchool.Student.wxs",
    "student-config.sample.json",
    "README_INSTALACION_WINDOWS11.txt",
    "build-msi.ps1"
)

foreach ($sf in $SetupFiles) {
    $sfPath = Join-Path $OutputPath $sf
    if (-not (Test-Path $sfPath)) {
        $sfPath = Join-Path $PSScriptRoot $sf
    }
    if (Test-Path $sfPath) {
        Copy-Item -Path $sfPath -Destination $ZipStaging -Force
        Write-Host "  ✓ Incluido archivo de configuración: $sf" -ForegroundColor DarkGray
    } else {
        Write-Warning "Archivo de configuración no encontrado: $sf"
    }
}

# Copiar árboles segregados completos de publicación al subdirectorio 'bin\'
Copy-Item -Path $ServicePublishDir -Destination "$ZipStaging\bin\Service" -Recurse -Force
Copy-Item -Path $SessionPublishDir -Destination "$ZipStaging\bin\SessionAgent" -Recurse -Force

# Generar archivo ZIP final
$ZipOutputFile = "$OutputPath\AssetSchool-Student-v1.2.0-Win11-Validation.zip"
if (Test-Path $ZipOutputFile) { Remove-Item -Force $ZipOutputFile }

Compress-Archive -Path "$ZipStaging\*" -DestinationPath $ZipOutputFile -CompressionLevel Optimal
Remove-Item -Recurse -Force $ZipStaging

$zipInfo = Get-Item $ZipOutputFile
$zipHash = (Get-FileHash -Path $ZipOutputFile -Algorithm SHA256).Hash

Write-Host "`n======================================================================" -ForegroundColor Green
Write-Host "   COMPILACIÓN Y EMPAQUETADO COMPLETADOS EXITOSAMENTE                " -ForegroundColor Green
Write-Host "   Directorio Publicación: $PublishDir ($totalPublishedFiles archivos)" -ForegroundColor Green
Write-Host "   Service Exe:            AssetSchool.Student.Service.exe (SHA: $($hashService.Substring(0,16))...)" -ForegroundColor Green
Write-Host "   SessionAgent Exe:       AssetSchool.Student.SessionAgent.exe (SHA: $($hashSession.Substring(0,16))...)" -ForegroundColor Green
Write-Host "   Paquete ZIP:            $ZipOutputFile ($([math]::Round($zipInfo.Length / 1MB, 2)) MB)" -ForegroundColor Green
Write-Host "   SHA-256 ZIP:            $zipHash" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
