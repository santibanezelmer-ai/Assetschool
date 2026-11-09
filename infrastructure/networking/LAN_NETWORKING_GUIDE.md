# AssetSchool — Guía de Configuración de Red LAN y Descubrimiento

## 1. Topología y Puertos de Red

AssetSchool está diseñado para operar con latencia mínima dentro de la red local del establecimiento educativo (LAN), sin requerir acceso a internet.

| Servicio | Protocolo | Puerto | Función |
| :--- | :--- | :--- | :--- |
| API REST Servidor | TCP / HTTPS | `3000` | Autenticación, gestión de sesiones, inventario |
| Consola Docente Web | TCP / HTTP(S) | `5173` o `80` | Interfaz gráfica para el profesor |
| WebSocket Gateway | TCP / WSS | `48501` | Enlace permanente bidireccional Servidor <-> Agentes |
| Descubrimiento LAN | UDP Broadcast | `48500` | Auto-detección del servidor por parte de los agentes |
| Streaming WebRTC | UDP | Dinámico `49152-65535` | Transmisión de pantalla en tiempo real (P2P LAN) |

## 2. Mecanismo de Descubrimiento de Agentes (Zero-Config)

1. **Broadcast del Servidor**:
   El servidor emite periódicamente un datagrama UDP en la subred local (`255.255.255.255:48500` o la IP de broadcast de la subred configurada, ej: `192.168.1.255:48500`).
   ```json
   {
     "service": "ASSETSCHOOL_SERVER",
     "institutionCode": "CPC-01",
     "version": "1.0.0",
     "wsUrl": "wss://192.168.1.100:48501",
     "apiUrl": "https://192.168.1.100:3000"
   }
   ```
2. **Escucha y Conexión del Agente**:
   El agente escucha en el puerto UDP 48500. Al recibir el anuncio válido del servidor institucional, inicia la conexión segura WebSocket hacia el puerto 48501.

3. **Fallback por Configuración**:
   Si la red del colegio tiene segmentación por VLANs con bloqueo de broadcast UDP, el agente permite configurar la IP estática o hostname del servidor (`ASSETSCHOOL_SERVER_HOST=192.168.1.100`).
