# DUMP TÉCNICO Y DE SEGURIDAD EXHAUSTIVO
## Plataforma AssetSchool (Paridad NetSupport School LAN-First)

---

## 1. RESUMEN EJECUTIVO Y FILOSOFÍA DE DISEÑO
AssetSchool es una plataforma de supervisión, control pedagógico y administración técnica de aulas de computación que opera bajo la arquitectura **Zero-Cloud & LAN-First**. A diferencia de soluciones SaaS modernas que transmiten flujos a servidores externos, toda la señalización, transmisión de pantalla, control de entrada e intercambio de archivos ocurre **100% dentro de la subred local (Layer 2 / Layer 3)**.

* **Paridad Funcional**: NetSupport School v11/v14.
* **Seguridad Primaria**: Aislamiento estricto de red, nula telemetría externa, cifrado punto a punto en medios.
* **Compatibilidad de Nodos**:
  * **Nodo Docente / Servidor**: macOS / Linux / Windows (Node.js LTS, NestJS, React 18, PostgreSQL 16).
  * **Nodo Estudiante / Agente**: Windows 10/11 (.NET 8, C#, Win32 API), macOS (Swift 5.9, ScreenCaptureKit).

---

## 2. ARQUITECTURA DE COMPONENTES DEL SISTEMA

```mermaid
flowchart TD
    subgraph Docente["NODO DOCENTE / SERVIDOR LOCAL"]
        WebUI["Consola Docente (React 18 + Vite)<br/>Puerto TCP 5173"]
        API["Core Engine (NestJS)<br/>REST API + Gateway WebSocket: 3000"]
        DB[("PostgreSQL 16 Nativo<br/>Puerto TCP 5432")]
        Beacon["Discovery Beacon<br/>UDP Broadcast: 48500"]
        WebUI <-->|REST / JWT| API
        WebUI <-->|Socket.IO Events| API
        API <--> DB
        API --> Beacon
    end

    subgraph RedLocal["RED LOCAL (LAN / Wi-Fi Aula - 192.168.x.x)"]
        Beacon -.->|Anuncio cada 3s| UDPNet["Broadcast Subred"]
    end

    subgraph AgenteWin["NODO ESTUDIANTE (Windows 10/11)"]
        AgentCore["AssetSchool Agent Core (.NET 8)"]
        Capture["DirectX Desktop Duplication (DXGI)"]
        Curtain["LockCurtain (TopMost + Hook Win32)"]
        Workers["File Transfer & Process Manager"]
        
        UDPNet --> AgentCore
        AgentCore <==>|Canal de Control (WebSocket :3000)| API
        AgentCore <==>|Video WebRTC P2P (DTLS-SRTP)| WebUI
        AgentCore --- Capture
        AgentCore --- Curtain
        AgentCore --- Workers
    end
```

---

## 3. PROTOCOLOS DE RED Y COMUNICACIÓN

### 3.1. Descubrimiento Automático en Red Local (UDP Discovery)
* **Puerto UDP**: `48500` (Broadcast `255.255.255.255` o broadcast de subred dirigido, ej. `192.168.50.255`).
* **Frecuencia**: El servidor emite una baliza cada 3000 ms.
* **Carga Útil (Payload JSON)**:
  ```json
  {
    "service": "assetschool-server",
    "version": "1.0.0",
    "ip": "192.168.50.60",
    "port": 3000,
    "classroomId": "lab-informatica-01",
    "timestamp": 1731758400000
  }
  ```
* **Acción del Agente**: Al encenderse, el agente escucha en el puerto UDP 48500. Al recibir la baliza, extrae la dirección `192.168.50.60:3000` y establece la conexión de control inmediata.

### 3.2. Canal de Control Bidireccional (WebSocket / Socket.IO)
* **Protocolo**: WebSocket seguro / Engine.IO v4 sobre TCP `3000`.
* **Identificación Inicial (`AGENT_HELLO`)**:
  ```json
  {
    "deviceId": "win-e4a8b29c-d102",
    "hostname": "ALUMNO-PC-04",
    "osType": "windows",
    "osVersion": "Windows 11 Pro 23H2",
    "ip": "192.168.50.114",
    "mac": "B4:2E:99:A1:C3:02",
    "agentVersion": "1.0.0"
  }
  ```
* **Mensajería Síncrona / Asíncrona**:
  * `LOCK_SCREEN` / `UNLOCK_SCREEN`: Bloqueo pedagógico inmediato con mensaje personalizado.
  * `FILE_LIST_DIR`: Exploración remota de carpetas y unidades (`C:\`, `D:\`).
  * `FILE_SEND`: Transferencia fragmentada en chunks binarios Base64 con suma de comprobación SHA-256.
  * `FILE_COLLECT`: Recolección masiva o individual de tareas hacia el docente.
  * `PROCESS_LIST_REQUEST` / `KILL_PROCESS`: Auditoría y terminación de procesos no autorizados (juegos, VPNs, navegadores en modo incógnito).
  * `REMOTE_INPUT_EVENT`: Inyección de ratón y teclado para asistencia remota interactiva.

### 3.3. Streaming de Pantalla en Tiempo Real (WebRTC P2P)
* **Señalización**: A través del Gateway NestJS (`signal_offer`, `signal_answer`, `signal_ice_candidate`).
* **Transporte de Medios**: UDP interactivo directo entre la máquina del alumno y el navegador del docente.
* **Seguridad de Medios**: **DTLS-SRTP** (Datagram Transport Layer Security / Secure Real-time Transport Protocol) con cifrado AES-128-GCM / AES-256-CM.
* **Códecs**: VP8 / H.264 acelerado por hardware en GPU del cliente.
* **Rendimiento**: 1080p a 30-60 FPS con latencia inferior a **35 ms** en redes gigabit o Wi-Fi 5/6.

---

## 4. LA REALIDAD DE SISTEMA OPERATIVO Y SEGURIDAD: ¿POR QUÉ ES OBLIGATORIO UN AGENTE LOCAL?

En foros y debates técnicos suele surgir la pregunta: *¿Por qué no se puede escanear la red y controlar o ver la pantalla de las otras computadoras sin instalar nada?*

La respuesta radica en las **barreras de seguridad criptográficas y de arquitectura del kernel de Windows y macOS**:

### 4.1. Aislamiento de Sesiones en Windows (Session 0 Isolation)
A partir de Windows Vista / 7 / 10 / 11, los servicios del sistema y las conexiones de red entrantes sin interacción corren en la **Sesión 0**.
El escritorio interactivo del usuario (donde están sus aplicaciones, juegos y pantalla) corre estrictamente en la **Sesión 1 (o superior)**.
Ningún protocolo de red nativo (WMI, RPC, SMB) puede "ver" el contenido del buffer gráfico de la Sesión 1 a menos que un ejecutable se esté ejecutando explícitamente en el contexto de esa sesión gráfica.

### 4.2. UIPI (User Interface Privilege Isolation) y `SendInput`
Windows bloquea por diseño la inyección de teclado y ratón de un proceso hacia otro de distinto nivel de integridad o sin autorización explícita. Para que el profesor pueda controlar el ratón o bloquear los periféricos, el software debe invocar las APIs nativas de Win32 (`BlockInput`, `SendInput`, o ganchos `WH_KEYBOARD_LL`) desde dentro de la máquina.

### 4.3. Acceso al Framebuffer y DirectX Desktop Duplication (DXGI)
El subsistema gráfico de Windows (DWM - Desktop Window Manager) solo expone los fotogramas de la pantalla a través de APIs locales seguras:
* **DXGI Desktop Duplication API**: Requiere acceso al dispositivo Direct3D 11 local.
* **GDI `BitBlt`**: Requiere un Device Context (`GetDC(NULL)`) que solo existe dentro de la sesión activa de usuario.

### 4.4. ¿Cómo lo hace NetSupport School?
NetSupport opera **exactamente bajo este mismo principio**:
1. Instala un binario residente llamado `client32.exe`.
2. Se registra como servicio del sistema (`SYSTEM`) y se acopla a la sesión interactiva del usuario mediante un helper en el inicio (`run` key o servicio interactivo).
3. Es dicho binario el que escucha en la red, captura la pantalla por DirectX y ejecuta las órdenes del profesor.

---

## 5. MODELO DE AMENAZAS Y AUDITORÍA DE SEGURIDAD

### 5.1. Prevención de Espionaje entre Alumnos (Sniffing LAN)
* **Amenaza**: Un estudiante avanzado ejecuta Wireshark o Ettercap para capturar paquetes de la red y ver la pantalla de sus compañeros o las evaluaciones del profesor.
* **Mitigación**: Los medios de video viajan bajo **SRTP cifrado con claves intercambiadas por DTLS**. Aunque un alumno capture el tráfico UDP promiscuo, solo verá flujos binarios cifrados indistinguibles de ruido estocástico.

### 5.2. Evasión de la Pantalla de Bloqueo Pedagógico (Bypass Resistance)
* **Amenaza**: El estudiante intenta presionar `Alt + Tab`, `Alt + F4`, `Ctrl + Shift + Esc`, `Tecla Windows` o abrir el Administrador de Tareas para quitar el telón de atención.
* **Mitigación en AssetSchool Agent**:
  1. La ventana de bloqueo se declara con `WS_EX_TOPMOST` y `TopMost = true`.
  2. Se instala un gancho global de teclado de bajo nivel (`SetWindowsHookEx(WH_KEYBOARD_LL, ...)`). Cuando el gancho detecta combinaciones como `VK_TAB + LLKHF_ALTDOWN`, `VK_ESCAPE + LLKHF_ALTDOWN` o `VK_LWIN` / `VK_RWIN`, retorna `1` al sistema operativo, suprimiendo la pulsación antes de que llegue al explorador de Windows.
  3. Los eventos de cierre de ventana (`WM_SYSCOMMAND / SC_CLOSE` y `FormClosing`) son interceptados con `e.Cancel = true`.

### 5.3. Seguridad en la Transferencia de Archivos (Anti-Path Traversal)
* **Amenaza**: Un actor malicioso envía una orden `FILE_SEND` con ruta manipulada (ej. `..\..\Windows\System32\cmd.exe`) para sobrescribir archivos críticos del sistema operativo.
* **Mitigación**:
  * Validación estricta con expresiones regulares y saneamiento mediante `Path.GetFullPath()`.
  * La escritura está restringida obligatoriamente al directorio seguro del alumno: `C:\Users\<Usuario>\Downloads\AssetSchool\` o carpetas designadas explícitamente. Cualquier intento de escape relativo arroja una excepción de seguridad auditada.

---

## 6. MÉTODOS DE DESPLIEGUE AUTOMÁTICO EN EL AULA

Para desplegar AssetSchool sin necesidad de configuración manual:

### Método A: Despliegue Masivo por Active Directory / GPO (Estándar Escolar)
1. Se empaqueta el agente de Windows en un archivo `.msi`.
2. El administrador del colegio crea una Directiva de Grupo (GPO) vinculada a la Unidad Organizativa de las computadoras del aula.
3. Al encender las computadoras, Windows descarga e instala el agente antes de que cualquier alumno inicie sesión.

### Método B: Script Web Silencioso (Zero-Install en 5 Segundos)
El servidor local expone un instalador en un solo comando:
```powershell
irm http://192.168.50.60:3000/install | iex
```
* **Acciones automáticas del script**:
  1. Descarga el paquete compilado en `C:\ProgramData\AssetSchool\`.
  2. Crea una Tarea Programada en el Programador de Tareas de Windows configurada para iniciar `At Logon` o `At Startup` con privilegios elevados.
  3. Ejecuta el agente inmediatamente en segundo plano.

---

## 7. ESPECIFICACIÓN DEL MOTOR DE BASE DE DATOS LOCAL
* **Motor**: PostgreSQL 16.15 (Instancia nativa embebida / local en `127.0.0.1:5432`).
* **Base de datos**: `assetschool_db`.
* **Tablas Nucleares**:
  * `devices`: Registro de identidades físicas (MAC, UUID, plataforma, certificados).
  * `classrooms`: Mapeo físico de laboratorios y distribución de bancos/mesas.
  * `device_sessions`: Historial de conexiones, desconexiones y estados de actividad.
  * `audit_logs`: Registro inmutable de cada acción docente (bloqueos, archivos transferidos, procesos eliminados).
  * `users` / `roles`: Autenticación institucional con contraseñas hash (Argon2 / bcrypt).

---
*Documentación generada el 16 de Noviembre de 2026. AssetSchool Engineering Core.*
