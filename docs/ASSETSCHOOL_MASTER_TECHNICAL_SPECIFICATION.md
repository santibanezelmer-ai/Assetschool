# ASSETSCHOOL — ESPECIFICACIÓN TÉCNICA MAESTRA (MASTER SPECIFICATION)
## Arquitectura de Sistema, Plataformas Nativas y Ciclo de Vida (Fase 02.8)

- **Documento:** `docs/ASSETSCHOOL_MASTER_TECHNICAL_SPECIFICATION.md`
- **Versión:** 1.0.0-PROD-SPEC
- **Clasificación:** Confidencial / Arquitectura de Ingeniería de Grado Producción
- **Autor:** Arquitecto de Software Principal, Especialista en Sistemas Operativos, WebRTC y Ciberseguridad LAN

---

## 1. INTRODUCCIÓN Y PRINCIPIOS DE ARQUITECTURA

AssetSchool está diseñado como una plataforma de gestión de aulas informáticas **LAN-First y Zero-Cloud**. Para garantizar privacidad, soberanía de datos y baja latencia, ningún flujo de datos abandona la red local de la institución.

### Principios Rectores:
1. **Zero-Cloud por Diseño**: Ningún componente externo ni servidor centralizado en Internet es requerido para el funcionamiento completo (descubrimiento, streaming, control, archivos).
2. **Respeto a las Barreras de Seguridad del SO**: Ningún módulo debe eludir artificialmente las políticas de seguridad del kernel del sistema operativo; las funciones de supervisión deben interactuar a través de las APIs documentadas y con los permisos correspondientes.
3. **Aislamiento Multi-Tenant Estricto**: Todo paquete, sesión y registro de auditoría está vinculado criptográficamente a un identificador único de institución (`institutionId`).
4. **Resiliencia ante Fallos de Red**: Reconexión exponencial, estados degradados seguros y protección contra caídas por ráfagas de paquetes UDP.

---

## 2. ARQUITECTURA DETALLADA DEL NODO WINDOWS (DOS NIVELES)

Debido al modelo de seguridad de Windows moderno (Windows 10 1903+ y Windows 11), un solo ejecutable no puede satisfacer a la vez los requisitos de arranque automático y acceso a la interfaz gráfica. Se establece formalmente una **arquitectura de dos procesos (Service + Session Agent)**:

```mermaid
flowchart TD
    subgraph Sesion0["SESIÓN 0 (Aislada - Sin Acceso a Pantalla)"]
        WinSvc["AssetSchool Windows Service<br/>(LocalSystem Account)"]
        SvcPipe["Named Pipe Server<br/>\\\\.\\pipe\\AssetSchool_IPC_Svc"]
        WinSvc --- SvcPipe
    end

    subgraph Sesion1["SESIÓN 1..N (Sesión Interactiva de Usuario)"]
        UserToken["Token de Usuario Autenticado"]
        SessionAgent["AssetSchool Session Agent<br/>(Contexto de Usuario Activo)"]
        DXGI["DXGI Desktop Duplication /<br/>Windows.Graphics.Capture"]
        Curtain["LockCurtain Form (TopMost + Hook)"]
        PipeClient["Named Pipe Client"]
        
        SessionAgent --- DXGI
        SessionAgent --- Curtain
        SessionAgent --- PipeClient
    end

    SvcPipe <==>|IPC Bidireccional Seguro<br/>(ACL restringida a SYSTEM + Interactive User)| PipeClient
    WinSvc <==>|Canal de Control WebSocket :3000| CoreServer["Servidor Central Docente"]
```

### 2.1. Windows Service (.NET 8 - Sesión 0)
* **Cuenta de Ejecución**: `NT AUTHORITY\SYSTEM`.
* **Tipo de Inicio**: Automático (`SERVICE_AUTO_START`).
* **Responsabilidades**:
  1. Escuchar la baliza UDP de descubrimiento en el puerto `48500`.
  2. Gestionar la conexión de red principal (WebSocket / TLS) con el servidor docente.
  3. Registrar notificaciones de sesión del sistema operativo mediante `WTSRegisterSessionNotification(hWnd, NOTIFY_FOR_ALL_SESSIONS)`.
  4. Detectar eventos de inicio de sesión (`WTS_SESSION_LOGON`), cierre de sesión (`WTS_SESSION_LOGOFF`), bloqueo de estación (`WTS_SESSION_LOCK`) y cambio rápido de usuario (`WTS_CONSOLE_CONNECT` / `WTS_CONSOLE_DISCONNECT`).
  5. Spawnear y supervisar el proceso del **Session Agent** dentro de cada sesión gráfica activa usando `CreateProcessAsUser` con el token de la sesión interactiva activa (`WTSQueryUserToken`).
  6. Si el proceso de sesión es terminado de forma anómala (ej. por un estudiante avanzado mediante herramientas administrativas), el servicio detecta el cierre y lo relanza de inmediato en < 500 ms.

### 2.2. Session Agent (.NET 8 / WinForms / Win32 - Sesión Interactiva)
* **Contexto de Ejecución**: Token del usuario interactivo logueado (Nivel de Integridad Medio/Alto).
* **Responsabilidades**:
  1. Conectarse al Named Pipe del servicio local.
  2. Inicializar la captura de pantalla nativa mediante **DXGI Desktop Duplication API** o **Windows.Graphics.Capture** (disponible a través de WinRT en .NET 8).
  3. Desplegar la cortina de bloqueo visual (`LockCurtainOverlay`) sobre todas las pantallas físicas activas (`Screen.AllScreens`).
  4. Instalar ganchos de bajo nivel de teclado para suprimir combinaciones de navegación durante el bloqueo.

### 2.3. Canal IPC por Named Pipes y Matriz de Control de Acceso (ACL)
* **Nombre de Pipe**: `\\.\pipe\AssetSchool_IPC_S{SessionId}` (un pipe dedicado por identificador de sesión de Windows Terminal Services).
* **Modo de Transmisión**: `PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT`.
* **Seguridad y Descriptor de Acceso (Security Descriptor)**:
  * El servicio crea el pipe con una lista de control de acceso discrecional (DACL) estricta:
    * `GENERIC_ALL` otorgado únicamente a `NT AUTHORITY\SYSTEM`.
    * `GENERIC_READ | GENERIC_WRITE` otorgado al SID del usuario correspondiente a esa sesión específica (`SessionId`), obtenido dinámicamente mediante `WTSQueryInformationW(..., WTSSessionId, ...)` y resolución de token.
    * Cualquier intento de apertura de pipe desde un usuario de otra sesión o desde la red (`NETWORK SID`) es rechazado con `ERROR_ACCESS_DENIED`.
* **Validación de Identidad por Impersonación**:
  * Al recibir una conexión, el servicio llama a `ImpersonateNamedPipeClient()` y valida que el cliente posee el SID esperado antes de procesar cualquier comando de control o transferencia de datos.

### 2.4. Ciclo de Vida ante Cambio de Usuario y Escritorio Seguro
* **Transición a Escritorio Seguro (UAC / Ctrl+Alt+Del)**:
  * Cuando Windows cambia al escritorio seguro (`Winlogon` o credenciales UAC), la API DXGI arroja el código de error `DXGI_ERROR_ACCESS_LOST`.
  * El Session Agent detecta `ACCESS_LOST`, suspende ordenadamente el loop de captura, notifica al servidor (`DESKTOP_SWITCHED_SECURE`) y entra en modo de sondeo con `Reacquire()`.
  * En cuanto el usuario abandona el diálogo seguro y retorna al escritorio interactivo, la captura se reanuda de forma transparente sin pérdida de la sesión WebRTC.
* **Fast User Switching (Cambio Rápido de Usuario)**:
  * Al ocurrir `WTS_CONSOLE_DISCONNECT`, el Session Agent de la sesión anterior es pausado.
  * Al ocurrir `WTS_CONSOLE_CONNECT` en una nueva sesión, el servicio genera un nuevo Session Agent para el nuevo usuario, garantizando que el docente vea el escritorio del usuario que realmente está manipulando la máquina.

---

## 3. ESPECIFICACIÓN DE CAPTURA DE PANTALLA Y LÍMITES DE UIPI

### 3.1. Pipeline de Captura DXGI (DirectX 11)
1. Creación del dispositivo Direct3D 11 (`D3D11CreateDevice`) con flag `D3D11_CREATE_DEVICE_BGRA_SUPPORT`.
2. Adquisición de la interfaz `IDXGIOutputDuplication` a través del adaptador y monitor primario/secundario.
3. En cada ciclo de refresco (según el tier: 10 FPS para miniaturas, 30-60 FPS para vista individual):
   * Llamada a `AcquireNextFrame(timeoutMs, &frameInfo, &desktopResource)`.
   * Si no hay cambios en la pantalla (`frameInfo.AccumulatedFrames == 0`), se omite la codificación para ahorrar CPU/GPU.
   * Si hay cambios, se copia la textura Direct3D al encoder de video por hardware (H.264 NVENC/AMF/QuickSync) o por software (VP8/SIPSorcery).
   * Liberación inmediata con `ReleaseFrame()`.

### 3.2. Limitaciones de UIPI (User Interface Privilege Isolation) y Bloqueo
* **User Interface Privilege Isolation (UIPI)**:
  * Windows impide que un proceso con nivel de integridad menor envíe mensajes (`WM_COMMAND`, `WM_KEYDOWN`) a una aplicación con mayor nivel de integridad (ej. una consola ejecutada como Administrador).
  * Por diseño, el Session Agent corre en el nivel de integridad del usuario. Si el estudiante abrió una ventana con "Ejecutar como administrador", la inyección de teclado del docente requiere que el Session Agent corra con el token elevado correspondiente mediante el servicio de fondo.
* **Bloqueo Pedagógico Robusto**:
  * Ventana `Form` a pantalla completa en `HWND_TOPMOST`.
  * Captura de foco cíclico: si el foco de ventana es robado, se invoca `SetForegroundWindow()` de inmediato.
  * Gancho `WH_KEYBOARD_LL`: intercepta `VK_LWIN`, `VK_RWIN`, `Alt+Tab`, `Alt+Esc`, `Ctrl+Esc`.
  * **Excepción de Hardware/Kernel**: La combinación `Ctrl + Alt + Supr` no puede ser interceptada por ninguna aplicación en modo usuario por diseño de seguridad de Windows; sin embargo, al cambiar a la pantalla de Winlogon, el servicio mantiene la máquina bloqueada impidiendo abrir el Administrador de Tareas.

---

## 4. ESPECIFICACIÓN DEL MOTOR DE BASE DE DATOS Y AISLAMIENTO MULTI-TENANT

* **Motor**: PostgreSQL 16.15 nativo local.
* **Control de Acceso Basado en Roles (RBAC)**:
  * `SUPER_ADMIN`: Gestión global de infraestructura.
  * `INSTITUTION_ADMIN`: Gestión de directores de laboratorio, cursos e inventario.
  * `TEACHER`: Acceso exclusivo a sus clases asignadas, supervisión de pantallas y comandos de aula.
  * `STUDENT`: Registro de asistencia y recepción de material.
* **Aislamiento Multi-Tenant**:
  * Todas las tablas de dominio (`devices`, `classrooms`, `device_sessions`, `audit_logs`) incluyen obligatoriamente `institution_id UUID NOT NULL REFERENCES institutions(id)`.
  * Las consultas del servidor local aplican filtrado estricto por `institution_id` derivado del token JWT verificado en el contexto de la petición.
* **Inmutabilidad del Registro de Auditoría**:
  * La tabla `audit_logs` cuenta con reglas a nivel de motor para impedir `UPDATE` o `DELETE`, garantizando la validez legal del historial de acciones del docente (bloqueos, inspecciones, transferencias de archivos).
