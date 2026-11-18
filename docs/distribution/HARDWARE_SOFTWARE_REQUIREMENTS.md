# REQUISITOS DE HARDWARE Y SOFTWARE (ASSETSCHOOL)

Especificaciones técnicas mínimas y recomendadas para la operación de la suite AssetSchool en establecimientos educativos.

---

## 1. EQUIPOS DE ESTUDIANTES (ASSETSCHOOL STUDENT)

| Recurso | Requisito Mínimo | Requisito Recomendado |
| :--- | :--- | :--- |
| **Sistema Operativo** | Windows 10 (64-bit, v1909+) / macOS 13 Ventura | Windows 11 (23H2+) / macOS 14 Sonoma o 15 Sequoia |
| **Procesador (CPU)** | Intel Core i3 (4ta Gen) / AMD Ryzen 3 / Apple Silicon M1 | Intel Core i5 (8va Gen+) / Ryzen 5 / Apple M2 o superior |
| **Memoria RAM** | 4 GB | 8 GB o superior |
| **Almacenamiento** | 200 MB de espacio libre | 1 GB SSD |
| **Tarjeta de Red** | Ethernet 100 Mbps o Wi-Fi 802.11n (2.4 GHz) | Gigabit Ethernet (1 Gbps) o Wi-Fi 5/6 (5 GHz) |
| **Pantalla** | 1280 × 720 (720p) | 1920 × 1080 (1080p Full HD) |

---

## 2. EQUIPOS DE PROFESORES (ASSETSCHOOL MASTER)

| Recurso | Requisito Mínimo | Requisito Recomendado |
| :--- | :--- | :--- |
| **Sistema Operativo** | Windows 10 (64-bit) / macOS 14 Sonoma | Windows 11 / macOS 15 Sequoia |
| **Procesador (CPU)** | Intel Core i5 (4 núcleos) / Apple M1 | Intel Core i7 (6+ núcleos) / Apple Silicon M2/M3 Pro |
| **Memoria RAM** | 8 GB | 16 GB |
| **Aceleración Gráfica** | GPU compatible con DirectX 11 / Metal | GPU dedicada (Intel Iris Xe, Nvidia GTX, Apple GPU) |
| **Red** | Wi-Fi 5 GHz o Ethernet 1 Gbps | Conexión cableada Gigabit Ethernet |

---

## 3. SERVIDOR INSTITUCIONAL (ASSETSCHOOL SERVER)

Para aulas de hasta 40 estudiantes en modalidad local (en la laptop del profesor) o servidores dedicados para 200+ estaciones simultáneas en el colegio:

| Métrica | Modalidad Local (Profesor) | Modalidad Dedicada (Colegio: 100-300 Puestos) |
| :--- | :--- | :--- |
| **Uso de CPU** | 2 núcleos lógicos dedicados | 4 a 8 núcleos dedicados (ej: Xeon, EPYC, Core i7) |
| **Memoria RAM Servidor** | 1 GB adicional para Node/Postgres | 4 GB a 8 GB dedicados |
| **Base de Datos** | PostgreSQL 15/16 local | PostgreSQL 16 con SSD de alto IOPS |
| **Ancho de Banda LAN** | 20 - 40 Mbps (distribución WebRTC H.264) | 100 - 300 Mbps agregados en switch central |
| **Rango UDP SFU** | 40000 - 40999 (1000 puertos) | 40000 - 40999 (1000 puertos) |
