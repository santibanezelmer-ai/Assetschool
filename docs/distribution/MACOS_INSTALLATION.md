# GUÍA DE INSTALACIÓN Y DESPLIEGUE EN MACOS (ASSETSCHOOL)

Esta guía detalla los pasos para instalar, autorizar y desplegar **AssetSchool** en macOS Sonoma (14.x) y macOS Sequoia (15.x).

---

## 1. PAQUETES DE DISTRIBUCIÓN

AssetSchool para macOS se distribuye mediante dos formatos estándar de Apple:
- **`AssetSchool-1.2.0-macOS.pkg`:** Instalador firmado para despliegue automatizado vía MDM (Mosyle, Jamf Pro, Kandji) o instalación manual guiada.
- **`AssetSchool-1.2.0-macOS.dmg`:** Imagen de disco para distribución amigable y soporte de arrastrar aplicaciones a `/Applications`.

---

## 2. INSTALACIÓN MANUAL VÍA DMG / PKG

1. Abra `AssetSchool-1.2.0-macOS.dmg`.
2. Ejecute el instalador `AssetSchool-1.2.0-macOS.pkg`.
3. El instalador desplegará:
   - `/Applications/AssetSchool Master.app`
   - `/Applications/AssetSchool Student.app`
   - `/Library/LaunchAgents/com.assetschool.student.plist`
   - `/Library/LaunchDaemons/com.assetschool.daemon.plist`
   - `/Library/LaunchDaemons/com.assetschool.server.plist` (si aplica)
4. El script de post-instalación cargará automáticamente el LaunchAgent en la sesión gráfica del usuario activo.

---

## 3. INSTALACIÓN DESATENDIDA VÍA MDM O TERMINAL

```bash
sudo installer -pkg "AssetSchool-1.2.0-macOS.pkg" -target / -verboseR
```

Para preconfigurar el servidor y el aula de forma silenciosa en estaciones de alumnos:
```bash
sudo mkdir -p "/Library/Application Support/AssetSchool/config"
sudo cat <<EOF > "/Library/Application Support/AssetSchool/config/student-config.json"
{
  "serverUrl": "http://192.168.1.50:3000",
  "enrollmentToken": "ENROLL-A1B2C3D4-E5F6G7H8"
}
EOF
```

---

## 4. GESTIÓN DE PERMISOS DE PRIVACIDAD MACOS (TCC)

Por políticas de seguridad de Apple (Transparency, Consent, and Control), ciertas funciones requieren consentimiento explícito del usuario o un perfil de configuración MDM (`.mobileconfig`):

### A. Grabación de Pantalla (Screen Capture)
- **Función:** Permite al profesor transmitir su pantalla y a los alumnos emitir miniaturas al panel docente.
- **Autorización:** Ajustes del Sistema > Privacidad y Seguridad > Grabación de pantalla y audio del sistema.
- **Acceso Directo:**
  ```bash
  open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
  ```

### B. Accesibilidad (Accessibility)
- **Función:** Permite el control remoto asistido de teclado y mouse, y el bloqueo de pantalla durante exámenes.
- **Autorización:** Ajustes del Sistema > Privacidad y Seguridad > Accesibilidad.
- **Acceso Directo:**
  ```bash
  open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
  ```

### C. Notificaciones
- **Función:** Avisos de inicio de clase, mensajes y recepción de archivos.
- Se autoriza en el primer diálogo nativo mostrado por el sistema operativo.

---

## 5. DESINSTALACIÓN EN MACOS

Ejecute el script oficial de desinstalación limpia incluido en el DMG o en el repositorio:
```bash
sudo /Library/Application\ Support/AssetSchool/scripts/uninstall.sh
```
Para conservar las configuraciones institucionales y datos históricos:
```bash
sudo /Library/Application\ Support/AssetSchool/scripts/uninstall.sh --keep-data
```
