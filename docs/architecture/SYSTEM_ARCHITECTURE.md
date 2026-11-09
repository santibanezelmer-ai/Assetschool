# AssetSchool — Arquitectura General del Sistema

## 1. Visión y Propósito
**AssetSchool** es una solución de gestión, supervisión y control de aulas informáticas diseñada con un enfoque **LAN-first**: opera con latencia ultrabaja dentro de la red local del colegio o universidad, sin depender de conectividad a la nube o servicios de terceros (como Firebase o Supabase).

## 2. Diagrama de Bloques Arquitectónicos

```mermaid
flowchart TB
    subgraph Consolas_Web [Consolas de Usuario]
        TeacherWeb["AssetSchool Teacher Web\n(React 19 + TypeScript + Vite)"]
        AdminWeb["AssetSchool Admin Web\n(React 19 + TypeScript + Vite)"]
    end

    subgraph Servidor_Local [AssetSchool Core Local Server]
        NestCore["NestJS Core API\n(Autenticación, Sesiones, Políticas)"]
        SocketGateway["Socket.IO Agent Gateway\n(Puerto 48501 TCP)"]
        UdpDiscovery["Módulo UDP Broadcast\n(Puerto 48500 UDP)"]
    end

    subgraph Base_Datos [Almacenamiento Relacional Local]
        Postgres["PostgreSQL 16\n(Multi-institucional, UUID, Migraciones)"]
    end

    subgraph Agentes_Nativos [Estaciones de Alumnos en LAN]
        WinAgent["Windows Agent\n(C# / .NET 8 Win32)"]
        MacAgent["macOS Agent\n(Swift 5.9+ ScreenCaptureKit)"]
        LinuxAgent["Linux Agent\n(Rust PipeWire/X11)"]
        ChromeAgent["ChromeOS Agent\n(Extension MV3 DeclarativeNet)"]
    end

    TeacherWeb -->|REST / HTTPS 3000| NestCore
    TeacherWeb -.->|WebRTC Signaling P2P| SocketGateway
    AdminWeb -->|REST / HTTPS 3000| NestCore

    NestCore --> Postgres
    SocketGateway <--> NestCore
    UdpDiscovery -.->|Broadcast Anuncio LAN| Agentes_Nativos

    WinAgent <-->|WebSocket Seguro 48501| SocketGateway
    MacAgent <-->|WebSocket Seguro 48501| SocketGateway
    LinuxAgent <-->|WebSocket Seguro 48501| SocketGateway
    ChromeAgent <-->|WebSocket Seguro 48501| SocketGateway

    TeacherWeb <===>|WebRTC LAN Screen Stream| WinAgent
    TeacherWeb <===>|WebRTC LAN Screen Stream| MacAgent
    TeacherWeb <===>|WebRTC LAN Screen Stream| LinuxAgent
```

## 3. Componentes Principales

### 3.1. AssetSchool Teacher & Admin (Frontend Web)
- **Tecnologías**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, React Router v7.
- **Responsabilidad**: Interfaz moderna, reactiva, accesible y con soporte para modo claro/oscuro. Ofrece monitorización simultánea de pantallas en cuadrícula, emisión de directivas pedagógicas (bloqueo, transmisión de pantalla, control de procesos), administración de salas, cursos y estudiantes.

### 3.2. AssetSchool Core (Backend Servidor Local)
- **Tecnologías**: Node.js v24, NestJS 10, REST API, WebSocket (Socket.IO), JWT, Bcrypt.
- **Responsabilidad**: Servidor centralizado local. Gestiona la autenticación institucional con control de acceso basado en roles (RBAC), control del ciclo de vida de sesiones de aula, registro criptográfico de dispositivos y enrutamiento seguro de comandos hacia los agentes.

### 3.3. Base de Datos (PostgreSQL 16)
- Modelo relacional íntegro con 19 entidades, UUIDs nativos, restricciones foráneas, índices de alto rendimiento y segregación por institución educativa.

### 3.4. Agentes Nativos Multiplataforma
- Implementados en lenguajes nativos compilados optimizados para su respectivo sistema operativo, respetando estrictamente los modelos de seguridad de cada plataforma sin simular características imposibles.
