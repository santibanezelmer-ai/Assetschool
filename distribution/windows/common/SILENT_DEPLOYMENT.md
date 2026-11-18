# GUÍA DE DESPLIEGUE SILENCIOSO DE ASSETSCHOOL EN WINDOWS

Esta guía describe el procedimiento oficial para el despliegue desatendido y masivo de **AssetSchool Student** y **AssetSchool Master** en entornos corporativos o educativos utilizando Active Directory Group Policy (GPO), Microsoft Intune, SCCM o scripts de PowerShell.

---

## 1. PARÁMETROS DEL INSTALADOR MSI (STUDENT)

El paquete `AssetSchool.Student.msi` es compatible con el estándar de Windows Installer (`msiexec.exe`) y expone propiedades públicas para su parametrización automática:

| Propiedad | Tipo | Por Defecto | Descripción |
| :--- | :--- | :--- | :--- |
| `SERVER_URL` | String | `http://localhost:3000` | URL o IP del servidor AssetSchool de la institución. |
| `INSTITUTION_ID` | UUID | *(Opcional)* | Identificador institucional preconfigurado. |
| `CLASSROOM_ID` | UUID | *(Opcional)* | Aula informática específica a la que pertenece el equipo. |
| `ENROLLMENT_TOKEN`| String | *(Recomendado)*| Token institucional generado desde la consola para auto-enrolamiento. |
| `AUTO_START` | Integer (0/1)| `1` | Activa el inicio automático del SessionAgent en sesiones de usuario. |
| `KEEP_DATA` | Integer (0/1)| `1` | Conserva el histórico de configuración al desinstalar/actualizar. |

---

## 2. EJEMPLOS DE COMANDOS DE INSTALACIÓN SILENCIOSA

### A. Instalación Básica con Registro de Log
```powershell
msiexec.exe /i "AssetSchool.Student.msi" /quiet /qn /norestart /log "C:\Windows\Temp\assetschool-install.log"
```

### B. Instalación con Enrolamiento Automático Institucional
```powershell
msiexec.exe /i "AssetSchool.Student.msi" /quiet /qn /norestart /log "C:\Windows\Temp\assetschool-install.log" ^
  SERVER_URL="http://192.168.1.50:3000" ^
  ENROLLMENT_TOKEN="ENROLL-A1B2C3D4-E5F6G7H8"
```

### C. Desinstalación Limpia
```powershell
msiexec.exe /x "AssetSchool.Student.msi" /quiet /qn /norestart /log "C:\Windows\Temp\assetschool-uninstall.log"
```

---

## 3. ARQUITECTURA DE SERVICIO (SIN NSSM)

AssetSchool Student implementa una arquitectura híbrida nativa:
1. **AssetSchool.Student.Service.exe:** Servicio Windows registrado en `LocalSystem` que arranca automáticamente con el sistema operativo antes del inicio de sesión de los alumnos. Supervisa la red, aplica políticas a nivel de kernel/firewall y gestiona la sesión interactiva.
2. **AssetSchool.Student.SessionAgent.exe:** Proceso interactivo lanzado en la sesión de escritorio de cada usuario (`Session ID > 0`), con acceso a la GPU, captura DirectX/DXGI y recepción multimedia WebRTC.

*Nota Técnica:* No se emplea NSSM (Non-Sucking Service Manager) ni emuladores genéricos de servicios. La integración con el Service Control Manager (SCM) se realiza mediante las APIs de `Microsoft.Extensions.Hosting.WindowsServices` sobre .NET 8, garantizando control de señales de suspensión, parada limpia de servicios (`SIGTERM` / `SERVICE_CONTROL_STOP`) y políticas nativas de autorrecuperación (`sc failure`).
