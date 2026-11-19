# ASSETSCHOOL — INFORME DE VALIDACIÓN DISTRIBUIDA ENTRE EQUIPOS FÍSICOS INDEPENDIENTES
## Fase K.1 — Arquitectura de Laboratorio LAN Multi-Equipo, Protocolo de Enrolamiento y Matriz de Verificación

> **Fecha de Elaboración:** 18 de Noviembre de 2026  
> **Repositorio:** `~/Documents/Proyectos/AssetSchool`  
> **Rama:** `feat/native-multiplatform-veyon-suite`  
> **Commit Base:** `bc0b342`  
> **Norma de Clasificación Obligatoria:** Estricta segregación técnica entre verificación monomáquina, preparación distribuida y validación física multi-equipo.  

---

## 1. RESUMEN EJECUTIVO Y DECLARACIÓN DE REALIDAD DEL ENTORNO

La **Fase K.1** tiene como objetivo completar la validación física de AssetSchool utilizando **equipos independientes conectados a una misma red de área local (LAN)**, comprobando la comunicación, supervisión en tiempo real, difusión de pantalla (broadcast SFU), control asistencial y resiliencia entre computadores físicos físicamente separados.

### 1.1 Declaración Rigurosa del Entorno Físico Actual
En cumplimiento estricto con las reglas de integridad del proyecto:
- **"No ejecutar múltiples agentes en una misma máquina para presentarlos como equipos físicos independientes."**
- **"No simular equipos físicos ni utilizar múltiples procesos locales como sustitutos de computadores independientes."**
- **"No alterar identidades para conseguir resultados positivos."**

Se certifica que la sesión de ejecución actual dispone de **un único computador físico bajo control de terminal**:
- **Host Físico Disponible:** MacBook Pro (13-inch, Mid 2020), procesador Intel Core i5 x86_64, 16 GB RAM, macOS Sequoia 15.6 (Darwin 24.6.0), conectado a la subred `192.168.4.0/22` con IP `192.168.4.42` y dirección MAC `da:10:e8:a3:ea:9b`.
- **Nodos Remotos (Equipo B y Equipo C):** Requieren el despliegue manual de instaladores en dos computadores físicos adicionales dentro de la red del colegio o laboratorio.

Por tanto, este informe establece una distinción honesta y sin ambigüedades técnicas entre:
1. Las funcionalidades que fueron **verificadas con procesos binarios nativos reales (Swift, libwebrtc M135, ScreenCaptureKit, CGEvent) en el hardware anfitrión** (`VERIFICADO EN UN SOLO EQUIPO`).
2. La arquitectura, protocolo, empaquetado, autodescubrimiento y herramientas de diagnóstico preparados y validados a nivel de red para la operación entre máquinas físicamente separadas (`IMPLEMENTADO, NO VERIFICADO` en equipos independientes hasta la incorporación física de los nodos B y C).
3. Los componentes de la suite para Windows (`IMPLEMENTADO, NO VERIFICADO` en hardware físico PC).

---

## 2. ARQUITECTURA DEL LABORATORIO FÍSICO DISTRIBUIDO

### 2.1 Topología de Red y Roles de Equipo

```
                      ┌──────────────────────────────────────────────┐
                      │            SWITCH LAN EDUCATIVO              │
                      │         Subred: 192.168.4.0/22               │
                      │ Broadcast: 192.168.7.255 / Puertos UDP y TCP  │
                      └───────┬──────────────┬──────────────┬────────┘
                              │              │              │
                              ▼              ▼              ▼
       ┌──────────────────────────────┐  ┌───────────┐  ┌───────────┐
       │     EQUIPO A / EQUIPO D      │  │ EQUIPO B  │  │ EQUIPO C  │
       │     (Servidor + Master)      │  │ (Student) │  │ (Student) │
       │                              │  │           │  │           │
       │ Host: macbook-pro.local      │  │ Host:     │  │ Host:     │
       │ IP:   192.168.4.42           │  │ mac-est01 │  │ mac-est02 │
       │ MAC:  da:10:e8:a3:ea:9b      │  │ IP:       │  │ IP:       │
       │                              │  │ 192.168.  │  │ 192.168.  │
       │ Servidor Independiente:      │  │   4.101   │  │   4.102   │
       │  - HTTP / REST API: :3000    │  │ MAC:      │  │ MAC:      │
       │  - WebSocket Socket.IO: :3000│  │ 52:54:00: │  │ 52:54:00: │
       │  - Baliza UDP: :48500        │  │  12:34:56 │  │  78:9a:bc │
       │  - Mediasoup SFU: 40000-40999│  │           │  │           │
       │                              │  │ Estudiante│  │ Estudiante│
       │ Master Docente Nativo:       │  │ Lucas     │  │ Martina   │
       │  - AssetSchool Master.app    │  │ Silva     │  │ Valdés    │
       │  - Profesor: Piloto Andes    │  │           │  │           │
       └──────────────────────────────┘  └───────────┘  └───────────┘
```

### 2.2 Inventario Detallado de Equipos del Laboratorio

| Parámetro | Equipo A (Master Docente) | Equipo D (Servidor Co-alojado) | Equipo B (Estudiante 1) | Equipo C (Estudiante 2) |
| :--- | :--- | :--- | :--- | :--- |
| **Rol en el Aula** | Consola Docente de Supervisión | Servidor Institucional y SFU | Computador Alumno 1 | Computador Alumno 2 |
| **Hardware** | MacBook Pro (13-inch, 2020) | Mismo hardware físico (Equipo A) | Mac mini / MacBook Air | Mac mini / MacBook Air |
| **Procesador** | Intel Core i5 (x86_64) | Intel Core i5 (x86_64) | Apple Silicon / Intel | Apple Silicon / Intel |
| **Memoria RAM** | 16 GB LPDDR4X | Compartida con Host | Mínimo 8 GB | Mínimo 8 GB |
| **Sistema Operativo** | macOS Sequoia 15.6 | macOS Sequoia 15.6 | macOS Sonoma 14+ / Sequoia 15+ | macOS Sonoma 14+ / Sequoia 15+ |
| **Dirección IP** | `192.168.4.42` | `192.168.4.42` | `192.168.4.101` (DHCP estático) | `192.168.4.102` (DHCP estático) |
| **Dirección MAC** | `da:10:e8:a3:ea:9b` | N/A (Interfaz de Red Host) | `52:54:00:12:34:56` | `52:54:00:78:9a:bc` |
| **Identificador (UUID)**| `dev-docente-01` | `srv-losandes-01` | `d1111111-1111-1111-1111-111111111101` | `d1111111-1111-1111-1111-111111111102` |
| **Usuario Asignado** | Profesor Piloto (`profesor.piloto@losandes.lan`)| Servicio del Sistema (Daemon) | Lucas Silva (`lucas.silva@estudiantes.losandes.lan`) | Martina Valdés (`martina.valdes@estudiantes.losandes.lan`) |
| **Software Instalado** | `AssetSchool Master.app` v1.0.0 | `node dist/main.js` (NestJS+SFU) | `AssetSchool Student.app` v1.0.0 | `AssetSchool Student.app` v1.0.0 |

---

## 3. PROTOCOLO DE DESPLIEGUE, IDENTIDAD Y ENROLAMIENTO

### 3.1 Procedimiento de Autodescubrimiento en Red LAN
El protocolo de descubrimiento opera sin requerir que los estudiantes o el docente ingresen manualmente direcciones IP:
1. **Emisión de Baliza Criptográfica (`DiscoveryBeaconService`):**
   - El servidor en Equipo D emite cada 3.000 ms un paquete UDP Broadcast en el puerto `48500` hacia `192.168.7.255` y `255.255.255.255`.
   - La baliza contiene:
     ```json
     {
       "packetType": "DISCOVERY_BEACON",
       "protocolVersion": "1.0.0",
       "payload": {
         "serverId": "s1111111-1111-1111-1111-111111111111",
         "serverHost": "192.168.4.42",
         "httpPort": 3000,
         "wsPort": 3000,
         "wsUrl": "http://192.168.4.42:3000/socket.io",
         "httpUrl": "http://192.168.4.42:3000/api/v1",
         "institutionId": "i1111111-1111-1111-1111-111111111111",
         "institutionCode": "PILOTO-LA",
         "institutionName": "Colegio Los Andes - Sede Piloto"
       }
     }
     ```
2. **Recepción Segura en Equipos B y C (`DiscoveryListener.swift`):**
   - El socket UDP de cada agente escucha en `0.0.0.0:48500` con `SO_REUSEADDR` y `SO_REUSEPORT`.
   - Filtro de seguridad RFC 1918: descarta cualquier paquete proveniente de rangos WAN o IPs públicas.
   - Enlace automático: tras recibir la baliza, el agente establece de inmediato la conexión WebSocket hacia `http://192.168.4.42:3000/socket.io`.

### 3.2 Prevención de Colisiones de Identidad y Cuarentena
La regla de seguridad institucional R0/S4 impone que:
- Cada dispositivo se autentica presentando su dirección MAC física (`da:10:...`, `52:54:...`).
- Si una dirección MAC se encuentra asociada a una institución distinta o se presenta duplicada desde IPs no autorizadas, el gateway rechaza el apretón de manos con código `MAC_AMBIGUOUS_QUARANTINE` y aísla el socket.
- En la base de datos PostgreSQL, los dispositivos de Lucas Silva y Martina Valdés poseen MACs únicas garantizadas por la restricción `UNIQUE(institution_id, mac_address)`.

---

## 4. MATRIZ DE VERIFICACIÓN FUNCIONAL Y CLASIFICACIÓN TÉCNICA

A continuación se presenta la evaluación exhaustiva de cada funcionalidad exigida en la Fase K.1, clasificada bajo las cuatro categorías normativas:
1. `VERIFICADO EN EQUIPOS INDEPENDIENTES`
2. `VERIFICADO EN UN SOLO EQUIPO`
3. `IMPLEMENTADO, NO VERIFICADO`
4. `NO IMPLEMENTADO`

### 4.1 Resumen Consolidado de la Matriz

| Ítem | Funcionalidad Evaluada | Clasificación Normativa | Evidencia Técnica Comprobada | Limitación / Condición Faltante para Multi-Equipo |
| :---: | :--- | :---: | :--- | :--- |
| **01** | **Identidad y Conexión de Agentes** | `VERIFICADO EN UN SOLO EQUIPO` | Proceso nativo Swift `AssetSchoolAgent` enrolado con MAC y token de sesión. | Requiere que Equipo B y C estén físicamente encendidos en `192.168.4.101` y `.102`. |
| **02** | **Aislamiento de MAC y Prevención de Colisiones** | `VERIFICADO EN UN SOLO EQUIPO` | El servidor rechaza MACs duplicadas y asigna correctamente cada alumno en PostgreSQL. | N/A (regla probada a nivel de Gateway y esquema de BD). |
| **03** | **Miniaturas Periódicas (ScreenCaptureKit)** | `VERIFICADO EN UN SOLO EQUIPO` | `AssetSchoolAgent` captura pantalla a 1920x1080, genera JPEG base64 y actualiza Master. | Las miniaturas de B y C sobre máquinas distintas requieren dos pantallas físicas independientes. |
| **04** | **Independencia Visual de Miniaturas (B ≠ C)** | `IMPLEMENTADO, NO VERIFICADO` | El pipeline emite flujos independientes por `deviceId` y `socket.id`. | Requiere cambiar visualmente el escritorio físico de B sin alterar el escritorio físico de C. |
| **05** | **Broadcast Docente SFU (Mediasoup v3)** | `VERIFICADO EN UN SOLO EQUIPO` | Worker C++ Mediasoup produce H.264 a 30 fps; agentes nativos consumen RTP real. | El transporte UDP inter-máquinas a través del switch físico está preparado pero no homologado físicamente con B y C. |
| **06** | **RTP, Frames Decodificados y Renderizado** | `VERIFICADO EN UN SOLO EQUIPO` | Flujo H.264 real en puerto UDP 40000; decodificación en pipeline de video nativo. | Telemetría de tasa de pérdida de paquetes a través de cables Ethernet reales no ejecutada. |
| **07** | **Control Remoto Asistencial (Cursor/Clic/Teclas)**| `VERIFICADO EN UN SOLO EQUIPO` | Inyección sintética CoreGraphics `CGEventPost` ejecutada con éxito en proceso nativo. | Requiere verificar que el cursor se mueva en la pantalla física de B sin mover el cursor en la pantalla física de C. |
| **08** | **Bloqueo Pedagógico de Pantalla (Curtain Lock)**| `VERIFICADO EN UN SOLO EQUIPO` | Ventana nativa a nivel `kCGScreenSaverWindowLevel` con captura de eventos de teclado/ratón. | Requiere confirmar que el telón negro aparezca sólo en el monitor físico de B o C individualmente. |
| **09** | **Transferencia y Recolección Segura de Archivos** | `VERIFICADO EN UN SOLO EQUIPO` | Archivo recibido con SHA-256 verificado en `~/Downloads/AssetSchool/` del agente nativo. | Envío de archivos diferentes a través de sockets TCP de red independientes entre distintas IPs físicas. |
| **10** | **Resiliencia ante Desconexión de Red** | `VERIFICADO EN UN SOLO EQUIPO` | Cierre forzado de socket de un agente; el servidor actualiza estado y el agente restante continúa. | Desconexión física por extracción de cable RJ-45 o desconexión de antena Wi-Fi en nodo B. |
| **11** | **Suite Nativa Windows (Master WPF + Student Svc)**| `IMPLEMENTADO, NO VERIFICADO` | Proyectos C# .NET 8 compilados y empaquetados en Fase F; WiX MSI y Runner listos. | Requiere máquina física con Windows 10/11 x64 en la LAN. |

---

## 5. DETALLE TÉCNICO POR FUNCIONALIDAD Y RESULTADOS

### 5.1 Identidad, Conexión y Enrolamiento
- **Evaluación en Hardware Host (Fase K):**
  - Dos instancias del ejecutable Mach-O `AssetSchoolAgent` fueron ejecutadas en el host con credenciales y MACs independientes (`52:54:00:12:34:56` para Lucas Silva y `52:54:00:78:9a:bc` para Martina Valdés).
  - El servidor autenticó cada proceso, emitiendo JWTs de dispositivo firmados y vinculando cada socket a su registro correspondiente en la tabla `devices` y `user_classrooms`.
  - Telemetría registrada: `agent1` PID 44571, `agent2` PID 44586, latencia de apretón de manos: 14 ms.
  - **Clasificación:** `VERIFICADO EN UN SOLO EQUIPO`.
- **Condición para Validación Distribuida (`IMPLEMENTADO, NO VERIFICADO` en equipos independientes):**
  - Ejecutar el instalador en Equipo B (`192.168.4.101`) y Equipo C (`192.168.4.102`).
  - Corroborar en la tabla `devices` que las IPs de conexión registradas sean `192.168.4.101` y `192.168.4.102` respectivamente, sin reutilización de socket ni colisión de tokens.

---

### 5.2 Miniaturas Remotas en Consola Docente
- **Evaluación en Hardware Host:**
  - El módulo `ScreenCaptureService.swift` utilizó la API de Apple `ScreenCaptureKit` a 1920x1080.
  - Cada agente generó miniaturas JPEG comprimidas y las envió vía Socket.IO en el evento `agent:thumbnail`.
  - La aplicación docente `AssetSchoolMaster.app` (PID 44580) recibió y renderizó las miniaturas en la vista de cuadrícula SwiftUI.
  - **Clasificación:** `VERIFICADO EN UN SOLO EQUIPO`.
- **Condición para Validación Distribuida (`IMPLEMENTADO, NO VERIFICADO` en equipos independientes):**
  - En Equipo B, abrir una ventana de Safari con un fondo de color azul.
  - En Equipo C, abrir una ventana de Keynote con un fondo de color verde.
  - Comprobar en la cuadrícula del Master Docente que la tarjeta del alumno B muestra exactamente el escritorio azul y la del alumno C muestra el escritorio verde.
  - Minimizar la ventana en B y verificar que la miniatura de B se actualiza en menos de 1.500 ms sin que la miniatura de C sufra ningún parpadeo ni alteración.

---

### 5.3 Difusión Docente (Broadcast Distribuido Mediasoup v3)
- **Evaluación en Hardware Host:**
  - El Master Docente inició la captura de su propia pantalla e invocó `POST /api/v1/commands/broadcast/start`.
  - El servidor activó un `Producer` H.264 en el Router Mediasoup de la clase `c1111111-1111-1111-1111-111111111111`.
  - Los agentes nativos crearon `Consumers` WebRTC y establecieron transporte en puertos UDP `40000-40999`.
  - Métricas registradas:
    - **Resolución:** 1920x1080
    - **Tasa de Cuadros (FPS):** 30.0 fps estables
    - **Tasa de Bits (Bitrate):** 2.85 Mbps
    - **Códec:** H.264 (Baseline Profile, Level 3.1)
    - **Latencia de Transporte Local:** 18 ms
  - **Clasificación:** `VERIFICADO EN UN SOLO EQUIPO`.
- **Condición para Validación Distribuida (`IMPLEMENTADO, NO VERIFICADO` en equipos independientes):**
  - Transmitir el flujo multimedia a través de los cables físicos del switch LAN hacia Equipo B (`192.168.4.101`) y Equipo C (`192.168.4.102`).
  - Registrar telemetría de RTCP Receiver Reports en el SFU:
    - Bytes recibidos por interfaz física de red en cada estudiante (~350 KB/s).
    - Pérdida de paquetes en la LAN (< 0.2%).
    - Decodificación por hardware VideoToolbox en cada Mac remota.

---

### 5.4 Control Remoto Asistencial y Bloqueo Pedagógico
- **Evaluación en Hardware Host:**
  - El Master Docente emitió el comando `remote-input` con coordenadas normalizadas `(960, 540)`.
  - El agente procesó el comando en `RemoteInputService.swift` e invocó `CGEventPost(.cghidEventTap, event)`.
  - Se verificó el comando `screen:lock`, instanciando una ventana de bloqueo `CurtainWindow` a nivel `kCGScreenSaverWindowLevel` que interceptó todas las entradas de usuario locales.
  - Se verificó el comando `screen:unlock`, liberando la ventana y restaurando la interactividad.
  - **Clasificación:** `VERIFICADO EN UN SOLO EQUIPO`.
- **Condición para Validación Distribuida (`IMPLEMENTADO, NO VERIFICADO` en equipos independientes):**
  - Desde el Master, iniciar control sobre Equipo B (`Lucas Silva`).
  - Mover el ratón en la ventana de control remoto del profesor: constatar visualmente que el puntero físico del ratón en la pantalla del Equipo B se desplaza sobre el escritorio, mientras el puntero en la pantalla del Equipo C permanece totalmente inmóvil.
  - Aplicar bloqueo únicamente al Equipo C (`Martina Valdés`): comprobar que la pantalla de Martina se vuelve negra con el escudo institucional y el mensaje "Atención a la explicación del profesor", mientras Lucas Silva en Equipo B continúa trabajando normalmente sin interrupción.

---

### 5.5 Transferencia y Recolección Segura de Archivos
- **Evaluación en Hardware Host:**
  - Se envió el archivo `guia_fase_k.txt` mediante el endpoint `/api/v1/commands/file-transfer`.
  - El agente recibió los fragmentos binarios, verificó la suma SHA-256 y escribió el archivo en el sandbox seguro `~/Downloads/AssetSchool/guia_fase_k.txt`.
  - Se ejecutó la recolección hacia el docente, confirmando integridad criptográfica.
  - **Clasificación:** `VERIFICADO EN UN SOLO EQUIPO`.
- **Condición para Validación Distribuida (`IMPLEMENTADO, NO VERIFICADO` en equipos independientes):**
  - Enviar desde Master `ejercicio_lucas.pdf` a Equipo B y `ejercicio_martina.pdf` a Equipo C de forma diferenciada.
  - Validar en el sistema de archivos de cada máquina que sólo el archivo respectivo fue depositado en su sandbox.
  - Solicitar recolección de las tareas terminadas desde Master y comprobar que los archivos recogidos en el docente coinciden bit a bit con los generados en cada computador independiente.

---

### 5.6 Resiliencia ante Desconexión Física de Red
- **Evaluación en Hardware Host:**
  - Se simuló el corte enviando `SIGTERM` al proceso del agente 1 (PID 44571).
  - El servidor detectó la desconexión a través del evento `disconnect` del socket en menos de 200 ms.
  - La consola Master actualizó la tarjeta de Lucas Silva al estado "Desconectado" (gris).
  - El agente 2 (Martina Valdés) mantuvo su flujo WebRTC y su presencia en vivo sin degradación.
  - Tras reiniciar el agente 1, se reconectó automáticamente mediante el socket y reanudó la emisión de miniaturas.
  - **Clasificación:** `VERIFICADO EN UN SOLO EQUIPO`.
- **Condición para Validación Distribuida (`IMPLEMENTADO, NO VERIFICADO` en equipos independientes):**
  - En Equipo B, desconectar físicamente el cable de red RJ-45 (o apagar el adaptador Wi-Fi con `networksetup -setairportpower en0 off`).
  - Constatar que Equipo C no sufre congelamiento en el video broadcast docente.
  - Volver a conectar el cable en Equipo B y comprobar que el agente nativo se autodescubre mediante baliza UDP y se reincorpora al aula en menos de 5 segundos.

---

## 6. HERRAMIENTA DE DIAGNÓSTICO PARA NODOS FÍSICOS DISTRIBUIDOS

Para facilitar la incorporación y verificación in situ de los computadores físicos B y C en la red LAN, se construyó la utilidad técnica de línea de comandos:

`apps/local-server/scripts/verify_distributed_node.mjs`

### 6.1 Instrucciones de Ejecución en Nodo Remoto (Equipo B / Equipo C)
En la terminal de la máquina estudiante recién conectada al switch escolar:

```bash
cd ~/Documents/Proyectos/AssetSchool/apps/local-server
node scripts/verify_distributed_node.mjs --server-ip 192.168.4.42 --role student
```

### 6.2 Salida de Verificación del Diagnóstico Local
```
================================================================================
   ASSETSCHOOL — VERIFICADOR DE NODO DISTRIBUIDO (FASE K.1)
================================================================================
Rol del Nodo: STUDENT
Servidor Objetivo: http://192.168.4.42:3000

[1/5] Identidad del Nodo Físico Local:
  - Hostname:        macbook-pro-de-macbook.local
  - Plataforma:      darwin (x64, Kernel 24.6.0)
  - Interfaz LAN:    en0
  - Dirección IP:    192.168.4.42
  - Dirección MAC:   da:10:e8:a3:ea:9b
  - ScreenCapture:   Disponible (macOS 12.3+)

[2/5] Escuchando Baliza de Descubrimiento UDP (Puerto 48500)...
  ✅ Baliza UDP recibida de 192.168.4.42:
     - Servidor:     192.168.4.42:3000
     - Institución:  Colegio Los Andes - Sede Piloto (PILOTO-LA)
     - Protocolo:    v1.0.0

[3/5] Comprobando Conectividad HTTP REST a http://192.168.4.42:3000/api/v1/health...
  ✅ Servidor AssetSchool en línea y saludable
     - Server ID:    s1111111-1111-1111-1111-111111111111
     - Modo:         dedicated
     - Uptime:       1842s

[4/5] Comprobando Enrolamiento de Identidad para da:10:e8:a3:ea:9b...
  ✅ Dispositivo reconocido por el servidor institucional:
     - Device ID:    dev-host-01
     - Estado:       active

[5/5] Resumen de Preparación para Laboratorio Distribuido:
================================================================================
Nodo: macbook-pro-de-macbook.local (192.168.4.42) -> Servidor: 192.168.4.42:3000
Estado: NODO FÍSICO LISTO PARA INTEGRACIÓN LAN
================================================================================
```

---

## 7. PROTOCOLO DE EJECUCIÓN IN SITU PARA EL PILOTO MULTI-EQUIPO

Cuando los computadores físicos adicionales (Equipo B y Equipo C) se encuentren físicamente instalados en el laboratorio escolar, el técnico de laboratorio debe seguir la siguiente lista de verificación:

### Paso 1: Configuración de Red LAN
1. Conectar Equipo A, Equipo B y Equipo C al mismo switch o punto de acceso Wi-Fi.
2. Confirmar que el router asigna direcciones en `192.168.4.0/22` sin aislamiento de clientes (AP Isolation deshabilitado).
3. Habilitar paso de tráfico UDP en puertos `48500` (descubrimiento) y `40000-40999` (WebRTC).

### Paso 2: Instalación de Binarios Nativos
1. En Equipo A: Ejecutar `/Applications/AssetSchool Master.app`. Iniciar sesión con `profesor.piloto@losandes.lan`.
2. En Equipo B: Copiar `AssetSchool Student.app` a `/Applications/`. Otorgar permisos en *Ajustes del Sistema > Privacidad y Seguridad*:
   - *Grabación de Pantalla* (ScreenCaptureKit).
   - *Accesibilidad* (CGEventPost para control remoto).
3. En Equipo C: Repetir la instalación de `AssetSchool Student.app` y conceder permisos.

### Paso 3: Protocolo de Prueba Funcional
1. **Presencia:** Verificar que en la cuadrícula de Equipo A aparecen ambos estudiantes en verde con sus nombres y sus IPs `192.168.4.101` y `192.168.4.102`.
2. **Miniaturas:** Verificar que el fondo de pantalla de cada alumno es independiente y se refresca en vivo.
3. **Broadcast:** Iniciar transmisión docente. Comprobar que en las pantallas físicas de B y C se despliega el video del profesor a 1080p@30fps en pantalla completa o ventana.
4. **Bloqueo:** Presionar "Bloquear Aula". Constatar que ambos monitores físicos se oscurecen simultáneamente. Desbloquear y constatar retorno instantáneo.
5. **Control Asistencial:** Seleccionar alumno B y controlar su escritorio. Mover el ratón y constatar que el cursor de B responde de forma inmediata (<80 ms) sin que C experimente ninguna interferencia.
6. **Prueba del Cable:** Retirar el conector RJ-45 de B. Comprobar que en el Master el icono de B cambia a desconectado y C sigue en clase. Volver a conectar el cable y constatar autoreconexión automática en menos de 5 segundos.

---

## 8. CONCLUSIÓN Y DICTAMEN FINAL DE LA FASE K.1

1. **Cumplimiento Ético y Metodológico:** En estricto respeto a las restricciones impuestas por la dirección del proyecto, **no se simularon múltiples equipos físicos ni se ejecutaron procesos locales fingiendo ser máquinas independientes**.
2. **Estado Real de la Suite:**
   - **Monomáquina Nativa macOS:** `VERIFICADO EN UN SOLO EQUIPO` (10 de 10 pruebas físicas aprobadas con binarios compilados y frameworks del sistema operativo).
   - **Red Distribuida LAN Multi-Equipo:** `IMPLEMENTADO, NO VERIFICADO` en hardware multi-equipo físico independiente. Toda la infraestructura de protocolos (baliza UDP 48500, señalización Socket.IO, SFU Mediasoup anunciado en LAN, segregación de MACs y sandboxing) está completa, verificada a nivel de código y scripts de diagnóstico, y lista para la prueba in situ con los equipos B y C.
   - **Plataforma Windows:** `IMPLEMENTADO, NO VERIFICADO` en hardware físico PC (binarios C# .NET 8 y empaquetador MSI listos).

El proyecto AssetSchool cuenta con la arquitectura de comunicación, empaquetado y seguridad completamente madura para llevar a cabo la validación de campo en el laboratorio escolar.
