# GUÍA DE DESINSTALACIÓN LIMPIA (ASSETSCHOOL)

Esta guía describe los procedimientos para desinstalar completamente los componentes de **AssetSchool** en Windows y macOS, asegurando la remoción de servicios de sistema, reglas de red y la preservación o purga controlada de datos institucionales.

---

## 1. DESINSTALACIÓN EN WINDOWS

### A. AssetSchool Master
1. Abra **Configuración > Aplicaciones > Aplicaciones instaladas**.
2. Busque **AssetSchool Master** y haga clic en **Desinstalar**.
3. O ejecute por línea de comandos:
   ```cmd
   msiexec.exe /x "AssetSchool.Master.msi" /quiet /qn
   ```
4. El desinstalador removerá los accesos directos, binarios y las reglas del Firewall de Windows.

### B. AssetSchool Student
1. Ejecute la desinstalación desatendida vía `msiexec`:
   ```cmd
   msiexec.exe /x "AssetSchool.Student.msi" /quiet /qn KEEP_DATA=1
   ```
2. El instalador:
   - Detiene `AssetSchoolStudentService`.
   - Elimina el servicio del Service Control Manager (SCM).
   - Elimina el valor de inicio del `SessionAgent` en el Registro (`HKLM\Software\Microsoft\Windows\CurrentVersion\Run`).
   - Si `KEEP_DATA=1` (por defecto), mantiene la configuración institucional en `C:\ProgramData\AssetSchool\Student`. Para purga total, elimine esa carpeta manualmente o pase `KEEP_DATA=0`.

### C. AssetSchool Server
Ejecute el script oficial en PowerShell Administrador:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\distribution\windows\server\uninstall-server-service.ps1 -RemoveData:$false
```
Pase `-RemoveData:$true` únicamente si desea borrar la base de datos y logs de `C:\ProgramData\AssetSchool\Server`.

---

## 2. DESINSTALACIÓN EN MACOS

### A. Desinstalación Automática
Abra una terminal y ejecute el script de desinstalación con permisos de superusuario:
```bash
sudo /Library/Application\ Support/AssetSchool/scripts/uninstall.sh
```

Para conservar las configuraciones y registros de auditoría:
```bash
sudo /Library/Application\ Support/AssetSchool/scripts/uninstall.sh --keep-data
```

### B. Acciones que Ejecuta el Script de Desinstalación:
1. **Descarga de Servicios:**
   - `launchctl bootout system /Library/LaunchDaemons/com.assetschool.server.plist`
   - `launchctl bootout system /Library/LaunchDaemons/com.assetschool.daemon.plist`
   - `launchctl asuser <uid> launchctl bootout gui/<uid> /Library/LaunchAgents/com.assetschool.student.plist`
2. **Eliminación de Plists:** Remueve los archivos en `/Library/LaunchDaemons` y `/Library/LaunchAgents`.
3. **Eliminación de Bundles:** Borra `/Applications/AssetSchool Master.app` y `/Applications/AssetSchool Student.app`.
4. **Limpieza de Datos:** Purga o conserva `/Library/Application Support/AssetSchool`.
