# AssetSchool Agent — Linux (Rust & PipeWire)

## 1. Arquitectura y Tecnologías
- **Lenguaje**: Rust (Edition 2021).
- **Target OS**: Linux con Wayland o X11 (Ubuntu 22.04/24.04 LTS, Debian 12, Fedora 39/40).
- **Captura de Pantalla en Wayland**: XDG Desktop Portal (`org.freedesktop.portal.ScreenCast`) vía D-Bus session bus. Negocia el flujo de video y expone un stream en PipeWire (`pipewiresrc`).
- **Captura de Pantalla en X11**: Captura directa mediante X11 Shared Memory Extension (`MIT-SHM`) o `XComposite`.
- **Motor WebRTC**: Pipeline multimedia mediante GStreamer `webrtcbin` o `webrtc-rs`.
  - Cifrado DTLS 1.2+ y SRTP con certificados generados localmente.
  - Negociación SDP Unified Plan y candidatos ICE directos de tipo `host` para red local.
- **Indicador de Privacidad**: Ventana flotante permanente con Wayland Layer Shell (`gtk4-layer-shell` o `wlr-layer-shell`) o ventana override-redirect en X11 con borde rojo visible.

## 2. Dependencias del Sistema Requeridas (Ubuntu / Debian)
```bash
sudo apt update && sudo apt install -y \
  build-essential \
  libdbus-1-dev \
  libpipewire-0.3-dev \
  libgstreamer1.0-dev \
  libgstreamer-plugins-base1.0-dev \
  libgstreamer-plugins-bad1.0-dev \
  gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad \
  gstreamer1.0-pipewire \
  pkg-config \
  rustc \
  cargo
```

## 3. Compilación y Ejecución
```bash
# Compilar en modo Release con el compilador Rust (cargo)
cargo build --release

# Ejecutar el agente en la sesión de usuario
./target/release/assetschool-linux-agent
```
