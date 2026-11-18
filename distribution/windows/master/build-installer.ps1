<#
.SYNOPSIS
    Script de compilación del instalador de AssetSchool Master (Windows).
#>
param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [string]$OutputPath = "$PSScriptRoot\..\..\..\dist\installers\windows"
)

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   ASSETSCHOOL — COMPILACIÓN DE INSTALADOR MASTER (WINDOWS)          " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$RepoRoot = Resolve-Path "$PSScriptRoot\..\..\.."
$MasterProject = "$RepoRoot\apps\master-windows\AssetSchool.Master.csproj"
$PublishDir = "$RepoRoot\dist\bin\master-windows"

Write-Host "`n[1/2] Compilando binarios de AssetSchool Master (.NET 8 WPF)..." -ForegroundColor Yellow
if (Test-Path $PublishDir) { Remove-Item -Recurse -Force $PublishDir }
New-Item -ItemType Directory -Path $PublishDir -Force | Out-Null

dotnet publish $MasterProject -c $Configuration -r $Runtime --self-contained true -o $PublishDir
if ($LASTEXITCODE -ne 0) { throw "Error al compilar AssetSchool.Master" }

Write-Host "`n[2/2] Empaquetando instaladores..." -ForegroundColor Yellow
if (-not (Test-Path $OutputPath)) { New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null }

# Si ISCC (Inno Setup Compiler) existe, generar EXE
if (Get-Command "iscc" -ErrorAction SilentlyContinue) {
    Write-Host "  -> Compilando EXE con Inno Setup..."
    iscc "$PSScriptRoot\AssetSchool.Master.iss"
}

# Si WiX existe, generar MSI
if (Get-Command "wix" -ErrorAction SilentlyContinue) {
    Write-Host "  -> Compilando MSI con WiX v4..."
    wix build "$PSScriptRoot\AssetSchool.Master.wxs" -d PublishDir=$PublishDir -o "$OutputPath\AssetSchool.Master.msi"
}

Write-Host "`nCompilación de instaladores completada." -ForegroundColor Green
