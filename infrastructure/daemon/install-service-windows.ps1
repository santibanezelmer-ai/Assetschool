# ==============================================================================
# AssetSchool Server — Instalador de Servicio Windows (Modo Local o Dedicado)
# ==============================================================================
param (
    [string]$Mode = "local",
    [string]$InstallDir = "C:\Program Files\AssetSchool\Server",
    [string]$Port = "3000"
)

$ServiceName = "AssetSchoolServer"
$DisplayName = "AssetSchool Server — Servidor Escolar Independiente"
$Description = "Servicio de administración de aulas y transporte WebRTC LAN-First de AssetSchool."

Write-Host "================================================================="
Write-Host "  Instalando AssetSchool Server como Servicio de Windows (.NET / Node)"
Write-Host "  Modalidad: $Mode | Puerto: $Port | Directorio: $InstallDir"
Write-Host "================================================================="

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}

$NodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $NodePath) {
    $NodePath = "C:\Program Files\nodejs\node.exe"
}

# Configuración del servicio persistente en Windows
$BinPath = "`"$NodePath`" `"$InstallDir\dist\main.js`""

# Verificar si el servicio ya existe
$Existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($Existing) {
    Write-Host "[Servicio] Deteniendo servicio existente..."
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName | Out-Null
}

Write-Host "[Servicio] Creando servicio Windows..."
sc.exe create $ServiceName binPath= $BinPath start= auto DisplayName= $DisplayName | Out-Null
sc.exe description $ServiceName $Description | Out-Null

# Configurar recuperación ante fallos (reinicio automático en 5 segundos)
sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/5000/restart/10000 | Out-Null

Write-Host "[Servicio] Configurando variables de entorno persistentes..."
[Environment]::SetEnvironmentVariable("SERVER_MODE", $Mode, "Machine")
[Environment]::SetEnvironmentVariable("PORT", $Port, "Machine")

Write-Host "[Servicio] Iniciando AssetSchool Server..."
Start-Service -Name $ServiceName -ErrorAction SilentlyContinue

Write-Host "✓ Servicio $ServiceName instalado y configurado con éxito."
