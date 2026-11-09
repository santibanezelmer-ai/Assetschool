# AssetSchool — Política de Privacidad, Ética y Supervisión de Pantalla (Fase 02)

## 1. Principios Éticos Fundamentales
AssetSchool es una herramienta pedagógica diseñada exclusivamente para la gestión de aula y asistencia técnica en laboratorios escolares. Rechaza categóricamente cualquier funcionalidad asociada a software espía (spyware), malware o vigilancia subrepticia.

### Declaración de Principios:
1. **Consentimiento y Transparencia**: Todo estudiante debe ser consciente de cuándo y por quién está siendo supervisada su pantalla.
2. **Cero Grabación Oculta**: No existen procesos en segundo plano que graben o transmitan video sin un indicador visible activo en la sesión del usuario.
3. **Cero Keylogging**: AssetSchool no incluye registradores de pulsaciones de teclado, inspectores de portapapeles ni captura de credenciales.
4. **Cero Streaming en la Nube**: Los cuadros de video no se transmiten a servidores externos ni se almacenan en la nube.
5. **Aislamiento Multi-Institucional Estricto**: Un docente de una institución jamás puede ver ni controlar dispositivos de otra escuela (verificado por constraints en PostgreSQL).

---

## 2. Indicador Visual Obligatorio en la Pantalla del Estudiante

Cada agente nativo implementa un indicador visible permanente mientras la captura esté en ejecución:

- **Windows**: Un banner flotante superior de color rojo carmesí (`CaptureIndicatorOverlay`) con el texto:
  > `🔴 Tu pantalla está siendo supervisada por el docente — AssetSchool`
- **macOS**: Un panel flotante superior del sistema (`CaptureIndicatorWindow`) visible sobre todas las ventanas.
- **Linux**: Un diálogo o notificación persistente en la barra de escritorio del entorno gráfico (GNOME/KDE/XFCE).
- **ChromeOS**: Una notificación persistente en el centro de notificaciones y banner en la pestaña del navegador.

> [!IMPORTANT]
> El indicador no puede ser minimizado, ocultado ni cancelado por software de terceros mientras la sesión WebRTC permanezca abierta.

---

## 3. Detención Inmediata y Resiliencia de Privacidad

La captura de pantalla se detiene inmediatamente ante cualquiera de los siguientes eventos:
1. **Orden del Profesor**: El profesor hace clic en "Detener Transmisión" en la consola web (`SCREEN_CAPTURE_STOP`).
2. **Cierre de Sesión o Aula**: El profesor sale de la consola o cambia de aula.
3. **Pérdida de Conexión LAN**: Si se interrumpe la conexión entre el agente y el servidor local por más de 35 segundos, el agente corta el flujo de video automáticamente.
4. **Revocación Administrativa**: Si el equipo es marcado como `is_revoked = true` en la base de datos PostgreSQL, el servidor corta instantáneamente el streaming y desconecta el agente.

---

## 4. Trazabilidad y Auditoría en Base de Datos

Cada inicio y fin de captura se registra en la tabla `audit_logs` de PostgreSQL:

| Campo | Descripción |
| :--- | :--- |
| `id` | UUID único del registro de auditoría |
| `institution_id` | Identificador de la institución escolar |
| `actor_user_id` | UUID del docente que inició la supervisión |
| `action` | `SCREEN_CAPTURE_START` o `SCREEN_CAPTURE_STOP` |
| `entity_type` | `DEVICE` |
| `entity_id` | UUID del computador supervisado |
| `ip_address` | Dirección IP LAN del docente solicitante |
| `details_json` | Calidad de streaming, tasa de cuadros objetivo y duración en ms |
| `timestamp` | Marca de tiempo inmutable con zona horaria |

> [!NOTE]
> El video en sí **no se almacena en disco ni en base de datos**, garantizando el cumplimiento de leyes internacionales de privacidad de datos de menores (FERPA, COPPA, RGPD).
