# AssetSchool — Guía de Pruebas Automatizadas y Validación Física LAN (Fase 02)

## 1. Resumen de Suites de Pruebas Automatizadas

La Fase 02 incorpora pruebas unitarias, de integración y de seguridad que validan el 100% de los flujos de señalización, persistencia y control de streaming WebRTC.

### Ejecución de Pruebas en el Monorepositorio:
```bash
# Ejecutar todas las pruebas del servidor central
npm run test --workspace=@assetschool/local-server

# Ejecutar específicamente las pruebas de señalización WebRTC LAN
npm run test --workspace=@assetschool/local-server -- src/gateway/webrtc-signaling.spec.ts
```

### Cobertura de Pruebas Verificadas (27/27 Tests Pasando):
1. **Autorización y Autenticación de Docente**:
   - `should reject SCREEN_CAPTURE_START if caller is not authenticated as teacher`: Rechaza llamadas no autenticadas con `UNAUTHORIZED`.
   - `should reject SCREEN_CAPTURE_START if device is revoked in PostgreSQL`: Bloquea equipos revocados (`REVOKED`).
   - `should reject SCREEN_CAPTURE_START if device belongs to another institution (Tenant Isolation)`: Cumple aislamiento estricto multitenant (`audit_logs` / `devices`).
2. **Ciclo de Vida de Señalización WebRTC**:
   - `should establish stream session, forward start to agent, create audit log, and route WebRTC signaling`:
     - Emisión de `SCREEN_CAPTURE_START` al agente.
     - Registro en tabla `audit_logs` de PostgreSQL.
     - Enrutamiento bidireccional de `WEBRTC_OFFER`, `WEBRTC_ANSWER` y `WEBRTC_ICE_CANDIDATE`.
     - Flujo de telemetría `SCREEN_STREAM_STATS`.
     - Cierre limpio y emisión de `WEBRTC_SESSION_CLOSED` con `SCREEN_CAPTURE_STOP`.
3. **Resiliencia de Revocación**:
   - `should terminate active screen stream immediately when device is revoked dynamically`: Demuestra corte instantáneo del streaming en tiempo real si el equipo es revocado mientras transmitía.

---

## 2. Procedimiento de Prueba Manual en Red LAN Física (2 Computadores)

Esta guía permite al equipo de QA o administradores TIC validar el streaming WebRTC P2P en una red local real con 2 computadores físicos o máquinas virtuales en modo Puente (Bridged).

```
[ COMPUTADOR 1: SERVIDOR + DOCENTE ]               [ COMPUTADOR 2: ESTUDIANTE ]
IP LAN: 192.168.1.100                              IP LAN: 192.168.1.101
SO: Windows / macOS / Linux                        SO: Windows / macOS / Linux
Corre:                                             Corre:
- Docker PostgreSQL 16 (:5432)                     - Agente Nativo (AssetSchoolAgent)
- Local Server NestJS (:3000, :48501)
- Teacher Web Console (:5173)
```

---

### Paso 1: Configurar la Red Local y el Servidor (Computador 1)
1. Conectar ambos equipos al mismo switch Ethernet o red Wi-Fi institucional (ej. subred `192.168.1.0/24`).
2. En el Computador 1, verificar la IP asignada:
   ```bash
   # En Linux/macOS:
   ifconfig | grep "inet "
   # En Windows:
   ipconfig
   ```
3. Iniciar PostgreSQL y el servidor central:
   ```bash
   cd assetschool
   # Si utiliza Docker:
   docker compose up -d postgres
   # Iniciar backend:
   npm run start:dev --workspace=@assetschool/local-server
   ```
4. Iniciar la consola web del docente:
   ```bash
   npm run dev --workspace=@assetschool/teacher-web
   ```

---

### Paso 2: Iniciar el Agente del Estudiante (Computador 2)
1. En el Computador 2, verificar conectividad hacia el Computador 1:
   ```bash
   ping 192.168.1.100
   ```
2. Iniciar el agente nativo correspondiente:
   - **En Windows**: Ejecutar `AssetSchoolAgent.exe`.
   - **En macOS**: Ejecutar `AssetSchoolAgent.app` (confirmar permiso TCC en Ajustes).
   - **En Linux**: Ejecutar `assetschool-linux-agent`.
3. El agente realizará el handshake `AGENT_HELLO` en `http://192.168.1.100:48501`.
4. El servidor registrará:
   `[AgentGateway] Handshake exitoso: LAB01-PC-01 - Token emitido.`

---

### Paso 3: Supervisar Pantalla desde la Consola Docente (Computador 1)
1. En el Computador 1, abrir el navegador en `http://localhost:5173`.
2. Iniciar sesión con credenciales:
   - **Email**: `profesor@assetschool.lan`
   - **Contraseña**: `Docente123!*`
3. Navegar a **Monitor de Aula** (`/monitor`).
4. Verificar que el equipo del Computador 2 aparece en la cuadrícula en estado `Online`.
5. Hacer clic en **"Monitorear"**:
   - En la consola del docente, el recuadro 16:9 comenzará a reproducir en vivo la pantalla del Computador 2 mediante WebRTC P2P (RTP directo).
   - En la pantalla del Computador 2, se activará el banner rojo visible:  
     `🔴 Tu pantalla está siendo supervisada por el docente — AssetSchool`.
6. En la consola del docente, hacer clic en el botón de **Inspección Individual** (`Maximizar`):
   - Se abrirá el modal en pantalla completa a resolución HD (1080p).
   - Observar los indicadores de telemetría en vivo: Tasa de FPS (~30 FPS), Bitrate (~2000 kbps), Latencia RTT (< 5 ms).

---

### Paso 4: Validar Detención Inmediata
1. En la consola del docente, hacer clic en **"Detener Transmisión"**:
   - En < 100 ms, el reproductor de video en la consola docente se detiene.
   - En el Computador 2, el banner rojo de privacidad desaparece inmediatamente.
2. Desconectar el cable de red del Computador 2:
   - En < 35 segundos, el servidor detecta el timeout de latido LAN, marca el equipo como `Offline` y registra el cierre en `audit_logs`.

---

### Paso 5: Validar Registro en Base de Datos PostgreSQL
En el Computador 1, verificar la persistencia de las acciones de captura en PostgreSQL:
```sql
SELECT action, entity_id, actor_user_id, details_json, timestamp 
FROM audit_logs 
WHERE action IN ('SCREEN_CAPTURE_START', 'SCREEN_CAPTURE_STOP')
ORDER BY timestamp DESC LIMIT 5;
```
Resultado esperado: Registros completos con marcas de tiempo, actor docente y parámetros técnicos del stream.
