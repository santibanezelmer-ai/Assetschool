# AssetSchool Agent — Windows (C# / .NET 8)

## 1. Arquitectura y Tecnologías
- **Lenguaje**: C# (.NET 8.0 SDK).
- **Target Framework**: `net8.0-windows10.0.19041.0` (compatible con Windows 10 versión 2004+ y Windows 11).
- **Motor WebRTC**: `SIPSorcery` (v8.0.x) + `SIPSorceryMedia.Encoders` (VP8 / H.264).
  - Cumplimiento RFC: ICE Trickle, DTLS 1.2, SRTP, SDP Offer/Answer estándar.
  - Modo LAN-First: Candidatos ICE de tipo `host` directos, sin dependencia de servidores STUN/TURN públicos.
- **Captura de Pantalla**: `Windows.Graphics.Capture` (WinRT API moderna) con interoperabilidad DXGI y Direct3D11.
- **Indicador de Privacidad**: Overlay visible `CaptureIndicatorOverlay` con borde rojo en pantalla completa y bandera de supervisión activa.

## 2. Requisitos de Entorno para Compilación y Ejecución
Para compilar y ejecutar este agente se requiere:
1. **Sistema Operativo**: Windows 10 (Build 19041 o superior) o Windows 11 (físico o máquina virtual con soporte DirectX).
2. **SDK**: [.NET 8.0 SDK para Windows](https://dotnet.microsoft.com/download/dotnet/8.0).
3. **Herramientas**: Visual Studio 2022 o Visual Studio Code con extensión C# Dev Kit.
4. **Privilegios**: Ejecutar en sesión de usuario activa (para interactuar con la sesión gráfica de Windows Desktop) con permisos estándar o elevados si se requiere bloqueo de input.

> **Nota para entornos de desarrollo macOS/Linux**: El framework `net8.0-windows10.0.19041.0` referencia tipos de Windows Runtime (`Windows.Graphics.Capture`, `Windows.UI.Composition`) y solo puede compilarse nativamente en sistemas Windows o mediante contenedores con Windows Base Image.

## 3. Instrucciones de Compilación y Prueba en Windows
```powershell
# Restaurar dependencias NuGet (SIPSorcery, System.Text.Json)
dotnet restore AssetSchool.Agent.csproj

# Compilar proyecto en modo Release
dotnet build AssetSchool.Agent.csproj -c Release

# Ejecutar el agente conectado al Gateway LAN de AssetSchool
dotnet run --project AssetSchool.Agent.csproj
```
