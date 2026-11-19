================================================================================
   ASSETSCHOOL STUDENT — GUÍA DE COMPILACIÓN, INSTALADOR PROFESIONAL Y SEGURIDAD
   DISTRIBUCIÓN WINDOWS 11 x64 (EXE AUTOCONTENIDO USB / LAN HOMOLOGACIÓN)
   VERSIÓN: 1.2.0-win11-setup
================================================================================

Este paquete contiene la arquitectura oficial de compilación, empaquetado gráfico
e instalación desatendida de AssetSchool Student para Windows 11 / 10 x64.

OBJETIVO PRINCIPAL:
Permitir la distribución de un único ejecutable gráfico 'AssetSchool-Student-Setup.exe'
mediante un pendrive USB para instalar y configurar estaciones de trabajo escolares
sin requerir el uso de consolas/terminales, sin depender de Git y sin requerir que
Windows tenga preinstalado .NET Runtime (ejecutables y runtime 100% autocontenidos).

--------------------------------------------------------------------------------
1. GENERACIÓN AUTOMATIZADA EN GITHUB ACTIONS (MÉTODO RECOMENDADO):
--------------------------------------------------------------------------------
No se requiere instalar .NET SDK, Inno Setup ni ninguna herramienta en el equipo local.
El instalador 'AssetSchool-Student-Setup.exe' se compila automáticamente en los servidores
de GitHub bajo un entorno Windows 11 x64 limpio:

PASO 1: Ingresar al repositorio en GitHub y seleccionar la pestaña 'Actions':
        https://github.com/santibanezelmer-ai/Assetschool/actions

PASO 2: En la lista lateral izquierda de flujos de trabajo, hacer clic en:
        'Build Windows Student Installer'

PASO 3: Hacer clic en el botón desplegable 'Run workflow' (arriba a la derecha):
        - Seleccionar la rama de trabajo (ej. 'feat/native-multiplatform-veyon-suite').
        - Hacer clic en el botón verde 'Run workflow'.

PASO 4: Esperar a que la ejecución finalice (aprox. 3-4 minutos, icono verde ✓).

PASO 5: Hacer clic sobre la ejecución completada y desplazarse hasta la sección
        inferior titulada 'Artifacts'.

PASO 6: Hacer clic en 'AssetSchool-Student-Windows-Installer' para descargar el archivo ZIP.

PASO 7: Descomprimir el ZIP y copiar 'AssetSchool-Student-Setup.exe' directamente a una
        memoria USB para distribuirlo e instalarlo en las estaciones de trabajo de los alumnos.

--------------------------------------------------------------------------------
2. REQUISITOS DEL ENTORNO DE COMPILACIÓN LOCAL (WINDOWS 11 ALTERNATIVO):
--------------------------------------------------------------------------------
Si se prefiere compilar manualmente en un computador Windows 11 local:

1. Microsoft .NET 8 SDK (x64):
   winget install Microsoft.DotNet.SDK.8

2. Inno Setup 6 (Compilador de instalador gráfico ISCC):
   winget install JRSoftware.InnoSetup

3. (Opcional) WiX Toolset v4 (si se requiere generar también paquete MSI):
   dotnet tool install --global wix

--------------------------------------------------------------------------------
3. PROCEDIMIENTO DE COMPILACIÓN LOCAL EN WINDOWS 11:
--------------------------------------------------------------------------------
En una consola PowerShell de Windows en la raíz del repositorio de AssetSchool:

powershell -NoProfile -ExecutionPolicy Bypass -File .\distribution\windows\student\build-installer.ps1 -Configuration Release -Runtime win-x64 -RequireExe

El script ejecutará automáticamente en 6 etapas:
  [1/6] Compilación de 'AssetSchool.Student.Service' (Release, win-x64, self-contained)
        en 'dist\bin\student-windows\Service\'.
  [2/6] Compilación de 'AssetSchool.Student.SessionAgent' (Release, win-x64, self-contained)
        en 'dist\bin\student-windows\SessionAgent\'.
  [3/6] Validación binaria byte a byte (cabeceras DOS MZ, PE\0\0, arquitectura AMD64)
        y cálculo de hash SHA-256 para ambos ejecutables.
  [4/6] Compilación con Inno Setup ('AssetSchool.Student.iss') para generar el
        ejecutable gráfico único:
        'dist\installers\windows\AssetSchool-Student-Setup.exe'.
  [5/6] (Opcional) Compilación del instalador MSI si WiX está instalado.
  [6/6] Empaquetado de la distribución en 'AssetSchool-Student-v1.2.0-Win11-Validation.zip'.

--------------------------------------------------------------------------------
4. CARACTERÍSTICAS DEL INSTALADOR GRÁFICO (AssetSchool-Student-Setup.exe):
--------------------------------------------------------------------------------
El ejecutable resultante es 100% nativo (código máquina C/C++ Inno Setup),
autocontenido y preparado para distribución directa en USB:

1. Pantalla de Bienvenida:
   Presenta el producto AssetSchool Student e informa al usuario sobre el asistente.
2. Pantalla de Aceptación de Condiciones:
   Presenta el acuerdo institucional 'TERMS_STUDENT.txt' con botones de aceptación.
3. Pantalla de Configuración de Red / Servidor Docente:
   - Permite confirmar o ingresar la IP/Hostname del Mac docente (ej. 192.168.4.42).
   - Permite confirmar o cambiar el puerto de señalización TCP (por defecto: 3000).
   - Permite activar o desactivar el autodescubrimiento por balizas UDP 48500.
4. Pantalla de Instalación y Progreso:
   - Solicita elevación UAC (administrador).
   - Extrae los binarios segregados a:
     * C:\Program Files\AssetSchool\Student\Service\
     * C:\Program Files\AssetSchool\Student\SessionAgent\
   - Crea el directorio protegido de configuración:
     * C:\ProgramData\AssetSchool\Student\student-config.json
   - Aplica ACLs NTFS estrictas (acceso exclusivo a SYSTEM y Administradores).
   - Registra el servicio Windows 'AssetSchoolStudentService' en el SCM con
     arranque automático y políticas nativas de autorrecuperación.
   - Configura las reglas de Windows Firewall auditadas (UDP 48500 y TCP 3000).
5. Pantalla de Finalización:
   - Confirma la instalación exitosa.
   - Ofrece casilla para iniciar el servicio inmediatamente. Al iniciar el servicio,
     este detecta la sesión activa y lanza 'SessionAgent.exe' en el escritorio visible.

--------------------------------------------------------------------------------
4. CONTROL DE CICLO DE VIDA Y GESTIÓN DE SESIONES:
--------------------------------------------------------------------------------
- Autoridad Única: El Windows Service (Sesión 0) es la única entidad responsable
  del ciclo de vida del agente. No se utiliza la clave HKLM Run.
- Mutex de Instancia Única: 'SessionAgent.exe' implementa un Mutex de sesión
  ('Local\AssetSchool_Student_SessionAgent_S<id>'), autodescubriendo su SessionId
  real en tiempo de ejecución. Esto previene completamente instancias duplicadas.
- Fast User Switching: Al cambiar de usuario, el agente de la sesión desconectada
  persiste y se reconecta automáticamente al Named Pipe al reactivarse la sesión.
- Cierre de Sesión: Windows finaliza los procesos de la sesión al cerrar sesión.

--------------------------------------------------------------------------------
5. MATRIZ DEFINITIVA DE FIREWALL Y SENTIDO REAL DEL TRÁFICO:
--------------------------------------------------------------------------------
| Componente / Protocolo | Puerto | Sentido en Windows | Regla de Firewall | Restricción de Seguridad |
| :--- | :---: | :---: | :--- | :--- |
| **Baliza de Descubrimiento** | UDP 48500 | ENTRANTE (Inbound) | Permitir entrada | Solo perfil Privado y subred local (localsubnet). Si se fija IP manual sin autodescubrimiento, no se abre. |
| **Señalización Socket.IO** | TCP 3000 | SALIENTE (Outbound)| Permitir salida | Solo perfil Privado y restringido a la IP del servidor Mac (192.168.4.42). |
| **Mediasoup SFU WebRTC** | Puertos efímeros | SALIENTE (Outbound)| Manejado por NAT stateful | NO requiere puertos entrantes en el cliente Windows (los puertos 40000-40999 son de escucha en el servidor Mac). |
| **Proceso de Servicio** | Binario | Bidireccional LAN | Regla de Aplicación | Acotada a perfil Privado y comunicación exclusiva con la IP del Mac. |

*Protección Perimetral:* No se abren puertos a Internet. No se configura Port Forwarding ni UPnP.

--------------------------------------------------------------------------------
6. DESINSTALACIÓN Y REINSTALACIÓN LIMPIA:
--------------------------------------------------------------------------------
- Desinstalador Nativo de Windows:
  El instalador registra 'AssetSchool Student' en "Configuración > Aplicaciones > Aplicaciones Instaladas"
  y en el Panel de Control ("Desinstalar un programa").
  Al desinstalar:
  1. Detiene el servicio Windows y termina procesos activos de SessionAgent y Service.
  2. Elimina el registro del servicio en el SCM.
  3. Elimina las reglas del Firewall.
  4. Elimina los archivos de 'C:\Program Files\AssetSchool\Student\'.
  5. Remueve los datos temporales y de configuración en ProgramData.
- Reinstalación / Actualización:
  El instalador gráfico detecta ejecuciones previas, detiene los servicios/procesos antes
  de sobreescribir archivos y actualiza la configuración sin duplicar servicios en SCM.

--------------------------------------------------------------------------------
7. ARCHIVOS GENERADOS EN 'dist/installers/windows/':
--------------------------------------------------------------------------------
- AssetSchool-Student-Setup.exe          (Instalador gráfico único para USB)
- AssetSchool.Student.iss                (Script descriptor oficial Inno Setup)
- TERMS_STUDENT.txt                      (Acuerdo de términos institucionales)
- build-installer.ps1                    (Script maestro de compilación C# + Inno Setup + WiX)
- install-student.ps1                    (Instalador alternativo por consola PowerShell)
- uninstall-student.ps1                  (Desinstalador alternativo por consola PowerShell)
- AssetSchool-Student-v1.2.0-Win11-Validation.zip (Paquete integral de validación)
================================================================================
