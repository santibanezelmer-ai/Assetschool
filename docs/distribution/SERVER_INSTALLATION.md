# GUÍA DE INSTALACIÓN Y APROVISIONAMIENTO DEL SERVIDOR (ASSETSCHOOL)

AssetSchool Server es el motor central de señalización WebSocket, aislamiento multi-tenant, persistencia PostgreSQL y enrutamiento multimedia Mediasoup v3.

Puede desplegarse en dos modalidades según la infraestructura de la institución educativa:
1. **Modalidad Local (Profesor):** Ejecutado en la laptop o computador del docente dentro del aula.
2. **Modalidad Dedicada (Institucional):** Ejecutado en un servidor permanente de la escuela (Windows Server, Linux o Mac mini) accesible por todas las aulas del colegio.

---

## 1. REQUISITOS PREVIOS DEL SERVIDOR

- **Sistema Operativo:** Windows 10/11/Server 2019+, macOS 13+ (Apple Silicon o Intel), o Linux Ubuntu 22.04 LTS / Debian 12.
- **Node.js:** Versión 20.x o superior (LTS).
- **PostgreSQL:** Versión 15.x o 16.x.
- **Red:** Interfaz LAN física o Wi-Fi con dirección IP estática o reservada por DHCP.
- **Puertos de Red:**
  - `3000 TCP`: API REST y Gateway WebSocket de señalización.
  - `48500 UDP`: Descubrimiento LAN (Beacons periódicos y probes de clientes).
  - `40000 - 40999 UDP`: Rango de transporte multimedia WebRTC para Mediasoup SFU.

---

## 2. APROVISIONAMIENTO AUTOMATIZADO

AssetSchool incluye el provisionador unificado `assetschool-server-provisioner.mjs`:

### En Windows (PowerShell Administrador):
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\distribution\server\install-server.ps1 -ServerMode DEDICATED
```

### En macOS / Linux (Terminal):
```bash
sudo ./distribution/server/install-server.sh --dedicated
```

---

## 3. PASOS QUE EJECUTA EL APROVISIONADOR

1. **Detección de Red LAN:** Identifica la IP alcanzable por los clientes y configura la propiedad `announcedAddress` de Mediasoup SFU para garantizar el tráfico WebRTC sin depender de STUN público.
2. **Identidad Criptográfica del Servidor:** Genera un par de claves RSA-2048 y calcula su huella digital SHA-256 (`config/server-identity.json`). Esta identidad previene ataques de suplantación de servidor en la LAN.
3. **Migración de Base de Datos:** Conecta a PostgreSQL y aplica secuencialmente los esquemas:
   - `001_initial_schema.sql`: Tablas base de usuarios, aulas, dispositivos y auditoría.
   - `002_seed_data.sql`: Roles de sistema y configuración inicial.
   - `003_auth_security_enhancement.sql`: Endurecimiento de tokens y contraseñas.
   - `004_institutional_administration.sql`: Módulos multi-tenant, cursos, hardware e historial de asignaciones.
4. **Configuración de Transporte Multimedia:** Verifica la apertura del rango UDP 40000-40999 para la distribución de video H.264 hacia múltiples estudiantes.
5. **Generación de Configuración Institucional:** Escribe `config/assetschool-server-config.json`.

---

## 4. GESTIÓN DEL SERVICIO EN PRODUCCIÓN

### En Windows (Service Control Manager):
```powershell
# Iniciar / Detener
Start-Service AssetSchoolServer
Stop-Service AssetSchoolServer

# Ver estado
Get-Service AssetSchoolServer

# Ver logs
Get-Content -Tail 50 "C:\ProgramData\AssetSchool\Server\logs\server.stdout.log"
```

### En macOS (LaunchDaemon):
```bash
# Iniciar
sudo launchctl bootstrap system /Library/LaunchDaemons/com.assetschool.server.plist

# Detener
sudo launchctl bootout system /Library/LaunchDaemons/com.assetschool.server.plist

# Ver logs
tail -n 50 /Library/Application\ Support/AssetSchool/logs/server.stdout.log
```
