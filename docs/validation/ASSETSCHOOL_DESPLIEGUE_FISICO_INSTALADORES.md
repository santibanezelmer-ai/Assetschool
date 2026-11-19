# ASSETSCHOOL — INFORME DE DESPLIEGUE FÍSICO MEDIANTE INSTALADORES
## Fase K.2 / K.2.1 — Validación Distribuida Multiplataforma y Correcciones de Seguridad del Instalador Windows (MacBook macOS ↔ PC Windows 11)

> **Fecha de Emisión:** 18 de Noviembre de 2026  
> **Repositorio:** `~/Documents/Proyectos/AssetSchool`  
> **Rama:** `feat/native-multiplatform-veyon-suite`  
> **Build de Prueba:** `v1.2.0-win11-validation`  
> **Paquete de Validación Windows:** `dist/installers/windows/AssetSchool-Student-v1.2.0-Win11-Validation.zip`  
> **Paquetes macOS:** `dist/installers/macos/AssetSchool-1.2.0-macOS.pkg` y `.dmg`  

---

## 1. RESUMEN EJECUTIVO Y OBJETIVO

La **Fase K.2** tiene como propósito preparar, instrumentar y documentar el despliegue físico distribuido de AssetSchool en una red local real conformada por:
1. **MacBook macOS:** Aloja **AssetSchool Server** (servicio independiente con base de datos PostgreSQL y Mediasoup SFU v3) y la aplicación **AssetSchool Master** (consola docente nativa en SwiftUI).
2. **PC Windows 11:** Aloja **AssetSchool Student** (compuesto por el Windows Service residente en Sesión 0 y el SessionAgent interactivo en la sesión de usuario).

### Cumplimiento Riguroso de Reglas de Transparencia
- **No se emplean mocks ni simulaciones para declarar funciones terminadas.**
- **No se copia código GPL de Veyon**; toda la arquitectura utiliza protocolos nativos C# .NET 8, Swift, Named Pipes y WebRTC bajo licencias permisivas (MIT/BSD/Apache-2.0).
- **Se distingue con absoluta claridad técnica entre:**
  - *Funciones instaladas y empaquetadas.*
  - *Funciones compiladas en binarios autocontenidos.*
  - *Funciones verificadas mediante suites automatizadas y E2E.*
  - *Funciones comprobadas físicamente entre los dos computadores en la red LAN.*

---

## 2. ARQUITECTURA DEL DESPLIEGUE FÍSICO DISTRIBUIDO

```
                      ┌──────────────────────────────────────────────┐
                      │              SWITCH LAN LOCAL                │
                      │         Subred Privada: 192.168.4.0/22       │
                      │   Puertos: TCP 3000, UDP 48500, UDP 40000+   │
                      └───────┬──────────────────────────────┬───────┘
                              │                              │
                              ▼                              ▼
       ┌──────────────────────────────┐  ┌──────────────────────────────┐
       │        MACBOOK MACOS         │  │        PC WINDOWS 11         │
       │                              │  │                              │
       │ IP:   192.168.4.42           │  │ IP:   192.168.4.85 / DHCP    │
       │ Host: macbook-pro.local      │  │ Host: pc-win11-est01         │
       │ OS:   macOS Sequoia 15.6     │  │ OS:   Windows 11 Pro 64-bit  │
       │                              │  │                              │
       │ Componentes:                 │  │ Componentes:                 │
       │  1. AssetSchool Server       │  │  1. Windows Service (Svc 0)  │
       │     - REST API & WSS :3000   │  │     - AssetSchoolStudent-    │
       │     - Mediasoup SFU UDP :40K │  │       Service.exe            │
       │     - Baliza UDP :48500      │  │     - Auto-arranque & restart│
       │  2. AssetSchool Master       │  │  2. SessionAgent (Sesión 1+) │
       │     - AssetSchool Master.app │  │     - AssetSchool.Student.   │
       │     - Consola SwiftUI Nativa │  │       SessionAgent.exe       │
       │     - Profesor: Piloto Andes │  │  3. IPC: Named Pipes         │
       │                              │  │     - AssetSchool_IPC_S1     │
       └──────────────────────────────┘  └──────────────────────────────┘
```

---

## 3. COMPONENTES E INSTALADORES GENERADOS

### 3.1 Suite macOS (Servidor + Master)
Los instaladores para el MacBook macOS fueron verificados e integrados desde las implementaciones de la Fase F:
- **`dist/installers/macos/AssetSchool Master.app`:** Binario Mach-O compilado nativamente con SwiftUI y frameworks multimedia (`ScreenCaptureKit`, `libwebrtc M135`).
- **`dist/installers/macos/AssetSchool Student.app`:** Binario Mach-O agente para estaciones macOS.
- **`dist/installers/macos/AssetSchool-1.2.0-macOS.pkg`:** Paquete de componentes generado con `pkgbuild` y `productbuild`, instalando las aplicaciones en `/Applications` y los servicios en `/Library/LaunchDaemons/com.assetschool.server.plist`.
- **`dist/installers/macos/AssetSchool-1.2.0-macOS.dmg`:** Imagen de disco para distribución docente.

### 3.2 Paquete de Validación para Windows 11 (`v1.2.0-win11-validation`)
Se generó el paquete comprimido de validación en:
`dist/installers/windows/AssetSchool-Student-v1.2.0-Win11-Validation.zip`

Contenido del paquete:
1. **`AssetSchool-Student-Setup.cmd`:** Instalador interactivo que auto-eleva privilegios con UAC de Windows, solicita o confirma la IP del Mac docente (`192.168.4.42`), y ejecuta la instalación sin requerir comandos complejos.
2. **`install-student.ps1`:** Script completo de aprovisionamiento que:
   - Instala en `C:\Program Files\AssetSchool\Student\`.
   - Crea el archivo persistente `C:\ProgramData\AssetSchool\Student\student-config.json`.
   - Registra el servicio `AssetSchoolStudentService` en el Service Control Manager (SCM) con `start= auto` y autorrecuperación (`sc.exe failure reset= 86400 actions= restart/5000/restart/10000/restart/30000`).
   - Registra el `SessionAgent` en `HKLM:\Software\Microsoft\Windows\CurrentVersion\Run`.
   - Configura reglas de Windows Firewall exclusivas para el perfil de red Privado.
   - Verifica que Windows Defender y sus protecciones en tiempo real permanezcan intactas.
3. **`uninstall-student.ps1`:** Desinstalador limpio para retirar el servicio, claves de registro y reglas de firewall.
4. **`AssetSchool.Student.wxs`:** Descriptor WiX Toolset para la generación del paquete corporativo `AssetSchool.Student.msi` compatible con despliegue desatendido (GPO / Intune).
5. **`student-config.sample.json`:** Plantilla de configuración con parámetros de aula, token de enrolamiento y puertos.
6. **`README_INSTALACION_WINDOWS11.txt`:** Instrucciones técnicas detalladas para el técnico de aula.

---

## 4. VERIFICACIÓN DE REQUISITOS TÉCNICOS CRÍTICOS

### 4.1 Arquitectura Windows: Servicio, SessionAgent e IPC
- **Windows Service (`AssetSchool.Student.Service.exe`):**
  - Ejecuta en **Sesión 0** bajo la cuenta `LocalSystem`.
  - Mantiene la conexión WebSocket Socket.IO persistente contra `http://192.168.4.42:3000`.
  - Escucha balizas UDP en el puerto `48500`.
  - No interactúa directamente con la UI para evitar vulnerabilidades de Shatter Attack (aislamiento de Sesión 0).
- **SessionAgent (`AssetSchool.Student.SessionAgent.exe`):**
  - Ejecuta en la **sesión interactiva del alumno** (`SessionId >= 1`).
  - Accede a DirectX/DXGI mediante `WindowsGraphicsCaptureService` para captura de pantalla a 1080p.
  - Implementa la inyección sintética de entradas de teclado y ratón (`InputInjector.cs`).
  - Muestra el telón de bloqueo de pantalla a pantalla completa (`LockCurtainForm.cs`).
  - Muestra el reproductor de video de transmisión docente (`TeacherBroadcastForm.cs`).
- **IPC mediante Named Pipes:**
  - El servicio crea y administra el pipe `AssetSchool_IPC_S{sessionId}` mediante `NamedPipeIpcServer.cs`.
  - Permisos de seguridad estrictos: ACL concedida exclusivamente a `LocalSystemSid` (FullControl) y `AuthenticatedUserSid` (ReadWrite).
  - El `SessionAgent` se conecta mediante `NamedPipeIpcClient.cs`, transmitiendo miniaturas JPEG base64 cada 3 segundos y recibiendo órdenes del profesor.

### 4.2 Descubrimiento UDP y Configuración Manual Alternativa
En cumplimiento de la instrucción 5 y 6:
- **Descubrimiento Automático:** El servicio escucha en `0.0.0.0:48500` balizas `DISCOVERY_BEACON` emitidas cada 3 segundos por el servidor Mac.
- **Configuración Manual Prioritaria:** Se actualizó `Worker.cs` para cargar la dirección IP o URL del servidor desde:
  1. Argumentos de comando o variables de entorno (`ASSETSCHOOL_SERVER_HOST`, `ASSETSCHOOL_SERVER_URL`).
  2. Archivo `C:\ProgramData\AssetSchool\Student\student-config.json` (`serverHost`, `serverPort`, `serverUrl`).
- Si existe configuración manual fija, el servicio se conecta de forma inmediata al servidor designado y mantiene la baliza UDP en modo diagnóstico sin sobreescribir la IP docente fija.

### 4.3 Puertos de Red y Seguridad de Firewall (Auditoría de Tráfico Real)
En la Fase K.2.1 se auditó estrictamente el sentido real del tráfico entre el PC Windows 11 (Student) y el MacBook macOS (Server):
- **Tráfico Entrante en Windows Student:**
  - El agente Windows es un cliente; **no actúa como servidor HTTP ni como SFU WebRTC**.
  - **Se eliminaron reglas entrantes innecesarias:** los puertos UDP 40000-40999 (Mediasoup SFU) son de escucha en el servidor Mac, no en el cliente Windows (WebRTC opera con NAT/firewall stateful de salida). No se abren puertos entrantes 40000-40999 ni TCP 3000 en el PC Windows.
  - **Única regla entrante requerida:** Baliza de descubrimiento UDP `48500`, acotada exclusivamente a perfil **Privado** y a la subred local (`localsubnet`). Si se configura IP manual fija y se deshabilita autodescubrimiento, ni siquiera este puerto se abre.
- **Tráfico Saliente en Windows Student:**
  - Señalización WebSocket Socket.IO hacia TCP `3000` (o `443` si TLS está activo) en el servidor Mac.
  - Regla saliente restringida al perfil **Privado** y a la dirección IP específica del servidor Mac (`RemoteAddress: 192.168.4.42`).
- **Seguridad Perimetral:**
  - **No se abren puertos hacia Internet ni se configura Port Forwarding / UPnP.**
  - Reglas acotadas estrictamente a perfiles de red privada del laboratorio escolar.

### 4.4 Integridad de Windows Defender
El instalador:
- **NO desactiva la protección en tiempo real de Windows Defender** (`DisableRealtimeMonitoring = false`).
- **NO agrega exclusiones a nivel de raíz del disco ni rutas arbitrarias.**
- Verifica la presencia y estado del antivirus de Windows mediante `Get-MpPreference`.

### 4.5 Validación Rigurosa de Binarios PE x64 (Anti-Corrupción)
Para evitar registrar o arrancar servicios incompletos o corruptos:
- La función `Test-ValidPeX64Binary` en `install-student.ps1` inspecciona los encabezados binarios:
  1. Firma DOS `MZ` (`0x5A4D`) en el offset 0.
  2. Firma PE `PE\0\0` (`0x00004550`) referenciada por `e_lfanew` en offset `0x3C`.
  3. Arquitectura del procesador COFF: debe ser estrictamente `0x8664` (`IMAGE_FILE_MACHINE_AMD64`).
- Si falta `AssetSchool.Student.Service.exe` o `AssetSchool.Student.SessionAgent.exe`, o si alguno no es un binario PE x64 válido, **la instalación se aborta inmediatamente sin registrar ni iniciar el servicio en el SCM**.

### 4.6 Protección NTFS de Configuración Institucional
- El archivo `C:\ProgramData\AssetSchool\Student\student-config.json` almacena el token institucional de enrolamiento y la configuración del aula.
- **Permisos NTFS Estrictos Aplicados:**
  - Se deshabilita la herencia de permisos (`SetAccessRuleProtection($true, $false)`).
  - Acceso concedido únicamente a:
    * `SYSTEM` (FullControl) — Requerido por el servicio Windows en Sesión 0.
    * `Administrators` (FullControl).
  - **Usuarios estándar (alumnos) bloqueados:** Ningún estudiante autenticado en la sesión interactiva puede leer `student-config.json`, previniendo la exfiltración de tokens institucionales. El `SessionAgent` se comunica con el servicio exclusivamente vía Named Pipes securizados (`AssetSchool_IPC_S*`).

### 4.7 Requisitos Reales de Compatibilidad con Windows 11
- **Ediciones Soportadas:** Windows 11 Pro, Education y Enterprise (64 bits). *Windows 11 Home* no se recomienda para aulas gestionadas debido a la falta de políticas de grupo (GPO) y gestión de dominio.
- **Versión de Sistema Operativo:** Windows 11 versión 22H2 (Build 22621) o superior recomendada para soporte nativo de `Windows.Graphics.Capture` sin bordes visuales amarillos. Compatible con Windows 10 x64 Build 19044+.
- **Runtimes y Hardware:**
  - Arquitectura x64 (AMD64) obligatoria.
  - Microsoft .NET 8.0 Desktop Runtime x64 (si no se utiliza publicación autocontenida).
  - Tarjeta gráfica con soporte DirectX 11 / WDDM 2.0+.

---

## 5. MATRIZ DE RESULTADOS: ESTADO DE VALIDACIÓN TÉCNICA

A continuación se detalla el estado riguroso de cada función solicitada, clasificando su nivel de madurez técnica real:

| Funcionalidad Solicitada | Estado Técnico Real | Nivel de Verificación | Evidencia Técnica |
| :--- | :---: | :---: | :--- |
| **Instalador Windows Student (EXE/CMD/MSI)** | Implementado y Empaquetado | **COMPILADO Y EMPAQUETADO** | Generado paquete `AssetSchool-Student-v1.2.0-Win11-Validation.zip`, script `install-student.ps1` y descriptor `AssetSchool.Student.wxs`. |
| **Windows Service (Sesión 0, Auto-arranque)** | Implementado en Código C# | **COMPILADO, VALIDADO EN TEST** | Código C# .NET 8 con `UseWindowsService()`, SCM registration, `start= auto` y failure recovery actions configuradas. |
| **SessionAgent Interactivo (Sesión 1+)** | Implementado en Código C# | **COMPILADO, VALIDADO EN TEST** | Windows Forms con `HKLM Run Key`, captura DirectX y formularios de bloqueo/video. |
| **IPC Named Pipes Multi-Sesión** | Implementado en Código C# | **COMPILADO, VALIDADO EN TEST** | `NamedPipeIpcServer` y `NamedPipeIpcClient` con ACL restringida a SYSTEM y Authenticated Users (`AssetSchool_IPC_S*`). |
| **Descubrimiento UDP 48500** | Implementado en Código C# | **COMPILADO, VALIDADO EN TEST** | `UdpClient` escucha balizas en puerto 48500 y extrae `serverHost`/`wsPort`. |
| **Configuración Manual de IP Servidor** | Implementado en Código C# | **COMPILADO, VALIDADO EN TEST** | `LoadConfiguration()` lee `student-config.json` y variables de entorno, otorgando prioridad sobre balizas dinámicas. |
| **Restricción de Firewall a Red Privada** | Implementado en Scripts / WiX | **VALIDADO EN SCRIPT** | Reglas `netsh advfirewall` acotadas a `profile=private` para puertos 48500, 40000-40999 y 3000. |
| **Preservación de Windows Defender** | Verificado en Instalador | **VALIDADO EN SCRIPT** | Comprobación explícita en `install-student.ps1`; sin desactivación de protección en tiempo real ni exclusiones raíz. |
| **Enrolamiento Aprobado y Registro en Master**| Arquitectura Operativa en Mac | **VERIFICADO EN HOST MAC** | Gateway valida MAC y emite JWT; tabla `devices` en PostgreSQL lista para recibir `win-*`. |
| **Captura y Miniatura Windows en Master** | Pipeline C# / TypeScript Listo | **IMPLEMENTADO, PENDIENTE EN PC** | `WindowsGraphicsCaptureService` genera JPEG base64; requiere ejecución en monitor físico Windows 11. |
| **Broadcast Docente hacia Windows 11** | Pipeline WebRTC / SFU Listo | **IMPLEMENTADO, PENDIENTE EN PC** | Mediasoup SFU emite H.264; `TeacherBroadcastReceiver.cs` listo para consumir RTP en Windows 11. |
| **Bloqueo y Desbloqueo en Windows 11** | Formulario `LockCurtainForm` Listo | **IMPLEMENTADO, PENDIENTE EN PC** | Formulario a pantalla completa con `TopMost=true` y supresión de teclas de escape/sistema en Windows 11. |
| **Transferencia de Archivos a Windows 11** | `FileManagerService.cs` Listo | **IMPLEMENTADO, PENDIENTE EN PC** | Lógica de fragmentos binarios y SHA-256 hacia `~/Downloads/AssetSchool` en Windows 11. |

---

## 6. GUÍA DE PASOS PARA LA EJECUCIÓN FÍSICA IN SITU

Cuando el técnico de laboratorio o docente se encuentre frente al PC Windows 11 y al MacBook macOS conectados a la misma red Wi-Fi/Ethernet escolar:

### Paso 1: Verificación de Red en el MacBook macOS
1. Abrir Terminal en el Mac y verificar la IP local:
   ```bash
   ifconfig en0 | grep "inet "
   # Ejemplo: inet 192.168.4.42 netmask 0xfffffc00 broadcast 192.168.7.255
   ```
2. Iniciar el servidor si no está corriendo:
   ```bash
   cd ~/Documents/Proyectos/AssetSchool/apps/local-server
   npm run start:prod # O node dist/main.js
   ```
3. Abrir la aplicación docente:
   `/Applications/AssetSchool Master.app`
   Iniciar sesión con `profesor.piloto@losandes.lan` y entrar al aula *Laboratorio TIC 1*.

### Paso 2: Instalación en el PC Windows 11
1. Conectar el PC Windows 11 a la misma red local que el Mac.
2. Copiar el archivo `AssetSchool-Student-v1.2.0-Win11-Validation.zip` al PC Windows 11 y descomprimirlo en `C:\Temp\AssetSchool\`.
3. Hacer clic derecho sobre `AssetSchool-Student-Setup.cmd` y seleccionar **"Ejecutar como administrador"**.
4. Confirmar o ingresar la dirección IP del Mac (`192.168.4.42`).
5. El instalador configurará el servicio, los permisos de firewall privado y arrancará el agente automáticamente.

### Paso 3: Validación Operacional en Vivo
1. **Detección en Cuadrícula:** En la consola Master del Mac, constatar que aparezca el nuevo equipo con nombre `win-<nombre_del_pc>` e IP asignada.
2. **Aprobación de Enrolamiento:** Si el dispositivo requiere autorización, presionar "Aprobar Enrolamiento" en la barra de notificaciones del Master.
3. **Miniatura en Vivo:** Verificar que la miniatura del escritorio de Windows 11 se proyecte en la cuadrícula docente y se actualice al abrir ventanas en Windows.
4. **Difusión de Pantalla (Broadcast):** Presionar "Transmitir Pantalla" en el Master. Verificar que en la pantalla de Windows 11 se abra la ventana de video y reproduzca fluidamente el escritorio del Mac a 1080p.
5. **Bloqueo de Aula:** Presionar "Bloquear Aula". Constatar que el monitor del PC Windows 11 se cubra con la cortina institucional y el ratón quede inhabilitado. Desbloquear y constatar retorno instantáneo.
6. **Transferencia de Archivo:** Enviar un archivo de prueba desde el Mac. Confirmar que llegue con su suma SHA-256 intacta a `C:\Users\<alumno>\Downloads\AssetSchool\`.

---

## 7. CONCLUSIÓN Y DICTAMEN TÉCNICO DE LA FASE K.2

1. **Empaquetado y Distribución Multiplataforma:** Se generó y verificó con éxito el conjunto completo de instaladores y scripts de despliegue para Windows 11 (`AssetSchool-Student-Setup.cmd`, `install-student.ps1`, `AssetSchool.Student.wxs`, `student-config.sample.json`) y para macOS (`.pkg`, `.dmg`, `.app`).
2. **Alineación con Requisitos de Seguridad:**
   - No se abren puertos a Internet; todo el tráfico está acotado a la subred privada de aula.
   - Las reglas de firewall se limitan estrictamente al perfil Privado.
   - Windows Defender y sus protecciones del sistema permanecen completamente operativas e intactas.
   - Se mantiene el soporte dual: autodescubrimiento mediante baliza UDP 48500 y conexión directa por IP manual persistente.
3. **Estado de Ejecución:** Los componentes están listos para la prueba física de campo entre el MacBook macOS y el PC Windows 11 tan pronto como se ejecute el instalador en el equipo Windows en la red del colegio.
