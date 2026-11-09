# AssetSchool — Arquitectura de Captura Nativa de Pantalla (Fase 02)

## 1. Visión General y Filosofía de Captura
AssetSchool implementa una arquitectura de captura de pantalla multiplataforma basada estrictamente en las APIs gráficas oficiales y modernas de cada sistema operativo. El objetivo es alcanzar máximo rendimiento, aceleración por hardware por GPU, latencia sub-100ms dentro de la red de área local (LAN), y estricta transparencia ética hacia el estudiante.

```
+---------------------------------------------------------------------------------------+
|                               ASSETSCHOOL CAPTURE ENGINE                              |
+---------------------------------------------------------------------------------------+
|  Windows 10/11              macOS 12.3+           Linux Wayland/X11     ChromeOS      |
|  Windows.Graphics.Capture   ScreenCaptureKit      PipeWire / xdg-portal chrome.desktop|
|  Direct3D11 FramePool       SCStreamOutput        DMA-BUF / XShm        Capture Media |
+-----------------------------+---------------------+---------------------+-------------+
|                             NATIVE HARDWARE VIDEO ENCODER                             |
|                             H.264 (NVENC/AMF/QSV/VideoToolbox/VA-API) / VP8           |
+---------------------------------------------------------------------------------------+
|                             WEBRTC RTP / SRTP STREAM ENGINE                           |
|                             PeerConnection over Local LAN Subnet                      |
+---------------------------------------------------------------------------------------+
```

---

## 2. Implementación Específica por Plataforma

### 2.1 Windows (C# / .NET 8)
- **API Principal**: `Windows.Graphics.Capture.GraphicsCaptureItem` y `Direct3D11CaptureFramePool`.
- **Aceleración Gráfica**: Utiliza Direct3D 11 (`ID3D11Device`, `IDXGISwapChain`) para extraer texturas directamente desde la memoria de video (VRAM), evitando copias innecesarias en CPU (`zero-copy pipeline`).
- **Control de Monitor**: Identifica monitores activos mediante `DisplayMonitor` y permite seleccionar monitor primario o secundario sin interrupción de sesión.
- **Cambios de Resolución**: Detecta eventos de redimensionado o cambio de modo gráfico vía `GraphicsCaptureItem.Closed` y recrea el `Direct3D11CaptureFramePool` dinámicamente.
- **Privacidad y Permisos**:
  - Requiere ejecución en la sesión interactiva del usuario de Windows.
  - No instala drivers de captura oscuros ni hooks de kernel que degraden la estabilidad del sistema.
  - Muestra un banner visual superior no intrusivo (`CaptureIndicatorOverlay`) informando al estudiante la supervisión activa.
  - Al recibir `SCREEN_CAPTURE_STOP`, invoca `session.Dispose()`, liberando buffers y hardware GPU inmediatamente.

### 2.2 macOS (Swift / ScreenCaptureKit)
- **API Principal**: `ScreenCaptureKit` (`SCShareableContent`, `SCStream`, `SCContentFilter`, `SCStreamConfiguration`).
- **Versión de SO**: Compatible con macOS 12.3 (Monterey), 13 (Ventura), 14 (Sonoma) y 15 (Sequoia).
- **Control de Formato y Tasa**: Configura `pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange`, `minimumFrameInterval = CMTime(1, 10)` o `CMTime(1, 30)` según el nivel de calidad.
- **Gestión de Permisos TCC (Transparency, Consent, and Control)**:
  - Valida permisos antes de iniciar mediante `CGPreflightScreenCaptureAccess()`.
  - Si no está autorizado, invoca `CGRequestScreenCaptureAccess()` para abrir el diálogo del sistema en `Ajustes del Sistema -> Privacidad y Seguridad -> Grabación de pantalla`.
  - Si el estudiante o el sistema deniega el permiso, emite un error formal `WEBRTC_ERROR` con código `PERMISSION_DENIED` hacia la consola docente.
- **Indicador Visible**: Despliega una barra flotante `NSPanel` en la parte superior con aviso de privacidad.

### 2.3 Linux (Rust / PipeWire / xdg-desktop-portal)
- **Entorno Wayland**:
  - Interactúa mediante D-Bus con `org.freedesktop.portal.ScreenCast`.
  - Crea una sesión de captura de portal (`CreateSession`, `SelectSources`, `Start`).
  - Obtiene el descriptor de archivo de PipeWire (`OpenPipeWireRemote`) y el nodo de stream.
  - Los cuadros de video se leen mediante el pipeline de PipeWire utilizando búferes DMA-BUF compartidos.
- **Entorno X11 (Fallback)**:
  - Detecta la ausencia de `WAYLAND_DISPLAY` y recurre a `XShm` (MIT-SHM Shared Memory Extension) para capturar la pantalla raíz `:0`.
- **Indicador Visible**: Notificación de escritorio visible permanente en la barra de tareas o diálogo flotante de supervisión activa.

### 2.4 ChromeOS (Manifest V3 Extension)
- **API Principal**: `chrome.desktopCapture.chooseDesktopMedia(['screen'], streamId => ...)`.
- **Inyección de Flujo**: Obtiene el `MediaStream` mediante `navigator.mediaDevices.getUserMedia` asociando el ID de stream otorgado por el sistema.
- **Entornos Administrados (Google Admin Console)**:
  - En Chromebooks institucionales gestionados por Google Workspace for Education, se despliega la política `AutoSelectDesktopCaptureSourceByScreen`, preautorizando la captura del escritorio completo sin requerir interacción manual del alumno cada vez que inicia una clase.
- **Entornos No Administrados**:
  - Requiere confirmación explícita del usuario en el modal del navegador.

---

## 3. Esquema de Dos Niveles de Calidad (Dual-Tier Optimization)

Para permitir la supervisión simultánea de hasta 40 computadores en un switch LAN de 1 Gbps o punto de acceso Wi-Fi 5/6, se implementa una arquitectura en dos capas:

| Parámetro | Nivel 1: Miniatura (Thumbnail Grid) | Nivel 2: Individual HD (Inspect Modal) |
| :--- | :--- | :--- |
| **Objetivo** | Vista panorámica de 40 pantallas en consola | Inspección profunda y asistencia individual |
| **Resolución** | 640 × 360 (16:9) | 1920 × 1080 (o nativa de pantalla) |
| **Tasa de Cuadros** | 5 – 10 FPS | 25 – 30 FPS |
| **Bitrate Objetivo** | 200 – 300 kbps | 1.500 – 2.500 kbps |
| **Códec de Video** | H.264 Constrained Baseline / VP8 | H.264 High Profile / VP8 |
| **Consumo Total (40 PCs)** | **~8 – 10 Mbps en switch LAN** | **~2 Mbps por equipo activo** |
| **Carga de CPU en Agente** | < 2% (Hardware GPU / NvFBC / VCE) | < 5% (Hardware GPU) |

---

## 4. Detención Inmediata y Resiliencia
1. **Comando Docente**: Al recibir `SCREEN_CAPTURE_STOP`, el hilo de captura se cancela en < 50ms y se destruye el `RTCPeerConnection`.
2. **Desconexión o Caída de Red**: El timeout de latido LAN (35s) o la desconexión del socket WebSocket provoca el cierre automático de la captura local por parte del agente.
3. **Revocación de Dispositivo**: Si el administrador TIC revoca un equipo en PostgreSQL, el servidor cierra inmediatamente todas las sesiones de streaming activas y desconecta el agente.
