<#
.SYNOPSIS
    Script de compatibilidad para la compilación y empaquetado de AssetSchool Student.
.DESCRIPTION
    Invoca el script maestro 'build-installer.ps1' con todos los parámetros correspondientes.
#>
param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [string]$OutputPath = "$PSScriptRoot\..\..\..\dist\installers\windows",
    [switch]$SkipMsi = $false,
    [switch]$SkipExe = $false,
    [switch]$RequireExe = $false
)

& "$PSScriptRoot\build-installer.ps1" -Configuration $Configuration -Runtime $Runtime -OutputPath $OutputPath -SkipMsi:$SkipMsi -SkipExe:$SkipExe -RequireExe:$RequireExe
