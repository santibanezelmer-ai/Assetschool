# ASSETSCHOOL — ESTADO REAL DE IMPLEMENTACIÓN Y CONTRASTE DOCUMENTAL
## Auditoría Forense de Código vs. Documento Dump Técnico (Fase 02.8)

- **Repositorio:** `/Users/macbook/.gemini/antigravity/scratch/assetschool`
- **Fecha de Auditoría:** 16 de noviembre de 2026
- **Auditor:** Arquitecto de Software Principal, Especialista en Sistemas Operativos, WebRTC y Seguridad
- **Criterio de Evaluación:** 
  - **IMPLEMENTADO**: Código real funcional, probado en tests y/o ejecución física verificable.
  - **PARCIAL**: Código existente pero incompleto, simulado en partes críticas o carente de integración completa.
  - **DOCUMENTADO**: Interfaces, DTOs, comentarios o especificaciones existentes sin lógica de ejecución activa.
  - **NO IMPLEMENTADO**: Afirmado en documentación previa o dump, pero inexistente en el código fuente.

---

## 1. MATRIZ DE CONTRASTE: DUMP TÉCNICO VS. CÓDIGO REAL

| Afirmación Técnica en Dump previo | Componente / Archivos Reales | Estado Real | Evidencia de Pruebas | Observación Forense |
| :--- | :--- | :---: | :--- | :--- |
| **Descubrimiento UDP puerto 48500 cada 3s** | `apps/local-server/src/discovery/discovery-beacon.service.ts`<br/>`agents/macos-agent/Sources/.../DiscoveryListener.swift` | **IMPLEMENTADO** | `tests/run_fase_02_7_suite.mjs` (Automática)<br/>Física en macOS (0.0.0.0/en0) | Emite baliza JSON real por `dgram` en Node.js y escucha por `NWListener` en Swift. Agente Windows tiene escucha básica en C# `Program.cs`. |
| **Canal de Control WebSocket :3000** | `apps/local-server/src/gateway/agent.gateway.ts`<br/>`packages/protocol/src/index.ts` | **IMPLEMENTADO** | `tests/fase_02_4_e2e_suite.mjs`<br/>Física con `AssetSchoolAgent` macOS | Socket.IO v4 real sobre TCP 3000. Handshake `AGENT_HELLO`, latencia < 2ms en LAN. |
| **Captura DirectX DXGI Desktop Duplication en Windows** | `agents/windows-agent/src/Capture/WindowsGraphicsCaptureService.cs` | **PARCIAL** | No tiene prueba física en Windows con hardware real | El archivo define la arquitectura y timers, pero genera un buffer sintético simulado (`byte[64]`). **No tiene llamadas nativas a COM DXGI ni WinRT GraphicsCaptureItem**. |
| **Captura ScreenCaptureKit en macOS** | `agents/macos-agent/Sources/.../ScreenCaptureKitManager.swift` | **IMPLEMENTADO** | `tests/run_macos_native_stream_test.mjs` | Integración nativa con `SCStream`, `SCStreamOutput` y Metal CVPixelBuffer en macOS 14+. |
| **Agente Windows como Servicio Windows (SYSTEM)** | `agents/windows-agent/src/Program.cs` | **NO IMPLEMENTADO** | Ninguna | `Program.cs` es una **aplicación de consola interactiva estándar** (`static async Task Main`). No implementa `BackgroundService`, `WindowsServiceLifetime` ni separación de Sesión 0/1. |
| **IPC de Agente por Named Pipes con ACL** | Inexistente en `agents/windows-agent/` | **NO IMPLEMENTADO** | Ninguna | No existe ningún canal de Named Pipes `\\.\pipe\AssetSchool_IPC` entre servicio de sistema y agente de usuario. |
| **WebRTC DTLS-SRTP P2P en Agente Windows** | `agents/windows-agent/src/Streaming/WebRtcStreamingEngine.cs` | **PARCIAL** | No probado en entorno Windows físico de red | Utiliza la librería RFC `SIPSorcery.Net`, genera SDP real y candidatos ICE, pero falta el pipeline real de frames DXGI hacia el encoder VP8. |
| **WebRTC DTLS-SRTP P2P en Agente macOS** | `agents/macos-agent/Sources/.../WebRtcNativeEngine.swift` | **IMPLEMENTADO** | `tests/webrtc_macos_agent_test.html`<br/>`tests/streaming_5min_telemetry.json` | WebRTC C++ nativo integrado en Swift, transmite frames reales de pantalla a navegador Chrome/Vite. |
| **Telón de Bloqueo Pedagógico con Hook de Teclado `WH_KEYBOARD_LL`** | `agents/windows-agent/src/UI/LockCurtainOverlay.cs` | **PARCIAL** | Probado visualmente en Forms básico | La clase crea un `Form` en WinForms con `TopMost = true` y cancela `FormClosing` (Alt+F4). **No implementa el hook Win32 `SetWindowsHookEx(WH_KEYBOARD_LL)`** para bloquear `Alt+Tab` o `Tecla Windows`. |
| **Telón de Bloqueo en macOS** | `agents/macos-agent/Sources/.../LockCurtainWindow.swift` | **IMPLEMENTADO** | Física en macOS | Ventana `NSWindow` a pantalla completa en nivel `.screenSaver`, oculta cursor y captura foco modal. |
| **Explorador y Transferencia de Archivos Dual (NetSupport)** | `apps/teacher-web/src/components/FileTransferModal.tsx`<br/>`apps/local-server/src/gateway/agent.gateway.ts`<br/>`agents/macos-agent/.../FileManagerService.swift` | **IMPLEMENTADO** | Prueba E2E en paso previo con generación física de PDF en `~/Downloads/AssetSchool/` | Protocolo JSON Base64 funcional para listar directorios, enviar y recolectar. (Pendiente evolución a chunks binarios de alto rendimiento). |
| **Control de Procesos y Cierre Forzado** | `apps/teacher-web/src/components/ProcessControlModal.tsx`<br/>`agents/macos-agent/.../ProcessManagerService.swift` | **IMPLEMENTADO** | Verificado en macOS (`killProcess` vía `NSRunningApplication`) | Lista procesos activos y termina procesos seleccionados por PID. |
| **Base de Datos PostgreSQL 16 Nativa y Persistencia** | `apps/local-server/src/database/database.service.ts`<br/>`infrastructure/postgres/migrations/` | **IMPLEMENTADO** | `tests/fase_02_4_validation_results.json` | PostgreSQL 16 nativo en `127.0.0.1:5432` con esquemas de instituciones, usuarios, aulas, dispositivos y auditoría inmutable. |
| **Capacidad de 40 transmisiones de video simultáneas** | `tests/run_scalability_test.mjs`<br/>`tests/fase_02_5_capacity_results.json` | **DOCUMENTADO / PROYECCIÓN** | Prueba sintética de señalización en memoria | El servidor soportó 40 WebSockets concurrentes con bajo consumo, pero **no se han transmitido 40 flujos reales de video 1080p simultáneos**. Requiere recalibración realista por red física. |
| **Autenticación Mutua por Certificados / Ed25519** | `packages/protocol/src/index.ts` (`SecuritySignature`) | **DOCUMENTADO** | Ninguna prueba activa | La interfaz `SecuritySignature` está definida en el protocolo TypeScript, pero los agentes actuales envían payloads JSON sin firmar criptográficamente. |

---

## 2. CONTRADICCIONES CRÍTICAS DETECTADAS

1. **Afirmación de Servicio Windows vs. Código Real**:
   * *Documento*: Afirmó que el agente de Windows corre como un servicio de sistema silencioso (`SYSTEM`) que arranca antes del login.
   * *Realidad*: `agents/windows-agent/src/Program.cs` es un ejecutable de consola de usuario estándar. Si se ejecuta como servicio SYSTEM sin modificaciones, **fallará** al intentar abrir ventanas WinForms (`LockCurtainOverlay`) o interactuar con la pantalla debido al aislamiento de Sesión 0 de Windows.
2. **Afirmación de Hook de Teclado de Bajo Nivel**:
   * *Documento*: Afirmó que se interceptan `Alt+Tab`, `Tecla Windows` y `Ctrl+Esc` mediante `WH_KEYBOARD_LL`.
   * *Realidad*: `LockCurtainOverlay.cs` solo tiene `e.Cancel = true` en el evento `FormClosing` de Windows Forms. Cualquier estudiante puede presionar `Alt+Tab` o la tecla `Windows` para saltar a otra aplicación.
3. **Afirmación de Captura DirectX Direct3D 11**:
   * *Documento*: Afirmó captura DirectX a 60 FPS.
   * *Realidad*: `WindowsGraphicsCaptureService.cs` contiene un bucle con un retraso y `byte[64] frameBuffer` simulado.
4. **Capacidad de Video de 40 Equipos**:
   * *Documento*: Menciona capacidad para aulas de 40 clientes.
   * *Realidad*: La prueba de Fase 02.5 auditada en Fase 02.6 verificó 40 conexiones de señalización WebSocket, pero cero tráfico de video RTP real.

---

## 3. COMPONENTES POR ESTADO DE MADUREZ

### 3.1. Estado Sólido (Producción / Verificado Físicamente)
- **Servidor Local Core (NestJS)**: Enrutamiento REST, autenticación JWT, RBAC multi-tenant, persistencia relacional estricta en PostgreSQL 16.
- **Servicio de Descubrimiento LAN (UDP 48500)**: Emisión broadcast periódica multinterfaz con detección dinámica de subredes.
- **Agente Nativo macOS (Swift)**: Descubrimiento UDP, canal WebSocket, captura real ScreenCaptureKit, streaming WebRTC P2P con Chrome, explorador de archivos y gestor de procesos.
- **Consola Docente (React / Vite)**: Mosaico de miniaturas, modal de inspección individual con baja latencia, modal dual de transferencia de archivos y modal de control de procesos.

### 3.2. Estado Parcial (Requiere Refactorización Arquitectónica)
- **Agente Windows (.NET 8)**: La conectividad de red y el protocolo funcionan, pero el motor de captura de video y el telón de bloqueo carecen de enlaces nativos al subsistema Win32/DirectX.
- **Protocolo de Archivos**: Opera por JSON Base64. Es funcional para archivos de tamaño medio (<50 MB), pero requiere migrar a chunks binarios para soporte de archivos grandes (1-2 GB) sin consumo desmedido de memoria heap.

### 3.3. Estado No Implementado (Diseño para Fases Futuras)
- **Arquitectura Dividida de Windows**: Servicio Windows en Sesión 0 + Agente de UI en Sesión 1 comunicados por Named Pipes.
- **Cifrado mTLS y Firma Ed25519 en Paquetes de Red**.
- **Agentes Nativos de Linux y ChromeOS** (actualmente solo esqueletos de código).
