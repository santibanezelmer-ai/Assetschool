# AssetSchool Agent — macOS

## Tecnologías
- **Lenguaje**: Swift 5.9+
- **Target OS**: macOS 13.0+ (Ventura, Sonoma, Sequoia)
- **Arquitectura**: Apple Silicon (arm64) y x86_64

## Modelo de Seguridad y Permisos TCC
En macOS, el sistema operativo prohíbe capturar pantalla o inyectar eventos de entrada sin consentimiento explícito:
1. **ScreenCaptureKit**: Requiere que la aplicación esté listada en *Privacidad y Seguridad > Grabación de pantalla*.
2. **Control de Entrada**: Requiere permiso en *Privacidad y Seguridad > Accesibilidad*.
3. **Daemon de Fondo**: Se despliega como un LaunchAgent para la sesión de usuario y opcionalmente un LaunchDaemon con privilegios elevados para inventario TIC.

## Compilación
```bash
swift build
swift run
```
