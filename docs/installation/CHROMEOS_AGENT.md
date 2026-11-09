# AssetSchool — Guía de Despliegue del Agente ChromeOS (Manifest V3)

## 1. Requisitos y Entorno Operativo
- **Sistema Operativo**: ChromeOS versión 114 o superior.
- **Tipo de Despliegue**: Extensión empaquetada Manifest V3 forzada mediante Google Admin Console (dominio Google Workspace for Education).
- **APIs Oficiales**: `chrome.desktopCapture`, `chrome.enterprise.deviceAttributes`, `declarativeNetRequest`.

---

## 2. Empaquetado de la Extensión (`.crx` / `.zip`)

### 2.1 Compilación TypeScript
```bash
cd agents/chromeos-agent

# Compilar TypeScript a JavaScript modular en dist/
npx tsc

# Crear paquete ZIP para distribución
zip -r assetschool-chromeos-agent-1.0.0.zip manifest.json dist/ icons/
```

---

## 3. Despliegue Masivo vía Google Admin Console (G Suite for Education)

1. Ingresar a la **Consola de Administración de Google** (`admin.google.com`) con credenciales de Administrador del Dominio Escolar.
2. Navegar a: `Dispositivos` > `Chrome` > `Aplicaciones y extensiones` > `Usuarios y navegadores`.
3. Seleccionar la **Unidad Organizativa (OU)** de los estudiantes (ejemplo: `Alumnos / Laboratorio TIC`).
4. Hacer clic en el botón amarillo `+` y seleccionar **Agregar por ID de aplicación o URL**.
5. Configurar la instalación como **Forzar instalación** (*Force Install*), impidiendo que el estudiante desinstale o deshabilite la extensión.

---

## 4. Preautorización de Captura de Pantalla mediante Políticas de ChromeOS

Para evitar que el estudiante deba hacer clic en el diálogo de selección de pantalla en cada clase, se configuran las siguientes políticas administradas en la consola de Google:

### 4.1 Política `AutoSelectDesktopCaptureSourceByScreen`
Configura que la extensión capture automáticamente la pantalla completa para la URL del servidor local:
```json
[
  {
    "matches": ["http://192.168.*.*:*/*", "http://assetschool.local:*/*"],
    "source": "entire_screen"
  }
]
```

### 4.2 Política `ScreenCaptureAllowedByOrigins`
Permite la captura de pantalla por WebRTC sin alertas invasivas:
```json
[
  "http://192.168.1.10:3000",
  "http://192.168.1.10:48501"
]
```

---

## 5. Capacidades Reales vs Limitaciones de Sandbox en ChromeOS

| Funcionalidad | Estado en ChromeOS | Explicación Técnica |
| :--- | :---: | :--- |
| **Captura de Pantalla Completa** | ✅ Soportado | Vía `chrome.desktopCapture` + Políticas de Dominio |
| **Recepción de Transmisión del Profesor** | ✅ Soportado | Mediante ventana WebRTC en pantalla completa |
| **Filtrado y Bloqueo de URLs** | ✅ Soportado | Mediante `declarativeNetRequest` |
| **Mensajería y Chat en Clase** | ✅ Soportado | Interfaz Web del Agente |
| **Control Remoto de Mouse/Teclado** | ❌ No Permitido | Restricción estricta de seguridad del Sandbox de ChromeOS |
| **Bloqueo Total de Teclado del SO** | ❌ No Permitido | El sistema operativo ChromeOS reserva el control de input |
| **Mapeo de Procesos del Sistema Operativo** | ❌ No Permitido | No hay acceso a procesos fuera del navegador |

> [!NOTE]
> AssetSchool informa con total veracidad las capacidades de cada sistema operativo, sin simular funciones que atenten contra el modelo de seguridad de ChromeOS.
