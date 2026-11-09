# AssetSchool — Hoja de Ruta de Desarrollo (Roadmap Multietapa)

## Fase 01: Fundación Arquitectónica y Estructura del Sistema (COMPLETADA)
- [x] Monorepositorio organizado con espacios de trabajo npm.
- [x] Paquetes compartidos tipados (`shared-types`, `protocol`, `permissions`, `validators`, `ui-components`).
- [x] Servidor central NestJS con arquitectura modular, autenticación JWT, RBAC y WebSocket Gateway.
- [x] Modelo relacional PostgreSQL con 19 entidades, migraciones versionadas y datos de semilla.
- [x] Configuración de infraestructura (Docker Compose, certificados TLS locales, guía de red LAN).
- [x] Estructura formal y reporte de capacidades veraces de agentes nativos (Windows, macOS, Linux, ChromeOS).
- [x] Consola Web profesional docente y administrativa (React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons).
- [x] Cuadrícula y dashboard de control de aula con clara distinción de datos de prueba (`DEMO`).
- [x] 14 módulos de navegación del sistema implementados.
- [x] Pruebas automatizadas de unidad y funcionamiento.

---

## Fase 02: Transmisión de Pantalla y Streaming WebRTC LAN
- [ ] Implementación de canal WebRTC P2P en el Agente de Windows (`Windows.Graphics.Capture`).
- [ ] Implementación de ScreenCaptureKit en el Agente de macOS con solicitud interactiva de permisos TCC.
- [ ] Implementación de PipeWire ScreenCast Portal en el Agente de Linux.
- [ ] Receptor WebRTC optimizado en la consola web para vista simultánea tipo matriz (hasta 40 pantallas por aula).
- [ ] Transmisión inversa de pantalla del profesor hacia las estaciones de los estudiantes (Show Teacher Screen).

---

## Fase 03: Control Remoto e Inyección de Eventos
- [ ] Inyección de eventos de ratón y teclado controlados por el docente (toma de control solicitada o directa).
- [ ] Mecanismos nativos de bloqueo de periféricos (`BlockInput`, CGEventTap, libinput inhibitor).
- [ ] Cortina de pantalla negra (Blackout curtain) con logotipo institucional visible.
- [ ] Chat bidireccional en tiempo real entre alumno y profesor para resolución de dudas en aula.

---

## Fase 04: Restricciones de Red, Procesos y Transferencia de Archivos
- [ ] Agente de filtrado web local sin proxy externo (`declarativeNetRequest` en ChromeOS, WFP en Windows).
- [ ] Bloqueo de aplicaciones restringidas (juegos, clientes de mensajería no autorizados).
- [ ] Módulo de distribución y recolección masiva de archivos de tareas y exámenes vía TCP local rápido.
- [ ] Control de almacenamiento extraíble USB institucional.

---

## Fase 05: Evaluaciones en Vivo e Inventario TIC Avanzado
- [ ] Editor y ejecutor de pruebas con bloqueo de entorno de examen (modo quiosco seguro).
- [ ] Exportación de reportes de asistencia y tiempo en aplicaciones pedagógicas en formatos PDF y Excel.
- [ ] Inventario automatizado de componentes de hardware y licencias de software en toda la red de laboratorios.
- [ ] Auditoría de conformidad y generación de instaladores desatendidos (MSI, PKG, DEB, RPM).
