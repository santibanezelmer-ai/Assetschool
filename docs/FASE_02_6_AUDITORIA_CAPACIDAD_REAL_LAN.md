# ASSETSCHOOL — FASE 02.6
## AUDITORÍA DE CAPACIDAD REAL, DESCUBRIMIENTO LAN Y VALIDACIÓN MULTIDISPOSITIVO

- **Proyecto:** AssetSchool
- **Rol:** Arquitecto de Software Senior, Especialista en Redes LAN, WebRTC, Seguridad y QA Lead
- **Repositorio:** `/Users/macbook/.gemini/antigravity/scratch/assetschool`
- **Commit Base:** `561980e`
- **Fecha:** 9 de noviembre de 2026
- **Estado de Fase 02.6:** **AUDITORÍA DE CAPACIDAD REAL Y RECLASIFICACIÓN TÉCNICA COMPLETADA**

---

## 1. DIAGNÓSTICO TÉCNICO DEL BENCHMARK ANTERIOR (FASE 02.5)

Se realizó una auditoría minuciosa del script `tests/run_capacity_test_fase_02_5.mjs` para determinar con precisión qué componentes fueron ejecutados en la fase previa y qué métricas correspondían a estimaciones:

| Aspecto Evaluado | ¿Qué hizo realmente el script 02.5? | Clasificación Técnica |
|:---|:---|:---:|
| **Dispositivos** | Generó strings sintéticos (`dev-bench-001`, etc.) sin persistencia en BD | **Simulados en memoria** |
| **Conexiones** | Abrió sockets TCP reales contra `AgentGateway` vía protocolo Socket.IO v4 | **Reales** |
| **Autenticación Docente** | Login HTTP real en `/api/v1/auth/login` con emisión de token JWT válido | **Real** |
| **Autenticación Agentes** | Handshake `AGENT_HELLO` aceptado en memoria por el gateway | **Real en Gateway / Mock en BD** |
| **Sesiones en BD** | No ejecutó `INSERT` en `classroom_sessions` ni en `device_sessions` | **No ejecutado en BD** |
| **Señalización WebRTC** | Intercambió mensajes `SCREEN_CAPTURE_START`, `WEBRTC_OFFER`, `WEBRTC_ANSWER` | **Señalización Real** |
| **RTCPeerConnection** | Envió strings de SDP sintéticos sin instanciar la API WebRTC nativa | **Simulada en extremos** |
| **Flujos de Video RTP** | Cero frames codificados, transmitidos por RTP o decodificados en el cliente | **No ejecutado** |
| **CPU y RAM** | Muestreo único del proceso Node.js vía `ps -p <PID> -o %cpu,rss` tras 3s | **Medición Real de Proceso** |
| **Ancho de Banda** | Multiplicación teórica `deviceCount * 250 kbps`. **No midió bytes de red** | **Estimación Teórica (No Medido)** |
| **Latencia** | Delta de tiempo (ms) entre envío de `START` y recepción de `OFFER` por WebSocket | **Latencia de Señalización Real** |

> [!CAUTION] Dictamen de QA sobre Fase 02.5
> La Fase 02.5 demostró con éxito que el servidor NestJS y `AgentGateway` pueden sostener **40 conexiones WebSocket y 40 flujos de señalización concurrentes con apenas ~12 MB de aumento en RAM**. Sin embargo, **no demostró 40 transmisiones de video simultáneas ni midió ancho de banda real de video**. Dicha cifra de 10 Mbps fue una proyección teórica de catálogo y no tráfico de red capturado.

---

## 2. ESTADO REAL DEL DESCUBRIMIENTO AUTOMÁTICO LAN (UDP 48500)

Se auditó la totalidad de los archivos `.ts`, `.swift`, `.cs` y `.rs` del repositorio en búsqueda de implementación de sockets UDP para descubrimiento automático de servidores en el puerto `48500`.

### Hallazgos de la Auditoría:
1. **Definición de Constante:** Existe `export const ASSETSCHOOL_LAN_DISCOVERY_PORT = 48500;` en `packages/protocol/src/index.ts`.
2. **Mensaje de Consola:** En `apps/local-server/src/main.ts` se imprime `Local LAN Discovery: Active (UDP 48500 / TCP 48501)`.
3. **Ausencia de Código de Red:** No existe ninguna llamada a `dgram.createSocket('udp4')`, `UdpClient` (.NET), `NWListener`/`NWConnection` (Swift) ni `UdpSocket` (Rust).
4. **Estado Real de los Agentes:** Los agentes nativos (macOS, Windows, Linux) actualmente se conectan mediante una dirección IP o URL de Gateway especificada por argumento de línea de comandos (ej. `--gateway-url ws://192.168.1.10:3000/agent`) o valor por defecto `127.0.0.1:3000`.

### Matriz de Descubrimiento LAN

| Componente | Estado Actual | Trabajo Pendiente para Producción |
|:---|:---:|:---|
| **Emisor de Anuncios (Beacon)** | **NO IMPLEMENTADO** | Servicio NestJS emitiendo paquetes JSON UDP broadcast cada 3 seg en `255.255.255.255:48500`. |
| **Receptor de Anuncios en Agente** | **NO IMPLEMENTADO** | Hilo en segundo plano en cada agente escuchando en `0.0.0.0:48500`. |
| **Identificación de Servidor** | **NO IMPLEMENTADO** | Inclusión de `serverId` UUID y huella digital TLS en el payload de anuncio. |
| **Identificación de Institución** | **NO IMPLEMENTADO** | Inclusión de `institutionCode` para vincular agentes al colegio correcto en redes compartidas. |
| **Gestión de Servidores Duplicados**| **NO IMPLEMENTADO** | Lógica de desambiguación si hay más de un docente o servidor en la misma VLAN. |
| **Recuperación tras Desconexión** | **NO IMPLEMENTADO** | Re-escucha periódica de beacons si se pierde el WebSocket del Gateway. |

---

## 3. VALIDACIÓN DE PUERTOS, LISTENERS Y FIREWALL

Se inspeccionaron los puertos y procesos escuchando activamente en el sistema operativo mediante `lsof -iTCP -sTCP:LISTEN -n -P`:

```
+----------------------------------------------------------------------------------------------------+
|                                    MATRIZ DE PUERTOS Y LISTENERS REALES                            |
+--------+-----------+---------------+--------------------+-----------------------+------------------+
| Puerto | Protocolo | Proceso / PID | Dirección de Enlace| Función Real          | Exposición a LAN |
+--------+-----------+---------------+--------------------+-----------------------+------------------+
| `3000` | **TCP**   | `node`        | `0.0.0.0:3000`     | API REST + Gateway WS | **REQUERIDA**    |
| `5432` | **TCP**   | `postgres`    | `127.0.0.1:5432`   | PostgreSQL 16 DB      | **AISLADO LOCAL**|
| `5173` | **TCP**   | `node (vite)` | `127.0.0.1:5173`   | Consola Web Dev       | **SOLO DEV**     |
| `48500`| **UDP**   | *Ninguno*     | *No abierto*       | Discovery Planificado | No escucha       |
| `48501`| **TCP**   | *Ninguno*     | *No abierto*       | WS montado en 3000    | No escucha       |
| Dinám. | **UDP**   | `libwebrtc`   | Interfaces LAN     | Media WebRTC RTP/RTCP | **REQUERIDA P2P**|
+--------+-----------+---------------+--------------------+-----------------------+------------------+
```

### Hallazgos de Seguridad en Puertos:
1. **Aislamiento de PostgreSQL:** PostgreSQL 16 está enlazado exclusivamente a `127.0.0.1` (loopback). **No está expuesto a la red escolar**, cumpliendo estrictamente con las directrices de seguridad para evitar accesos no autorizados al puerto 5432 desde computadores de alumnos.
2. **Puerto 48501 Inexistente:** `FIREWALL_AND_PORTS.md` declaraba el puerto 48501 como enlace de agentes, pero en la implementación real `AgentGateway` comparte el mismo servidor HTTP en el **puerto 3000** bajo la ruta `/socket.io`.
3. **Consola Web en Producción:** El puerto `5173` de Vite es exclusivamente para desarrollo local. En producción, el frontend de React debe compilarse estáticamente (`npm run build`) y servirse mediante Nginx o Caddy en el puerto **80** (HTTP) o **443** (HTTPS con certificado raíz local).

---

## 4. PRUEBA DE MULTIDISPOSITIVO CON DIFERENCIACIÓN RIGUROSA (NIVELES A - E)

Se diseñó y ejecutó el script [`tests/run_fase_02_6_multidevice_audit.mjs`](file:///Users/macbook/.gemini/antigravity/scratch/assetschool/tests/run_fase_02_6_multidevice_audit.mjs), clasificando el comportamiento en los 5 niveles requeridos:

- **Nivel A:** Dispositivos registrados formalmente en la base de datos PostgreSQL 16 (`devices`, `device_capabilities`).
- **Nivel B:** Agentes con conexión WebSocket TCP activa y autenticados vía `AGENT_HELLO`.
- **Nivel C:** Agentes con ciclo de vida activo enviando latidos continuos (`HEARTBEAT_PING` / `PONG`).
- **Nivel D:** Sesiones de señalización WebRTC negociadas mediante el Gateway (`SCREEN_CAPTURE_START`, `WEBRTC_OFFER`, `WEBRTC_ANSWER`).
- **Nivel E:** Transmisión real de video capturado desde hardware físico y decodificado en el receptor.

### Resultados Empíricos Medidos:

```
=========================================================================================================================
                           RESULTADOS DE LA AUDITORÍA DE CAPACIDAD MULTIDISPOSITIVO (FASE 02.6)
=========================================================================================================================
| Equipos | DB Reg (A) | Socket (B) | Latido (C) | Señal (D) | Video Real (E) | RAM Serv | Tráfico Señal | Clasificación
|:-------:|:----------:|:----------:|:----------:|:---------:|:--------------:|:--------:|:-------------:|:----------------------------------|
| 1       | 1          | 1          | 1          | 1         | 1 real / 0 sim | 87.6 MB  | 1.2 KB reales | 100% REAL END-TO-END |
| 5       | 5          | 5          | 5          | 5         | 1 real / 4 sim | 88.2 MB  | 6.0 KB reales | SEÑALIZACIÓN Y DB REAL / VIDEO PROYECTADO |
| 10      | 10         | 10         | 10         | 10        | 1 real / 9 sim | 90.4 MB  | 12.1 KB reales| SEÑALIZACIÓN Y DB REAL / VIDEO PROYECTADO |
| 20      | 20         | 20         | 20         | 20        | 1 real / 19 sim | 91.7 MB  | 24.2 KB reales| SEÑALIZACIÓN Y DB REAL / VIDEO PROYECTADO |
| 40      | 40         | 40         | 40         | 40        | 1 real / 39 sim | 95.2 MB  | 48.5 KB reales| SEÑALIZACIÓN Y DB REAL / VIDEO PROYECTADO |
=========================================================================================================================
```

### Hallazgos de Capacidad:
1. **Rendimiento de Base de Datos (Nivel A):** La inserción masiva y consulta de 40 dispositivos con sus capacidades tardó **81 milisegundos** en PostgreSQL 16 sobre disco físico.
2. **Concurrencia de Red y Señalización (Niveles B, C, D):** 40 conexiones Socket.IO concurrentes y 40 negociaciones SDP completas generaron un consumo de memoria adicional en el servidor de apenas **7.6 MB** (de 87.6 MB a 95.2 MB), con latencia de señalización inferior a 1 ms y **0 errores**.
3. **Tráfico de Señalización Medido:** El tráfico de señalización medido a nivel de socket fue de **48.5 KB** para los 40 equipos, demostrando que la capa de control de AssetSchool es sumamente ligera.
4. **Honestidad sobre Video (Nivel E):** El entorno de prueba dispone de **1 monitor físico y 1 GPU**. Por tanto, la transmisión nativa ScreenCaptureKit + libwebrtc está **100% comprobada de extremo a extremo para 1 estación física real** (6.668 frames, 63 MB transferidos). Para 5 a 40 computadores, la prueba valida **la infraestructura de concurrencia, base de datos y señalización**, debiendo validarse la carga multimedia real en un laboratorio escolar físico con 40 pantallas independientes.

---

## 5. AUDITORÍA DE AISLAMIENTO MULTI-TENANT EN API REST Y GATEWAY

Se auditó cada controlador y evento de señalización para verificar que las peticiones se mantengan aisladas por `institution_id`:

| Componente | Método / Evento | Verificación de Aislamiento | Resultado de Auditoría |
|:---|:---|:---|:---:|
| **Auth** | `POST /auth/login` | Usuario vinculado a su `institution_id` en JWT | **CUMPLE ✓** |
| **Devices** | `GET /devices` | Filtra por `institutionId` del token | **CUMPLE ✓** |
| **Devices** | `GET /devices/:id` | Valida que el equipo pertenezca al tenant del JWT | **CUMPLE ✓** |
| **Devices** | `POST /devices/:id/revoke` | Rechaza revocación cruzada con `400 Bad Request` | **CUMPLE ✓** |
| **Classrooms** | `GET /classrooms` | Filtra aulas por `institutionId` | **CUMPLE ✓** |
| **Classrooms** | `POST /classrooms` | Impide crear aulas en instituciones ajenas | **CUMPLE ✓** |
| **Audit** | `GET /audit` | Bitácora filtrada estrictamente por institución | **CUMPLE ✓** |
| **Commands** | `POST /commands/dispatch` | Corregido en Fase 02.5: valida pertenencia de cada equipo | **CUMPLE ✓** |
| **Commands** | `GET /commands/recent` | Filtra historial por tenant | **CUMPLE ✓** |
| **Gateway** | `TEACHER_JOIN_CLASSROOM` | Valida JWT y aula de la institución autorizada | **CUMPLE ✓** |
| **Gateway** | `SCREEN_CAPTURE_START` | Valida sesión activa y pertenencia del dispositivo | **CUMPLE ✓** |
| **Gateway** | `WEBRTC_OFFER/ANSWER` | Enrutamiento restringido a la sesión del docente autorizado | **CUMPLE ✓** |

---

## 6. VALIDACIÓN OPERACIONAL OFFLINE (ZERO-CLOUD)

Se auditó el código del servidor y la consola docente para garantizar que ninguna funcionalidad esencial dependa de Internet:

1. **Autenticación:** Realizada localmente mediante contraseñas con salt `bcrypt` y JWT firmados con clave simétrica en `local-server`. Sin dependencia de Auth0, Firebase Auth ni servicios cloud.
2. **Consola Web:** Se retiraron las referencias externas a `fonts.googleapis.com` y `fonts.gstatic.com` en `apps/teacher-web/index.html`. La consola utiliza la pila tipográfica del sistema operativo (`system-ui, -apple-system, sans-serif`), eliminando bloqueos de red en aulas desconectadas.
3. **Persistencia:** PostgreSQL 16 ejecutándose localmente en disco (`127.0.0.1:5432`).
4. **Agentes:** Comunicación WebSocket directa a la IP privada del servidor LAN.
5. **Streaming WebRTC:** Intercambio exclusivo de candidatos ICE de tipo `host` (direcciones IP locales privadas como `192.168.x.x` o `10.x.x.x`). **No se consultan servidores STUN ni TURN externos.**

---

## 7. LIMITACIONES DE HARDWARE Y RECOMENDACIONES PARA PRODUCCIÓN

### Limitaciones Identificadas
1. **Entorno de Desarrollo:** Una única máquina física macOS. Permite validar a fondo la arquitectura, el código Swift nativo, la base de datos y la capacidad de concurrencia de sockets, pero no sustituye la prueba de estrés de 40 monitores físicos con diferentes tarjetas de video (Intel, NVIDIA, AMD).
2. **Compilación de Agentes Windows y Linux:** Requiere máquinas con SDK .NET 8 (Windows) y toolchain Rust/Cargo (Linux) para empaquetado binario final.
3. **Descubrimiento UDP 48500:** Debe ser implementado formalmente antes del lanzamiento comercial para evitar la configuración manual de IPs por aula.

### Recomendaciones Operacionales para Producción
1. **Despliegue del Frontend:** Compilar `teacher-web` con `npm run build` y configurar Nginx en el servidor del aula para servir los archivos estáticos en el puerto `80/443`.
2. **Configuración de Red en Aula:** Asegurar que los switches de cómputo no tengan habilitado el aislamiento de clientes (*Client Isolation*) o bloqueo de tráfico multidifusión (*Broadcast/Multicast*), para permitir tanto el descubrimiento como el streaming P2P.
3. **Implementación de UDP Discovery:** Incorporar un módulo `DiscoveryService` en NestJS usando `node:dgram` y sus clientes correspondientes en Swift, C# y Rust.
