# AssetSchool

> **Plataforma Profesional de Gestión, Supervisión y Control de Aulas Informáticas (LAN-First)**  
> *Fase 01: Fundación Arquitectónica y Estructura del Sistema*

AssetSchool es un sistema de software original de clase empresarial y pedagógica diseñado para operar de forma prioritaria en redes locales (LAN) de colegios, institutos y universidades, sin dependencia de internet ni servicios de nube de terceros.

---

## 🏛️ Arquitectura General

```
assetschool/
  apps/
    teacher-web/          # Consola Web Docente y Administrativa (React 19 + Vite)
    local-server/         # Servidor Central de Red Local (NestJS + Socket.IO)

  agents/
    windows-agent/        # Agente nativo Windows 10/11 (.NET 8 C#)
    macos-agent/          # Agente nativo macOS Ventura/Sonoma (Swift 5.9+)
    linux-agent/          # Agente nativo Linux X11/Wayland (Rust)
    chromeos-agent/       # Agente administrado ChromeOS (Extension MV3)

  packages/
    shared-types/         # Interfaces de dominio, entidades y contratos
    protocol/             # Protocolo binario/JSON, envelopes y tipos de paquetes LAN
    ui-components/        # Tokens de diseño visual e identidad corporativa
    permissions/          # Matriz de control de acceso basada en roles (RBAC)
    validators/           # Esquemas de validación en tiempo de ejecución con Zod

  infrastructure/
    docker/               # Dockerfiles optimizados para servidor y web
    postgres/             # Migraciones versionadas (001_initial_schema.sql) y datos de prueba
    certificates/         # Generador de certificados TLS locales autorizados
    networking/           # Especificación y guía de puertos y topología LAN

  docs/                   # Documentación arquitectónica obligatoria
    architecture/         # SYSTEM_ARCHITECTURE, NETWORK_ARCHITECTURE, AGENT_ARCHITECTURE, ROADMAP
    api/                  # API_SPECIFICATION
    security/             # SECURITY_MODEL
    installation/         # LOCAL_DEPLOYMENT
```

---

## 🚀 Inicio Rápido

### Con Docker Compose (Entorno Producción Local)
```bash
docker compose up -d
```
- Consola Web Docente: `http://localhost:5173`
- API Servidor Local: `http://localhost:3000/api/v1`

### En Modo Desarrollo Local (Node.js)
```bash
# 1. Instalar dependencias
npm install

# 2. Compilar paquetes base
npm run build --workspace=@assetschool/shared-types
npm run build --workspace=@assetschool/protocol
npm run build --workspace=@assetschool/permissions
npm run build --workspace=@assetschool/validators
npm run build --workspace=@assetschool/ui-components

# 3. Iniciar Backend (NestJS)
npm run server:dev

# 4. Iniciar Frontend (Vite)
npm run web:dev
```

---

## 🔐 Credenciales de Demostración

| Perfil | Correo | Contraseña |
| :--- | :--- | :--- |
| **Docente** | `profesor@assetschool.lan` | `Docente123!*` |
| **Administrador TIC** | `admin@assetschool.lan` | `Admin123!*` |

---

## 📋 Módulos del Sistema (14 Secciones)
1. **Dashboard**: Métricas en vivo de red LAN, estado del servidor y estaciones de prueba identificadas.
2. **Monitor de aula**: Cuadrícula de pantallas de los alumnos.
3. **Control de aula**: Bloqueo de teclado/ratón, transmisión de pantalla, blackout y audio.
4. **Estudiantes**: Padrón escolar y asignación a puestos.
5. **Cursos**: Periodos académicos y materias.
6. **Salas**: Laboratorios y subredes LAN.
7. **Computadores**: Inventario de hardware, agentes y revocación de seguridad.
8. **Evaluaciones**: Cuestionarios en vivo con corrección automática.
9. **Aplicaciones**: Restricción y control de procesos.
10. **Internet**: Listas blancas y negras de dominios web.
11. **Inventario TIC**: Especificaciones de hardware (CPU, RAM, Disco, GPU).
12. **Informes**: Asistencia y estadísticas de uso de laboratorio.
13. **Auditoría**: Trazabilidad inmutable de directivas.
14. **Configuración**: Claves criptográficas, certificados TLS y puertos de red.

---

## ⚖️ Principios de Privacidad y Ética
AssetSchool **no incluye keyloggers, captura encubierta ni herramientas de espionaje**. La supervisión es estrictamente pedagógica, institucionalmente consentida y visible para los estudiantes en todo momento.
