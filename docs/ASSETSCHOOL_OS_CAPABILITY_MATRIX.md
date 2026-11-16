# ASSETSCHOOL — MATRIZ DE CAPACIDADES POR SISTEMA OPERATIVO
## Análisis Técnico Multiplataforma y Fronteras de Seguridad del Kernel (Fase 02.8)

- **Documento:** `docs/ASSETSCHOOL_OS_CAPABILITY_MATRIX.md`
- **Versión:** 1.0.0
- **Sistemas Operativos Evaluados:** Windows 10/11, macOS 14/15, Linux (X11 / Wayland), ChromeOS

---

## 1. MATRIZ COMPARATIVA DE CAPACIDADES NATIVAS

| Capacidad del Sistema | Windows 10 / 11 | macOS (Sonoma 14 / Sequoia 15) | Linux (X11 / Wayland) | ChromeOS (Managed Extension) |
| :--- | :--- | :--- | :--- | :--- |
| **API Principal de Captura de Pantalla** | **DXGI Desktop Duplication** (DirectX 11) o **Windows.Graphics.Capture** (WinRT) | **ScreenCaptureKit** (`SCStream`, Metal CVPixelBuffer) | **X11**: `XShmGetImage`<br/>**Wayland**: `xdg-desktop-portal` + **PipeWire** | `chrome.desktopCapture` / `getDisplayMedia` (WebRTC) |
| **FPS y Latencia Típica en LAN** | 30-60 FPS / < 30 ms (aceleración GPU) | 30-60 FPS / < 25 ms (aceleración Apple Silicon) | 30-60 FPS en X11; 15-30 FPS en Wayland / 35 ms | 15-30 FPS / 40-70 ms (renderizado navegador) |
| **Permisos de Sistema Requeridos** | Administrador para instalar servicio; acceso a sesión gráfica interactiva | Permiso TCC explícito en **Grabación de Pantalla** (`Screen Recording`) | Permiso de usuario estándar en X11; token de portal en Wayland | Permiso de extensión administrada por política en Google Admin |
| **Inyección de Control Remoto (Mouse/Teclado)** | **Soportado**: `SendInput`, `mouse_event`, `keybd_event` (sujeto a UIPI) | **Soportado con Permiso**: `CGEventCreateMouseEvent`, `CGEventPost` (requiere **Accesibilidad** en TCC) | **X11**: Soportado (`XTestFakeKeyEvent`)<br/>**Wayland**: **Restringido** (requiere `uinput` o portal de control remoto) | **Muy Limitado**: No tiene API para inyectar teclado/ratón a nivel de sistema fuera de la pestaña |
| **Telón de Bloqueo Pedagógico (Lock Curtain)** | **Soportado**: Form `HWND_TOPMOST` + gancho `WH_KEYBOARD_LL` (bloqueo total) | **Soportado**: `NSWindow` en `.screenSaver` level + `CGAssociateMouseAndMouseCursorPosition` | **X11**: Soportado (GrabKeyboard/Pointer)<br/>**Wayland**: **Parcial** (los compositores aíslan el teclado) | **Parcial**: Ventana en modo Kiosco a pantalla completa; el alumno puede presionar teclas de hardware |
| **Gestión y Terminación de Procesos** | **Soportado**: `EnumProcesses`, `OpenProcess`, `TerminateProcess` | **Soportado**: `NSRunningApplication.terminate()`, `kill(pid, SIGTERM)` | **Soportado**: Lectura de `/proc` y llamada a `kill()` / `pkill` | **Solo Extensiones/Apps**: Limitado a `chrome.management.setEnabled()` de extensiones |
| **Transferencia de Archivos Bidireccional** | **Acceso Completo al Disco**: Sujeto a los permisos del usuario | **Acceso a Carpetas de Usuario**: Requiere permisos TCC si accede a Documentos/Escritorio | **Acceso Completo al Disco**: Sujeto a los permisos POSIX del usuario | **Solo Descargas de Chrome**: Vía `chrome.downloads.download` (sin acceso arbitrario al sistema de archivos) |
| **Método de Instalación Desatendida** | Paquete `.msi` vía **GPO / Active Directory** o Script PowerShell | Paquete `.pkg` firmado distribuido vía **MDM (Jamf, Kandji, Apple School Manager)** | Paquete `.deb` / `.rpm` administrado vía **Ansible / Puppet** o script systemd | **Force-Install** de Extensión ID mediante la consola de **Google Admin Console** |
| **Actualización Silenciosa en Segundo Plano** | **Excelente**: El Windows Service reemplaza el binario de sesión sin reiniciar | **Complejo**: Requiere reinstalación PKG vía MDM para no invalidar permisos TCC | **Excelente**: Reemplazo de binario y reinicio de unidad `systemd --user` | **Automática**: Gestionada transparentemente por el Chrome Web Store o política Google |

---

## 2. RESTRICCIONES DURAS Y FRONTERAS INFRANQUEABLES POR SISTEMA OPERATIVO

### 2.1. Windows 10/11: Las Barreras del Escritorio Seguro y UIPI
* **Escritorio Seguro (Winlogon / UAC)**: Ninguna aplicación ordinaria en modo usuario puede capturar la pantalla cuando Windows muestra el aviso de UAC (pantalla oscurecida pidiendo contraseña de administrador) o la combinación `Ctrl+Alt+Supr`. Esto es una garantía de seguridad criptográfica del kernel (`csrss.exe` / `winlogon.exe`).
* **UIPI (User Interface Privilege Isolation)**: Si una aplicación objetivo corre con privilegios elevados (`High Integrity`), el agente docente debe tener un nivel de integridad equivalente para poder interactuar con ella mediante simulación de mouse.

### 2.2. macOS: El Framework TCC (Transparency, Consent, and Control)
* **Inviolabilidad de TCC**: macOS prohíbe terminantemente la captura de pantalla o la inyección de teclado sin autorización previa del usuario en *Ajustes del Sistema > Privacidad y Seguridad*.
* **Perfil de Configuración MDM**: En entornos escolares administrados con Macs, la única forma de habilitar estos permisos sin pedirle confirmación individual al alumno en cada arranque es instalar previamente un perfil `.mobileconfig` firmado desde el servidor MDM institucional.

### 2.3. Linux: La Brecha X11 vs. Wayland
* **X11 (Clásico)**: Ofrece total flexibilidad para capturar la pantalla (`XShm`) e interceptar teclado (`XGrabKeyboard`).
* **Wayland (Moderno - Ubuntu 22.04 / 24.04)**: Por diseño, Wayland aísla cada ventana del resto. Ninguna aplicación puede ver los píxeles de otra ni capturar sus pulsaciones de teclado globalmente. Para que AssetSchool opere en Wayland, debe solicitar una sesión de streaming a través de `xdg-desktop-portal` utilizando el backend de **PipeWire**, lo que presenta un diálogo nativo del sistema la primera vez.

### 2.4. ChromeOS: El Sandbox del Navegador
* Las Chromebooks escolares no ejecutan ejecutables nativos x86/ARM convencionales. Todo el software corre dentro del sandbox de Chromium.
* La extensión de AssetSchool en ChromeOS puede transmitir pantalla completa si la política institucional lo permite (`auto_select_desktop_capture_source`), pero **no puede bloquear el teclado de hardware del Chromebook ni matar procesos del sistema operativo Linux base (Crostini/Android)**.
