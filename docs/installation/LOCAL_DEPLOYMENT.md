# AssetSchool — Guía de Despliegue Local (LAN)

Esta guía explica el procedimiento paso a paso para levantar la plataforma completa de AssetSchool en un entorno local o servidor institucional LAN.

---

## 1. Requisitos Previos

- **Node.js**: Versión 20 LTS o 24 LTS instalada.
- **npm**: Versión 10+ (incluida con Node).
- **Docker y Docker Compose**: (Opcional si se ejecuta PostgreSQL en contenedor).
- **PostgreSQL 16**: (Si se utiliza base de datos nativa en lugar de Docker).

---

## 2. Opción A: Despliegue Automatizado con Docker Compose (Recomendado)

En la raíz del repositorio:

```bash
# 1. Iniciar base de datos PostgreSQL, servidor central y frontend
docker compose up -d

# 2. Verificar que los contenedores estén activos
docker compose ps

# 3. Acceder a las interfaces:
# - Consola Docente Web: http://localhost:5173
# - Servidor Core API:   http://localhost:3000/api/v1
```

PostgreSQL aplicará automáticamente las migraciones iniciales ubicadas en `infrastructure/postgres/migrations/`.

---

## 3. Opción B: Ejecución en Entorno de Desarrollo Local

Si deseas ejecutar o depurar los servicios directamente en tu máquina:

### Paso 1: Instalación de dependencias
```bash
# Desde la raíz de assetschool/
npm install
```

### Paso 2: Compilación de paquetes compartidos
```bash
npm run build --workspace=@assetschool/shared-types
npm run build --workspace=@assetschool/protocol
npm run build --workspace=@assetschool/permissions
npm run build --workspace=@assetschool/validators
npm run build --workspace=@assetschool/ui-components
```

### Paso 3: Iniciar el Servidor Central (NestJS)
```bash
# Inicia en el puerto 3000
npm run server:dev
```
*Nota: Si PostgreSQL no está levantado en tu máquina, el servidor activa automáticamente su motor en memoria con los datos de semilla para que puedas operar de inmediato.*

### Paso 4: Iniciar la Consola Web (Vite + React 19)
```bash
# En una nueva terminal:
npm run web:dev
```
Abre tu navegador en `http://localhost:5173`.

---

## 4. Credenciales de Acceso Inicial

| Rol | Usuario | Contraseña |
| :--- | :--- | :--- |
| **Docente de Aula** | `profesor@assetschool.lan` | `Docente123!*` |
| **Administrador TIC** | `admin@assetschool.lan` | `Admin123!*` |

Ambos perfiles cuentan con botones de precarga rápida en la pantalla de inicio de sesión (`/login`).
