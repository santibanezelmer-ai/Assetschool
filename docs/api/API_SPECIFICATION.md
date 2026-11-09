# AssetSchool — Especificación de API REST (v1.0)

## 1. Convenciones Generales
- **Base URL**: `http://<server-ip>:3000/api/v1`
- **Formato de Carga**: `application/json`
- **Autenticación**: `Authorization: Bearer <jwt_token>`
- **Códigos de Estado**:
  - `200 OK`: Operación exitosa.
  - `201 Created`: Recurso creado.
  - `400 Bad Request`: Error de validación de esquema (Zod).
  - `401 Unauthorized`: Token no provisto o expirado.
  - `403 Forbidden`: Privilegios insuficientes (RBAC).
  - `404 Not Found`: Recurso no encontrado.

## 2. Endpoints de Autenticación
### `POST /api/v1/auth/login`
Autentica a un usuario institucional y devuelve un token de acceso JWT.
- **Body**:
  ```json
  {
    "email": "profesor@assetschool.lan",
    "password": "Docente123!*"
  }
  ```
- **Respuesta 200**:
  ```json
  {
    "accessToken": "eyJhbGciOi...",
    "user": {
      "id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
      "email": "profesor@assetschool.lan",
      "firstName": "Mariana",
      "lastName": "Fuentes",
      "role": "TEACHER",
      "institutionId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    },
    "expiresIn": "8h"
  }
  ```

### `GET /api/v1/auth/me`
Devuelve el perfil del usuario activo autenticado. Requiere Bearer Token.

---

## 3. Endpoints de Dashboard
### `GET /api/v1/dashboard/stats`
Obtiene las métricas en tiempo real de computadores, estado del servidor y topología LAN.
- **Respuesta 200**:
  ```json
  {
    "totalRegisteredDevices": 4,
    "connectedDevices": 2,
    "disconnectedDevices": 1,
    "availableClassrooms": 2,
    "activeSessions": 1,
    "serverStatus": {
      "status": "online",
      "uptimeSeconds": 360,
      "memoryUsageMb": 85,
      "version": "1.0.0-phase1",
      "nodeVersion": "v24.22.0"
    },
    "lanStatus": {
      "interfaceName": "en0",
      "localIp": "192.168.1.100",
      "subnet": "255.255.255.0",
      "broadcastIp": "192.168.1.255",
      "multicastDiscoveryActive": true,
      "activeAgentSockets": 2
    },
    "recentEvents": [...]
  }
  ```

---

## 4. Endpoints de Dispositivos y Agentes
### `GET /api/v1/devices`
Lista los equipos registrados. Parámetros opcionales: `?classroomId=...&includeDemo=true`.

### `POST /api/v1/devices/register`
Inscripción inicial del agente de una estación de trabajo en la red institucional.
- **Body**:
  ```json
  {
    "institutionCode": "CPC-01",
    "hostname": "LAB01-PC-01",
    "macAddress": "02:42:AC:11:00:02",
    "localIp": "192.168.1.101",
    "osType": "windows",
    "osVersion": "Windows 11 Pro 23H2",
    "architecture": "x86_64",
    "agentVersion": "1.0.0",
    "publicKey": "ssh-ed25519-...",
    "capabilities": {
      "canScreenBroadcast": true,
      "canScreenReceive": true,
      "canRemoteInput": true,
      "canLockInput": true,
      "canBlackoutScreen": true,
      "canFileTransfer": true,
      "canProcessBlock": true,
      "canUrlBlock": true,
      "canChat": true,
      "canExecuteCommand": true,
      "canCollectHardwareInventory": true
    }
  }
  ```

### `POST /api/v1/devices/:id/revoke`
Revoca el acceso de un computador en la red institucional. Requiere rol `INSTITUTION_ADMIN` o `TECH_SUPPORT`.

---

## 5. Endpoints de Comandos Remotos
### `POST /api/v1/commands/dispatch`
Emite un comando pedagógico hacia una o varias estaciones de trabajo. Requiere rol `TEACHER` o superior.
- **Body**:
  ```json
  {
    "classroomSessionId": "s1111111-1111-1111-1111-111111111111",
    "deviceIds": ["01010101-0101-0101-0101-010101010101"],
    "commandType": "LOCK_SCREEN",
    "params": {}
  }
  ```

---

## 6. Endpoints de Auditoría
### `GET /api/v1/audit`
Consulta el registro cronológico inmutable de seguridad. Requiere rol administrativo.
