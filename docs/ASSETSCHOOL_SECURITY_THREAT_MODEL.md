# ASSETSCHOOL — MODELO DE AMENAZAS Y SEGURIDAD (STRIDE THREAT MODEL)
## Análisis Formal de Vulnerabilidades, Mitigaciones y Pruebas de Validación (Fase 02.8)

- **Documento:** `docs/ASSETSCHOOL_SECURITY_THREAT_MODEL.md`
- **Versión:** 1.0.0
- **Metodología:** STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)
- **Alcance:** Red Local (LAN), Protocolos UDP/TCP/WebSockets/WebRTC, Nodos Estudiantes, Consola Docente y Servidor Local

---

## 1. PRINCIPIO DE CONFIANZA CERO EN LA RED LOCAL (ZERO TRUST LAN)

En un entorno educativo, la red local **no se considera un entorno seguro**. Se asume como axioma que:
1. Hay estudiantes con habilidades técnicas intermedias y avanzadas capaces de ejecutar escáneres de puertos, sniffers (Wireshark) y herramientas de suplantación ARP.
2. Los dispositivos conectados al aula pueden estar infectados con malware previo.
3. El descubrimiento UDP por sí mismo **nunca debe otorgar confianza ni enrolamiento automático sin validación criptográfica o aprobación docente**.

---

## 2. MATRIZ FORMAL DE AMENAZAS STRIDE

| ID | Categoría STRIDE | Vector de Amenaza | Probabilidad | Impacto | Mitigación Técnica en Arquitectura | Prueba de Validación (Test) |
| :---: | :---: | :--- | :---: | :---: | :--- | :--- |
| **TH-01** | **Spoofing** | **Servidor Docente Falso (Rogue Server)**:<br/>Un estudiante levanta un script en su máquina emitiendo balizas UDP en el puerto 48500 para atraer las conexiones de los agentes de sus compañeros y espiar sus pantallas. | **ALTA** | **CRÍTICO** | **Pinning de Certificado / Confianza Pre-Aprobada**: El agente rechaza conectarse a cualquier servidor cuya clave pública o huella digital (SHA-256) de certificado TLS no coincida con el certificado provisionado durante la instalación. El paquete UDP solo aporta la IP/puerto; no otorga confianza. | Intentar conectar un agente a un servidor con certificado autofirmado no registrado. Verificar desconexión inmediata y log de alerta. |
| **TH-02** | **Spoofing** | **Agente Estudiante Falso (Rogue Agent)**:<br/>Un atacante genera conexiones masivas simuladas al Gateway (`AGENT_HELLO`) para saturar la vista del docente o falsear la presencia de alumnos. | **MEDIA** | **MEDIO** | **Enrolamiento con Clave de Aula / Token de Agente**: El servidor solo transiciona a estado `ACTIVE` a los dispositivos cuya identidad criptográfica (UUID + Hardware ID) esté pre-registrada en la base de datos de la institución o aprobada explícitamente por el docente en consola. | Test de envío de `AGENT_HELLO` con UUID aleatorio no registrado. Verificar estado `PENDING_AUTHORIZATION` sin acceso a streaming. |
| **TH-03** | **Tampering** | **Modificación de Comandos en Tránsito**:<br/>Inyección de paquetes TCP para alterar la orden de un docente (ej. modificar el contenido de un mensaje de bloqueo o desviar un archivo). | **BAJA** | **ALTO** | **Canal Cifrado WSS (TLS 1.3) y Firma Ed25519**: Todo el canal de control WebSocket corre bajo TLS local con cifrado autenticado (AES-GCM o ChaCha20-Poly1305). Opcionalmente, cada comando lleva un envelope firmado. | Inspección de tráfico en Wireshark: el payload es ilegible e imposible de alterar sin invalidar la sesión TLS. |
| **TH-04** | **Tampering** | **Inyección de Archivos Críticos (Path Traversal)**:<br/>Envío de un paquete `FILE_SEND` con rutas relativas manipuladas (`../../Windows/System32/utilman.exe`) para comprometer el sistema operativo del alumno. | **MEDIA** | **CRÍTICO** | **Saneamiento Estricto y Jail Path**: El agente valida que la ruta de destino resuelta (`Path.GetFullPath()`) comience estrictamente por el prefijo de la carpeta segura autorizada (ej. `C:\Users\<User>\Downloads\AssetSchool\`). Cualquier discrepancia aborta la operación con alerta. | Ejecutar suite con payload `fileName: "../../../../Windows/System32/evil.bat"`. Verificar rechazo en agente con error de seguridad. |
| **TH-05** | **Repudiation** | **Negación de Acciones por Parte del Docente o Alumno**:<br/>Un docente apaga equipos indebidamente o un alumno borra un archivo y niega haber participado. | **MEDIA** | **MEDIO** | **Registro de Auditoría Inmutable en PostgreSQL**: Todo comando ejecutado (`LOCK`, `KILL_PROCESS`, `FILE_TRANSFER`, `REMOTE_CONTROL`) se inserta con timestamp, ID de usuario docente, ID de dispositivo y firma en la tabla `audit_logs` con triggers que prohíben `UPDATE` y `DELETE`. | Ejecutar comando `DELETE FROM audit_logs;` y comprobar que el motor PostgreSQL rechaza la transacción con excepción. |
| **TH-06** | **Information Disclosure** | **Espionaje de Pantallas en la Red (LAN Eavesdropping)**:<br/>Un estudiante captura el tráfico de red de la sala para visualizar en vivo la pantalla de otros compañeros o el examen que el profesor está proyectando. | **ALTA** | **CRÍTICO** | **Cifrado DTLS-SRTP P2P en WebRTC**: Las tramas de video viajan encapsuladas en paquetes RTP cifrados con AES-128-GCM mediante claves acordadas por DTLS en el handshake inicial. Es matemáticamente imposible reconstruir la imagen sin la clave privada. | Capturar stream RTP con Wireshark; verificar que los paquetes son datos cifrados sin encabezados decodificables en códec H.264/VP8. |
| **TH-07** | **Information Disclosure** | **Fuga de Datos entre Instituciones (Cross-Tenant Breach)**:<br/>En servidores compartidos entre sedes, un docente de la Sede A accede a los equipos o historial de la Sede B. | **BAJA** | **ALTO** | **Aislamiento Multi-Tenant con Clave Foránea Estricta**: Cada consulta a la base de datos y cada mensaje en el Gateway valida el `institution_id` derivado del token JWT verificado en el servidor. Los WebSockets solo reciben broadcasts de su propia institución. | `tests/tenant-isolation.spec.ts`: Petición con JWT de Institución 1 sobre recursos de Institución 2; comprobar error HTTP 403 Forbidden. |
| **TH-08** | **Denial of Service** | **Inundación de Balizas UDP (UDP Flood en 48500)**:<br/>Un estudiante ejecuta un script que emite miles de paquetes UDP por segundo para saturar la CPU de las máquinas de la sala. | **MEDIA** | **MEDIO** | **Rate Limiting y Filtro en Listener UDP**: El socket de escucha descarta paquetes que excedan un umbral de 2 paquetes por segundo por dirección IP y procesa los mensajes en un hilo secundario con buffer circular fijo. | Enviar ráfaga de 10.000 paquetes UDP/s; monitorear uso de CPU del agente (< 3% CPU y memoria estable). |
| **TH-09** | **Elevation of Privilege** | **Evasión del Telón de Bloqueo por Estudiante**:<br/>Uso de atajos de teclado (`Alt+Tab`, `Win+D`, `Ctrl+Shift+Esc`) o herramientas de terceros para minimizar o cerrar la cortina de bloqueo. | **ALTA** | **ALTO** | **Ganchos de Teclado Win32 (`WH_KEYBOARD_LL`) + TopMost Cíclico**: El hook suprime las teclas en el ring 3 antes de que el Explorador de Windows las reciba. La ventana intercepta `WM_SYSCOMMAND / SC_CLOSE` y se restablece en primer plano ante cualquier cambio de foco. | Presionar repetidamente `Alt+Tab` y `Tecla Windows` en equipo bloqueado; verificar que ninguna ventana se superpone al telón. |
| **TH-10** | **Elevation of Privilege** | **Secuestro de Pipe Local (Named Pipe Hijacking)**:<br/>Un proceso malicioso de un estudiante intenta conectarse al Named Pipe del servicio de sistema para ejecutar comandos con permisos de `SYSTEM`. | **MEDIA** | **CRÍTICO** | **Descriptor de Seguridad (DACL) Estricto e Impersonación**: El Named Pipe solo concede permisos de conexión al SID de la sesión del usuario interactivo verificado. El servicio llama a `ImpersonateNamedPipeClient()` antes de operar. | Intentar conectar al Named Pipe desde un usuario con cuenta secundaria no autorizada; comprobar `ERROR_ACCESS_DENIED`. |

---

## 3. ESPECIFICACIÓN DEL DESCUBRIMIENTO UDP SEGURO

El protocolo de descubrimiento por broadcast UDP (puerto `48500`) opera bajo un modelo de **Señalización Informativa Desconfiada**:

```
[Servidor Docente]                                [Agente Estudiante]
       |                                                   |
       |----- (1) UDP Broadcast :48500 (Presencia) ------->|  (Extrae IP:Puerto)
       |                                                   |
       |<==== (2) TCP Connect :3000 (TLS Handshake) =======|  (Valida Certificado TLS)
       |                                                   |  (Si no coincide: ABORTA)
       |<==== (3) AGENT_HELLO (Identity + Proof) ==========|
       |                                                   |
   [¿Registrado?]                                          |
    /         \                                            |
 (No)         (Sí)                                         |
  |             |                                          |
[Enrolar]   [Aceptar] === (4) SERVER_HELLO_ACK ===========>|  (Sesión Autorizada)
```

1. **Recepción Pasiva**: El agente solo usa el paquete UDP para descubrir la IP local dinámica del docente.
2. **Validación de Identidad**: Al abrir la conexión TCP (puerto 3000), el agente verifica la cadena de confianza TLS o la huella pública del servidor.
3. **Control Docente de Enrolamiento**: Si una máquina nunca ha pertenecido a ese laboratorio, queda en cola de aprobación ("Nuevo equipo detectado"). La pantalla del estudiante **no se transmite** hasta que el docente confirme la vinculación en la interfaz gráfica.
