# AssetSchool — Guía de Compilación, Empaquetado e Instalación del Agente Linux

## 1. Requisitos del Sistema
- **Distribuciones Soportadas**:
  - Debian 12 / Ubuntu 22.04 LTS y 24.04 LTS.
  - Fedora 39 / 40.
  - Arch Linux.
- **Servidor Gráfico**:
  - Wayland (con `xdg-desktop-portal` y `pipewire`).
  - X11 clásico (con extensión MIT-SHM).
- **Librerías de Sistema**:
  - `libdbus-1-dev`
  - `libpipewire-0.3-dev`
  - `libssl-dev`

---

## 2. Compilación del Agente en Rust

### 2.1 Requisitos de Compilación
- Toolchain de Rust: `rustc --version` >= 1.78
- `cargo`

### 2.2 Comando de Compilación (Release)
```bash
cd agents/linux-agent

# Compilación optimizada en modo Release
cargo build --release

# Binario compilado
ls -lh target/release/assetschool-linux-agent
```

---

## 3. Empaquetado para Distribuciones Linux

### 3.1 Paquete Debian/Ubuntu (`.deb`) mediante `cargo-deb`
```bash
cargo install cargo-deb
cargo deb

# Instalación en el cliente:
sudo dpkg -i target/debian/assetschool-linux-agent_0.1.0_amd64.deb
```

Estructura de archivos instalados:
- `/usr/bin/assetschool-agent`: Binario ejecutable.
- `/etc/assetschool/agent.conf`: Archivo de configuración local.
- `/etc/systemd/user/assetschool-agent.service`: Servicio Systemd a nivel de sesión de usuario interactiva (necesario para acceder a PipeWire y D-Bus de sesión).

### 3.2 Unidad de Systemd de Usuario
```ini
# /etc/systemd/user/assetschool-agent.service
[Unit]
Description=AssetSchool Student Classroom Agent
After=graphical-session.target pipewire.service
PartOf=graphical-session.target

[Service]
ExecStart=/usr/bin/assetschool-agent --config /etc/assetschool/agent.conf
Restart=always
RestartSec=5

[Install]
WantedBy=graphical-session.target
```

Habilitación del servicio:
```bash
systemctl --user enable --now assetschool-agent.service
```

---

## 4. Configuración de Firewall (`ufw` / `firewalld`)
```bash
# Ubuntu / Debian UFW
sudo ufw allow in 50000:50100/udp comment 'AssetSchool WebRTC LAN'

# RedHat / Fedora Firewalld
sudo firewall-cmd --zone=public --add-port=50000-50100/udp --permanent
sudo firewall-cmd --reload
```
