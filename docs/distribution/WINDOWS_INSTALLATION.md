# GUÍA DE INSTALACIÓN Y DESPLIEGUE EN WINDOWS (ASSETSCHOOL)

Esta guía documenta la instalación, configuración y despliegue masivo de los componentes de **AssetSchool** en sistemas operativos Microsoft Windows (Windows 10, Windows 11 y Windows Server 2019/2022).

---

## 1. COMPONENTES DISPONIBLES PARA WINDOWS

| Componente | Formato | Destino Típico | Modo de Ejecución |
| :--- | :--- | :--- | :--- |
| **AssetSchool Master** | EXE / MSI | Equipos de profesores / Laptops docentes | Aplicación interactiva de escritorio (.NET 8 WPF) |
| **AssetSchool Student** | MSI | Estaciones de trabajo de alumnos en laboratorios | Servicio Windows (`LocalSystem`) + Agente de sesión interactiva |
| **AssetSchool Server** | PowerShell / MSI | Servidor institucional o equipo docente | Servicio nativo en segundo plano (`AssetSchoolServer`) |

---

## 2. INSTALACIÓN DE ASSETSCHOOL MASTER (EQUIPO DEL PROFESOR)

### Instalación Asistida (GUI)
1. Ejecute el instalador `AssetSchool-Master-Setup-1.2.0.exe` o `AssetSchool.Master.msi` con privilegios de administrador.
2. Seleccione el directorio de instalación deseado (por defecto: `C:\Program Files\AssetSchool\Master`).
3. El instalador configurará automáticamente las reglas de entrada en el Firewall de Windows para los puertos de señalización y WebRTC.
4. Al finalizar, se crearán accesos directos en el Menú Inicio y en el Escritorio.

### Instalación Silenciosa
```cmd
msiexec.exe /i "AssetSchool.Master.msi" /quiet /qn /norestart /log "C:\Windows\Temp\assetschool-master-install.log"
```

---

## 3. INSTALACIÓN DE ASSETSCHOOL STUDENT (ESTACIONES DE ALUMNOS)

El agente de estudiante se compone de dos procesos complementarios:
1. **AssetSchool.Student.Service.exe:** Servicio de sistema registrado en el Service Control Manager (SCM) como `AssetSchoolStudentService` con arranque automático.
2. **AssetSchool.Student.SessionAgent.exe:** Proceso interactivo iniciado en la sesión de escritorio de cada usuario (`Session ID > 0`) para captura gráfica y recepción de pantalla.

### Despliegue Silencioso Centralizado (GPO / Intune / SCCM)
```cmd
msiexec.exe /i "AssetSchool.Student.msi" /quiet /qn /norestart /log "C:\Windows\Temp\assetschool-student-install.log" ^
  SERVER_URL="http://192.168.1.50:3000" ^
  ENROLLMENT_TOKEN="ENROLL-A1B2C3D4-E5F6G7H8" ^
  AUTO_START=1 ^
  KEEP_DATA=1
```

### Parámetros Públicos de Instalación MSI:
- `SERVER_URL`: Dirección IP o nombre de host del servidor AssetSchool institucional.
- `ENROLLMENT_TOKEN`: Token de enrolamiento generado por el administrador para vincular la estación al aula informática correspondiente.
- `AUTO_START`: Activa o desactiva el lanzamiento automático del agente interactivo al iniciar sesión (`1` activado, `0` desactivado).
- `KEEP_DATA`: Mantiene la configuración y auditoría en `C:\ProgramData\AssetSchool\Student` ante reinstalaciones (`1` preservar, `0` purgar).

---

## 4. INSTALACIÓN DEL SERVIDOR EN WINDOWS

AssetSchool Server puede instalarse como servicio de sistema sin depender de herramientas externas como NSSM.

### Procedimiento:
1. Abra PowerShell con privilegios elevados de Administrador.
2. Ejecute el script oficial de instalación de servicio:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\distribution\windows\server\install-server-service.ps1 -ServerMode DEDICATED -Port 3000
   ```
3. El script:
   - Verifica Node.js 20+ LTS.
   - Crea el directorio de datos persistente en `C:\ProgramData\AssetSchool\Server`.
   - Registra el servicio `AssetSchoolServer` en el SCM con reinicio automático ante fallos.
   - Configura las reglas de firewall para HTTP (3000 TCP), Descubrimiento LAN (48500 UDP) y Mediasoup SFU (40000-40999 UDP).
   - Inicia el servicio automáticamente.

### Comandos de Control:
```powershell
Start-Service AssetSchoolServer
Stop-Service AssetSchoolServer
Restart-Service AssetSchoolServer
Get-Service AssetSchoolServer
```
