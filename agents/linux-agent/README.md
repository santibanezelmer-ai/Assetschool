# AssetSchool Agent — Linux

## Tecnologías
- **Lenguaje**: Rust (Edition 2021)
- **Target OS**: Distribuciones Linux modernas (Ubuntu 22.04/24.04, Debian 12, Fedora, Red Hat)
- **Servidores de Visualización**: Soporte explícito diferenciado para X11 y Wayland.

## Consideraciones Arquitectónicas
- **X11**: Soporte para captura directa a través de extensiones MIT-SHM y simulación de entrada vía `libXtst`.
- **Wayland**: Por diseño de aislamiento de seguridad en Wayland, el agente interactúa con el compositor (GNOME Mutter, KDE KWin) utilizando `org.freedesktop.portal.ScreenCast` sobre PipeWire.
- **Gestor de Servicios**: Se integra con `systemd` para arranque desatendido y reinicio automático.

## Compilación
```bash
cargo build --release
cargo run
```
