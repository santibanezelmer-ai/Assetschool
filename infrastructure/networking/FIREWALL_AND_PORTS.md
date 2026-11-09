# AssetSchool — Matriz de Puertos, Protocolos y Reglas de Firewall (LAN)

Esta especificación detalla los puertos de red, protocolos de transporte, certificados y configuraciones de cortafuegos (Firewall) requeridas para la operación confiable de AssetSchool en redes locales institucionales.

---

## 1. Matriz de Puertos y Servicios

| Puerto | Protocolo | Sentido del Tráfico | Origen | Destino | Servicio / Función |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`48500`** | **UDP** | Broadcast / Multicast | Servidor Core | Subred LAN (`255.255.255.255` o `192.168.x.255`) | **Descubrimiento Zero-Config**: Anuncio de presencia y URL de WebSocket a los agentes |
| **`48501`** | **TCP** | Bidireccional | Agentes Estudiantes | Servidor Core | **Enlace de Agentes (WSS/Socket.IO)**: Handshake, latido, capacidades y despacho de comandos |
| **`3000`** | **TCP / HTTPS** | Inbound | Consola Docente / Admin | Servidor Core | **API REST v1**: Autenticación JWT, gestión de sesiones, políticas y auditoría |
| **`5432`** | **TCP** | Localhost / Docker | Servidor Core | PostgreSQL 16 | **Persistencia Relacional**: Almacenamiento institucional exclusivo |
| **`5173` / `80`** | **TCP / HTTP(S)**| Inbound | Navegadores Docentes | Nginx / Servidor Web | **Consola Web**: Interfaz gráfica del profesor y administrador TIC |
| **`49152-65535`** | **UDP** | P2P LAN | Consola Docente | Agentes Estudiantes | **Streaming WebRTC (Fase 02)**: Transmisión de pantalla a 60 FPS |

---

## 2. Reglas de Cortafuegos por Sistema Operativo

### 2.1. Servidor Central (Linux - Ubuntu / Debian con UFW)
```bash
# Permitir API REST y Consola Web
sudo ufw allow 3000/tcp comment 'AssetSchool Core REST API'
sudo ufw allow 5173/tcp comment 'AssetSchool Web Console'

# Permitir WebSocket y Descubrimiento LAN
sudo ufw allow 48501/tcp comment 'AssetSchool Agent WebSocket'
sudo ufw allow 48500/udp comment 'AssetSchool LAN UDP Discovery'

# Aislar PostgreSQL para acceso local exclusivamente
sudo ufw deny 5432/tcp comment 'Block external PostgreSQL direct access'

sudo ufw reload
```

### 2.2. Servidor Central (Windows Server - PowerShell Administrador)
```powershell
New-NetFirewallRule -DisplayName "AssetSchool Core API (3000)" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "AssetSchool Agent WebSocket (48501)" -Direction Inbound -LocalPort 48501 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "AssetSchool LAN Discovery (48500)" -Direction Inbound -LocalPort 48500 -Protocol UDP -Action Allow
```

### 2.3. Estaciones de Trabajo de Alumnos (Agentes Nativos)
- **Windows**: El ejecutable `AssetSchoolAgent.exe` debe tener permiso de comunicación de red saliente hacia el puerto `48501` y escucha entrante en `48500/udp`.
- **macOS**: La aplicación agente requiere permiso en el cortafuegos del sistema (*Ajustes > Red > Firewall*).
- **ChromeOS**: Las extensiones utilizan la pila de red autorizada por la consola de administración de Google Workspace.

---

## 3. Seguridad de Enlace y Certificados TLS Locales

1. **Certificado Raíz Privado (Local Root CA)**:
   - Se genera localmente mediante `infrastructure/certificates/generate-certs.sh`.
   - No depende de autoridades de certificación públicas en Internet (como Let's Encrypt), permitiendo funcionamiento 100% offline.
2. **Validación de Identidad de Agentes**:
   - Cada agente presenta su clave pública **Ed25519** durante el handshake `AGENT_HELLO`.
   - El servidor valida contra la tabla `devices` que el equipo esté debidamente enrolado y que el flag `is_revoked` sea falso.
   - Si un equipo es revocado administrativamente, cualquier comando o intento de conexión subsiguiente es terminado de inmediato.
