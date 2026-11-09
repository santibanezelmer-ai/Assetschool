# AssetSchool — Guía de Compilación, Empaquetado e Instalación del Agente Windows

## 1. Requisitos del Sistema
- **Sistema Operativo**: Windows 10 (versión 1903 o superior) o Windows 11 (todas las ediciones: Pro, Enterprise, Education).
- **Arquitectura**: x64 o ARM64.
- **Framework**: .NET 8 Runtime (o empaquetado autónomo Self-Contained).
- **Aceleración Gráfica**: Soporte Direct3D 11 compatible (WDDM 1.2+).

---

## 2. Compilación del Agente Nativo

### 2.1 Requisitos de Compilación
- SDK de .NET 8.0: `dotnet --version` >= 8.0.200
- Windows 10 SDK (versión 10.0.19041.0 o superior)

### 2.2 Comando de Compilación (Release)
```powershell
cd agents/windows-agent

# Restaurar paquetes NuGet
dotnet restore

# Compilación en modo Release
dotnet build -c Release

# Publicar binario único autónomo (Single-File Executable)
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o ./publish/win-x64
```

El ejecutable resultante estará en `publish/win-x64/AssetSchoolAgent.exe`.

---

## 3. Empaquetado y Distribución MSI para Despliegue Masivo (GPO / Intune)

Para laboratorios con decenas de computadores, el agente se empaqueta en formato MSI utilizando WiX Toolset:

```xml
<!-- fragmento wix: AssetSchoolAgent.wxs -->
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*" Name="AssetSchool Student Agent" Version="1.0.0" Manufacturer="AssetSchool" Language="1033">
    <Package InstallerVersion="500" Compressed="yes" InstallScope="perMachine" />
    <MediaTemplate EmbedCab="yes" />
    <Feature Id="Main" Level="1">
      <ComponentRef Id="AgentExe" />
      <ComponentRef Id="AgentStartupShortcut" />
    </Feature>
  </Product>
</Wix>
```

### 3.1 Instalación Silenciosa por Línea de Comandos
```cmd
msiexec /i AssetSchoolAgent.msi /quiet /norestart INSTITUTION_CODE="SAN-AGUSTIN-01" SERVER_IP="192.168.1.10"
```

---

## 4. Configuración de Firewall de Windows
El agente requiere comunicación saliente hacia el servidor central:
- **TCP 48501**: Señalización WebSocket de comandos y WebRTC.
- **UDP 48500**: Descubrimiento LAN multicast/broadcast.
- **UDP 50000-50100**: Tráfico P2P directo WebRTC de video.

Comando de PowerShell para abrir reglas en el equipo:
```powershell
New-NetFirewallRule -DisplayName "AssetSchool Agent LAN" -Direction Inbound -LocalPort 50000-50100 -Protocol UDP -Action Allow
```
