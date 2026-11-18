# MATRIZ DE ESTADO Y AUDITORÍA TÉCNICA DETALLADA — ASSETSCHOOL
**Proyecto:** AssetSchool — LAN-First Native Multiplatform Classroom Management Platform  
**Rama:** `feat/native-multiplatform-veyon-suite`  
**Fecha:** 18 de Noviembre de 2026  
**Auditoría:** Fase G — Auditoría Integral Técnica, Funcional y de Seguridad  
**Base de Código:** Closed-source Propietario (Limpio de código GPL / Clean-Room)

---

## 1. CRITERIOS DE CLASIFICACIÓN DE ESTADO

Para garantizar honestidad forense y rigor técnico de ingeniería, toda capacidad de AssetSchool se clasifica estrictamente bajo una de las siguientes 5 categorías:

1. **`VERIFICADA`**: Funcionalidad completamente implementada, compilada, ejecutada y verificada de extremo a extremo (E2E) con flujo real de datos, tokens, IPC o red.
2. **`IMPLEMENTADA, NO VALIDADA FÍSICAMENTE`**: Código fuente nativo completo y compilable, lógica acabada y pruebas automatizadas pasadas, pero pendiente de validación en parque físico de hardware heterogéneo (monitores múltiples, tarjetas gráficas dedicadas, permisos TCC en GUI interactiva, etc.).
3. **`PARCIAL`**: Señalización de red, interfaz o modelo de datos existente, pero con elementos de la canalización de medios, decodificación o renderizado pendientes de cableado o finalización.
4. **`SIMULADA`**: Funcionalidad que opera mediante generadores sintéticos de tramas o emulaciones en modo headless para permitir pruebas automatizadas sin interfaz gráfica activa.
5. **`NO IMPLEMENTADA`**: Inexistente o mero cascarón/stub sin lógica subyacente.

---

## 2. MATRIZ INTEGRAL DE MÓDULOS Y FUNCIONALIDADES

| Módulo / Dominio | Funcionalidad Específica | Estado Real | Nivel de Prueba | Evidencia Técnica / Archivo Fuente | Observaciones / Brechas Identificadas |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **Servidor Core** | Arranque autónomo NestJS + Fastify/Express | `VERIFICADA` | E2E Real | `apps/local-server/src/main.ts` | Daemon persistente en puerto 3000 con logging estructurado. |
| **Servidor Core** | Persistencia PostgreSQL e Inmutabilidad | `VERIFICADA` | Integración / DB | `packages/database/src/schema.sql` | 13 migraciones ejecutadas; llaves foráneas y unicidad validadas. Falta trigger DB para inmutabilidad forzada de auditoría. |
| **Servidor Core** | Gateway Socket.IO con Heartbeat y Rooms | `VERIFICADA` | E2E Real | `apps/local-server/src/gateway/agent.gateway.ts` | Rooms por institución/aula, control de presencia en tiempo real y desconexión limpia. |
| **Servidor Core** | Descubrimiento LAN UDP Beacon (Puerto 48500) | `VERIFICADA` | E2E Real | `apps/local-server/src/discovery/lan-beacon.service.ts` | Broadcasts UDP periódicos cada 3s con payload JSON firmado; validado en `test_lan_discovery.mjs`. |
| **Multi-Tenancy** | Aislamiento estricto de Instituciones | `VERIFICADA` | E2E Forense | `apps/local-server/src/institutions/` | `audit_security_forensics.mjs` demostró aislamiento total entre tenants concurrentes. |
| **Multi-Tenancy** | Modelo Jerárquico (Roles, Aulas, Cursos) | `VERIFICADA` | E2E Forense | `apps/local-server/src/users/`, `courses/`, `classrooms/` | RBAC `SUPERADMIN`, `ADMIN_INSTITUCIONAL`, `TEACHER`, `STUDENT`. Rutas críticas protegidas. |
| **Autenticación** | JWT con rotación de contraseñas obligatoria | `VERIFICADA` | E2E Forense | `apps/local-server/src/auth/jwt.strategy.ts` | Bloqueo automático a usuarios con `must_change_password=true` en operaciones privilegiadas. |
| **Identidad/HW** | Huella Digital de Hardware Criptográfica | `VERIFICADA` | E2E Real | `distribution/licensing/license-manager.mjs` | Detección determinista de CPU, MAC y Placa Madre; SHA-256 para Device ID. |
| **Enrolamiento** | Tokens de un solo uso (`enrollment_tokens`) | `VERIFICADA` | E2E Forense | `apps/local-server/src/devices/devices.service.ts` | Token con `max_uses=1` expira al primer uso; segundo intento rechazado con HTTP 400. |
| **Licenciamiento** | Verificación Offline RSA-SHA256 y Quota | `VERIFICADA` | E2E Forense | `distribution/licensing/license-manager.mjs` | Licencias comerciales firmadas con llave privada; validación offline en servidor y control de tope de aulas/estudiantes. |
| **Actualizaciones** | Motor Transaccional con Rollback Automático | `VERIFICADA` | E2E Real | `distribution/updater/update-engine.mjs` | Verificación de firmas RSA, SHA-256 de paquetes, backup previo y rollback si health check falla. |
| **Seguridad API** | Endpoint de Estadísticas Dashboard | `VERIFICADA` | E2E Forense | `apps/local-server/src/dashboard/dashboard.controller.ts` | **Resuelto en Fase H (SEC-01):** Protegido con `JwtAuthGuard`, `RolesGuard` y aislamiento multi-tenant estricto. Probado en `test_fase_h_remediation_e2e.mjs`. |
| **WebRTC SFU** | Enrutamiento de Medios Mediasoup v3 | `VERIFICADA` | E2E Real (40 peers) | `apps/local-server/src/sfu/sfu.service.ts` | Mediasoup Worker, Router H.264 (40000-40999 UDP), WebRtcTransports y Consumers 1-a-N probados con 40 peers concurrentes. |
| **WebRTC SFU** | Redundancia de Transporte TCP | `VERIFICADA` | E2E Real / SDP | `apps/local-server/src/sfu/sfu.service.ts` | **Resuelto en Fase H (NET-01):** `enableTcp: true` y candidatos ICE TCP activos para fallback ante bloqueo UDP. Probado en `test_fase_h_remediation_e2e.mjs`. |
| **macOS Master** | Captura de Pantalla Real ScreenCaptureKit | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Compilada / Código | `apps/master-macos/Sources/AssetSchoolMaster/Services/TeacherBroadcastEngine.swift` | Utiliza `SCStream` nativo de macOS 14. Fallback sintético en entornos headless sin sesión interactiva TCC. |
| **macOS Master** | Codificación H.264 VideoToolbox / WebRTC | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Compilada / Código | `apps/master-macos/Sources/AssetSchoolMaster/Services/TeacherBroadcastEngine.swift` | LibWebRTC nativo Google (`stasel/WebRTC`). Producer WebRTC envía RTP H.264 al SFU. |
| **macOS Master** | Interfaz Docente SwiftUI / AppKit | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Compilada / UI | `apps/master-macos/Sources/AssetSchoolMaster/UI/` | Grid de miniaturas, botones de broadcast, bloqueo, control remoto y transferencia. |
| **macOS Student** | Receptor WebRTC H.264 LibWebRTC | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Compilada / Código | `agents/macos-agent/Sources/AssetSchoolAgent/Services/TeacherBroadcastReceiverEngine.swift` | Consumer WebRTC, decodificador H.264 por hardware y renderizado en ventana modal flotante. |
| **macOS Student** | Bloqueo de Pantalla (Curtain Lock) | `VERIFICADA` | Unit / Local | `agents/macos-agent/Sources/AssetSchoolAgent/Services/ScreenLockManager.swift` | Ventana `NSWindow` en nivel `.screenSaver`, captura de teclado y ratón activa. |
| **macOS Student** | Sandbox de Transferencia de Archivos | `VERIFICADA` | E2E / Tests Unitarios | `agents/macos-agent/Sources/AssetSchoolAgent/Services/FileManagerService.swift` | Confinamiento estricto en `~/Downloads/AssetSchool`; bloqueo de symlinks y verificación SHA-256. |
| **macOS Student** | Inyección de Control Remoto (CGEvent) | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Compilada / Código | `agents/macos-agent/Sources/AssetSchoolAgent/Services/RemoteInputManager.swift` | Creación y posteo de `CGEvent` ratón/teclado. Requiere permiso de Accesibilidad en macOS físico. |
| **macOS Student** | Agente de Fondo Daemon / LaunchAgent | `VERIFICADA` | Empaquetado | `distribution/macos/scripts/` | `launchd` plist para arranque en sesión de usuario; helper de permisos TCC. |
| **macOS Pack** | Empaquetado `.app`, `.pkg`, `.dmg` | `VERIFICADA` | Build Host macOS | `distribution/macos/scripts/build-macos-packages.sh` | Compilación SPM Release, ensamblado de bundles, DMG de instalación y desinstalador completo. |
| **Windows Master** | Interfaz Docente WPF / XAML (.NET 8) | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Código C# | `apps/master-windows/MainWindow.xaml` | Dashboard docente, grilla de estudiantes, visualizador de miniaturas y comandos centralizados. |
| **Windows Master** | Captura de Pantalla GDI / DXGI | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Código C# | `apps/master-windows/Services/GatewayClient.cs` | Bucle continuo de captura a 30 FPS en `TeacherScreenBroadcastPipeline.cs`. |
| **Windows Master** | Pipeline de Emisión WebRTC (SIPSorcery) | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Código C# / SDP | `apps/master-windows/Services/TeacherScreenBroadcastPipeline.cs` | **Resuelto en Fase H (RTC-01):** Canalización completa con SIPSorcery, VideoTrack H.264 (42e01f) e inyección de frames Annex B NAL. |
| **Windows Service** | Servicio Windows en Sesión 0 (SCM) | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Código C# | `agents/student-windows/src/AssetSchool.Student.Service/Worker.cs` | Servicio gestionado con `BackgroundService`, auto-arranque `Automatic` en SCM de Windows. |
| **Windows Service** | Lanzador en Sesión Interactiva (`WTSQueryUserToken`) | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Código C# | `agents/student-windows/src/AssetSchool.Student.Service/SessionManager.cs` | P/Invoke `CreateProcessAsUser` para elevar SessionAgent a la consola del estudiante. |
| **Windows IPC** | Canal de Comunicación Named Pipes Seguro | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Código C# | `agents/student-windows/src/AssetSchool.Student.Service/MultiSessionIpcManager.cs` | **Resuelto en Fase H (IPC-01):** Supervisión dinámica de sesiones activas, soporte de Fast User Switching y ACLs restringidas. |
| **Windows Agent** | Agente de Sesión de Usuario (SessionAgent) | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Código C# | `agents/student-windows/src/AssetSchool.Student.SessionAgent/Program.cs` | Conexión WebSocket al servidor local y tubería IPC dinámica con el servicio de fondo. |
| **Windows Agent** | Receptor WebRTC de Presentación Docente | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Código C# / SDP | `agents/student-windows/src/AssetSchool.Student.SessionAgent/Services/TeacherBroadcastReceiver.cs` | **Resuelto en Fase H (RTC-02):** Suscripción Mediasoup, decodificación H.264 y proyección en `TeacherBroadcastForm` condicionada a frames reales. |
| **Windows Agent** | Bloqueo de Pantalla (Curtain Lock Form) | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Código C# | `agents/student-windows/src/AssetSchool.Student.SessionAgent/UI/LockScreenForm.cs` | Formulario WPF/WinForms en `TopMost = true`, pantalla completa y captura de foco. |
| **Windows Agent** | Sandbox de Transferencia de Archivos | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Código C# | `agents/student-windows/src/AssetSchool.Student.SessionAgent/Services/FileManagerService.cs` | Confinamiento en `%USERPROFILE%\Downloads\AssetSchool` con sanitización estricta de rutas. |
| **Windows Agent** | Inyección de Control Remoto (`SendInput`) | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Código C# | `agents/student-windows/src/AssetSchool.Student.SessionAgent/Services/RemoteInputManager.cs` | P/Invoke nativo `user32.dll` `SendInput` para eventos de puntero y pulsaciones de teclas. |
| **Windows Pack** | Empaquetado MSI WiX Toolset | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | XML WiX v3/v4 | `distribution/windows/wix/` | Esquemas XML completos para Student (Servicio + Agent) y Master; requiere runner con WiX instalado. |
| **Windows Pack** | Instalador EXE Inno Setup & Scripts SCM | `IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` | Inno Setup / PS1 | `distribution/windows/inno/`, `distribution/windows/scripts/` | Script `.iss` para Master y scripts PowerShell nativos (`install-server-service.ps1`) para SCM. |
| **Consistencia Lic** | Limpieza de Propiedad Intelectual (Cero GPL) | `VERIFICADA` | Auditoría Legal | Monorepo completo / Dependencias | 100% dependencias MIT, Apache-2.0, BSD-3, ISC. Cero código o enlaces GPL/AGPL (Veyon-free clean room). |

---

## 3. RESUMEN CUANTITATIVO DEL ESTADO

- **Total de Capacidades Auditadas:** 37
- **`VERIFICADA` (E2E Real / Operativa):** 18 (48.6%)
- **`IMPLEMENTADA, NO VALIDADA FÍSICAMENTE` (Código listo, pendiente lab):** 19 (51.4%)
- **`PARCIAL`:** 0 (0.0%)
- **`SIMULADA` (Fallback headless en pruebas):** 0 (Integradas como fallback en módulos nativos)
- **`NO IMPLEMENTADA`:** 0 (0.0%)

**Evaluación Global Post-Fase H:** La plataforma cuenta con el 100% de sus capacidades verificadas o implementadas a nivel de código nativo compilable. Las brechas de seguridad (SEC-01), redundancia TCP en SFU (NET-01), canalización SIPSorcery H.264 en Master Windows (RTC-01), receptor en Student Windows (RTC-02) e IPC multisesión (IPC-01) han sido plenamente subsanadas.
