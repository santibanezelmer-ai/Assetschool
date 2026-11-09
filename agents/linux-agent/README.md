# AssetSchool Agent — Linux (Rust & webrtc-rs)

## 1. Arquitectura y Decisión Técnica Definitiva
Tras evaluar GStreamer (`webrtcbin`) frente a `webrtc-rs`, el equipo de arquitectura educativa de AssetSchool seleccionó **`webrtc-rs` (puerto Rust de Pion WebRTC)** como el pipeline multimedia oficial y definitivo para el agente de Linux:

- **Eliminación de Dependencias Frágiles**: GStreamer requiere plugins externos de C (`gstreamer1.0-plugins-bad`, `libgstreamer-plugins-bad1.0-dev`) que varían drásticamente entre distribuciones y causan fallos silenciosos en tiempo de ejecución.
- **Seguridad en Memoria**: `webrtc-rs` ofrece una implementación 100% Rust con verificación en tiempo de compilación frente a memory corruption o buffer overflows en el manejo de paquetes UDP.
- **Captura Wayland Nativa**: Integración con XDG Desktop Portal (`org.freedesktop.portal.ScreenCast`) vía D-Bus, negociando el nodo de stream de PipeWire.

## 2. Requisitos de Entorno para Compilación
- **Sistema Operativo**: Linux (Ubuntu 22.04/24.04 LTS, Debian 12, Fedora 39/40).
- **Compilador**: `rustc` y `cargo` (Rust Edition 2021).
- **Librerías del Sistema**:
```bash
sudo apt update && sudo apt install -y build-essential libdbus-1-dev libpipewire-0.3-dev pkg-config
```

## 3. Compilación y Ejecución
```bash
cargo build --release
./target/release/assetschool-linux-agent
```
