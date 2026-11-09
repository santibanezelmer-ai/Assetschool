# AssetSchool — Motor de Streaming WebRTC LAN (Fase 02)

## 1. Topología de Red LAN-First (Zero-Cloud)
AssetSchool opera bajo una estricta filosofía **Zero-Cloud**. Toda la transmisión de video viaja directamente entre los equipos dentro de la subred local institucional (LAN/VLAN), sin requerir servidores públicos STUN ni TURN de retransmisión externa.

```
       +-------------------------------------------------------+
       |           ASSETSCHOOL CORE (LOCAL SERVER)             |
       |  WebSocket Gateway (Port 48501)                       |
       |  PostgreSQL Database (Port 5432)                      |
       +-----------+-------------------------------+-----------+
                   | Signaling                     | Signaling
                   | (SDP / ICE)                   | (SDP / ICE)
                   v                               v
+-------------------------------+     +-------------------------------+
|     DOCENTE (TEACHER WEB)     |     |     ESTUDIANTE (AGENT)        |
|  IP: 192.168.1.200            |     |  IP: 192.168.1.101            |
+-------------------------------+     +-------------------------------+
                |                                     ^
                |      WEBRTC DIRECT PEER-TO-PEER     |
                +=====================================+
                  SRTP Video Track (Host Candidates)
                  Latencia: 2 - 8 ms | Cero Internet
```

---

## 2. Diagrama de Secuencia de Señalización WebRTC

El intercambio de metadatos se realiza a través de Socket.IO en el puerto 48501:

```
Docente (Web)            Local Server (Gateway)             Agente Estudiante
      |                             |                               |
      | 1. SCREEN_CAPTURE_START     |                               |
      |---------------------------->|                               |
      |                             | 2. Auth & Tenant Check (DB)   |
      |                             |    Audit Log (DB)             |
      |                             | 3. SCREEN_CAPTURE_START       |
      |                             |------------------------------>|
      | 4. WEBRTC_SESSION_CREATED   |                               |
      |<----------------------------|                               |
      |                             |                               | 5. Inicia Captura Nativa
      |                             |                               |    Muestra Banner Alumno
      |                             | 6. WEBRTC_OFFER (SDP + Host)  |
      |                             |<------------------------------|
      | 7. WEBRTC_OFFER             |                               |
      |<----------------------------|                               |
      | 8. SetRemoteDescription     |                               |
      |    CreateAnswer             |                               |
      | 9. WEBRTC_ANSWER (SDP)      |                               |
      |---------------------------->|                               |
      |                             | 10. WEBRTC_ANSWER             |
      |                             |------------------------------>|
      |                             |                               |
      | 11. WEBRTC_ICE_CANDIDATE    | 12. WEBRTC_ICE_CANDIDATE      |
      |<===========================>|<=============================>|
      |                                                             |
      |======== 13. CONEXIÓN DIRECTA P2P (SRTP VIDEO LAN) ==========|
      |                                                             |
      |                             | 14. SCREEN_STREAM_STATS       |
      |<----------------------------|<------------------------------|
      |                             |                               |
      | 15. SCREEN_CAPTURE_STOP     |                               |
      |---------------------------->|                               |
      |                             | 16. Audit Log (DB)            |
      |                             | 17. SCREEN_CAPTURE_STOP       |
      |                             |------------------------------>|
      | 18. WEBRTC_SESSION_CLOSED   | 19. WEBRTC_SESSION_CLOSED     |
      |<----------------------------|------------------------------>|
      |                             |                               | 20. Detiene Captura
      |                             |                               |     Cierra Banner Alumno
```

---

## 3. Candidatos ICE Locales (Host Candidates Only)

En un entorno escolar cerrado sin acceso a Internet:
1. `iceServers` se define como un arreglo vacío `[]` en el navegador del docente y en el agente:
   ```typescript
   const peerConnection = new RTCPeerConnection({
     iceServers: [],
     iceTransportPolicy: 'all',
   });
   ```
2. El agente genera candidatos ICE de tipo `host`:
   ```text
   candidate:1 1 UDP 2130706431 192.168.1.101 50004 typ host
   ```
3. La consola docente y el agente se comunican directamente a nivel de capa 3 IP en el switch LAN.
4. **Ventajas**:
   - Privacidad absoluta: ningún flujo de video sale del recinto educacional.
   - Latencia ultra-baja (inferior a 10 ms).
   - Inmune a cortes del proveedor de Internet (ISP).

---

## 4. Presupuesto de Ancho de Banda para 40 Computadores

En un laboratorio de 40 puestos:

```
40 estaciones en modo Miniatura:
40 * 250 kbps = 10.000 kbps = 10 Mbps de tráfico agregado en la interfaz del profesor.

1 estación en modo Inspección Individual HD:
1 * 2.000 kbps = 2 Mbps.

Tráfico total concurrente máximo: ~12 Mbps.
```

Un switch Ethernet moderno de 1 Gbps o un Access Point Wi-Fi 6 de 1200 Mbps maneja este tráfico utilizando menos del 1.2% de su capacidad nominal de red, garantizando cero congelamientos o sobrecargas en la infraestructura escolar.
