# AssetSchool — Arquitectura de Agentes Nativos

## 1. Principio Fundamental: Veracidad y No Simulación
Cada agente declara explícitamente las funciones que su sistema operativo objetivo soporta a nivel de arquitectura y modelo de permisos de seguridad. **Bajo ninguna circunstancia se simulan compatibilidades inexistentes**.

## 2. Matriz de Capacidades Reales por Plataforma

| Capacidad | Windows 10/11 (.NET) | macOS 13+ (Swift) | Linux (Rust) | ChromeOS (Ext MV3) |
| :--- | :---: | :---: | :---: | :---: |
| **Captura de Pantalla** | `Windows.Graphics.Capture` | `ScreenCaptureKit` (TCC) | `PipeWire` / `XShm` | No silenciosa (Prompt) |
| **Recepción de Pantalla Docente** | Sí (Ventana Direct3D) | Sí (Metal / AVKit) | Sí (Vulkan / OpenGL) | Sí (Tab / Ventana Web) |
| **Bloqueo de Teclado y Ratón** | Sí (`BlockInput` / Hooks) | Sí (Permiso Accesibilidad) | Sí (`XGrabKeyboard` / libinput) | No permitido por sandbox |
| **Cortina de Pantalla (Blackout)** | Sí (TopMost Window) | Sí (NSWindow Level ScreenSaver)| Sí (Fullscreen Override) | No permitido en OS |
| **Terminación de Procesos** | Sí (`Process.Kill`) | Requiere Daemon Root | Sí (`SIGKILL` / cgroups) | No aplicable |
| **Filtrado Web / URLs** | Sí (WFP / Local Proxy) | Sí (NetworkExtension / PAC) | Sí (nftables / DNS) | Sí (`declarativeNetRequest`)|
| **Inventario de Hardware** | Sí (WMI / CIM) | Sí (`system_profiler`) | Sí (`/proc`, `lshw`) | Atributos Enterprise |
| **Transferencia de Archivos** | Sí | Sí | Sí | Carpeta Downloads |
| **Chat de Asistencia en Aula** | Sí | Sí | Sí | Sí |

## 3. Modelo de Ciclo de Vida del Agente
1. **Arranque del Sistema**: Se inicia como servicio desatendido del sistema o agente de inicio de sesión de usuario.
2. **Escucha de Anuncio**: Abre socket UDP 48500 para detectar el servidor escolar en LAN.
3. **Autenticación Mutua**: Presenta clave pública y número de serie de hardware.
4. **Reporte de Capacidades**: Emite paquete `CAPABILITIES_REPORT` al conectarse.
5. **Bucle de Latido (Heartbeat)**: Pings cada 15 segundos para monitorizar calidad de enlace.
6. **Ejecución Segura**: Recibe comandos firmados con token criptográfico válido.
