# AssetSchool — Guía de Compilación, Empaquetado e Instalación del Agente macOS

## 1. Requisitos del Sistema
- **Sistema Operativo**: macOS 12.3 (Monterey), macOS 13 (Ventura), macOS 14 (Sonoma) o macOS 15 (Sequoia).
- **Arquitectura**: Apple Silicon (M1/M2/M3/M4) e Intel x86_64 (Binario Universal).
- **Permisos de Seguridad**: Autorización TCC para `Grabación de Pantalla` (`Screen Recording`).

---

## 2. Compilación del Agente con Swift Package Manager (SPM)

### 2.1 Requisitos de Compilación
- Xcode 14.3 o superior (Command Line Tools): `xcode-select --install`
- Swift 5.8 o superior

### 2.2 Comando de Compilación Universal
```bash
cd agents/macos-agent

# Compilar para Apple Silicon y x86_64
swift build -c release --arch arm64 --arch x86_64

# Ubicación del binario universal
ls -la .build/apple/Products/Release/AssetSchoolAgent
```

---

## 3. Empaquetado como Aplicación `.app` y `.pkg`

Estructura de la aplicación macOS:
```text
AssetSchoolAgent.app/
  Contents/
    Info.plist
    MacOS/
      AssetSchoolAgent (Binario Universal firmado)
    Resources/
      AppIcon.icns
```

### 3.1 `Info.plist` con Declaración de Permisos
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.assetschool.agent</string>
    <key>CFBundleName</key>
    <string>AssetSchoolAgent</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>LSUIElement</key>
    <true/> <!-- Ejecuta como agente de fondo con barra de estado -->
    <key>NSScreenCaptureDescription</key>
    <string>AssetSchool requiere acceso a la pantalla para la supervisión y asistencia en el aula por parte del profesor.</string>
</dict>
</plist>
```

### 3.2 Generación de Paquete Instalador `.pkg` para MDM (Jamf Pro / Mosyle / Kandji)
```bash
pkgbuild --root ./AssetSchoolAgent.app \
         --identifier com.assetschool.agent \
         --version 1.0.0 \
         --install-location /Applications/AssetSchoolAgent.app \
         AssetSchoolAgent-1.0.0.pkg
```

---

## 4. Gestión de Permisos TCC (Screen Recording) vía Perfiles MDM

En macOS, Apple exige que la autorización de grabación de pantalla sea aprobada por el usuario interactivo o mediante un perfil de configuración `.mobileconfig` de Payload `com.apple.TCC.configuration-profile-policy`:

```xml
<key>Services</key>
<dict>
    <key>ScreenCapture</key>
    <array>
        <dict>
            <key>Identifier</key>
            <string>com.assetschool.agent</string>
            <key>IdentifierType</key>
            <string>bundleID</string>
            <key>CodeRequirement</key>
            <string>anchor apple generic and identifier "com.assetschool.agent"</string>
            <key>Allowed</key>
            <true/>
        </dict>
    </array>
</dict>
```
Con este perfil desplegado vía MDM institucional, los computadores del laboratorio escolar no solicitarán prompts manuales cada vez que un profesor inicie una clase.
