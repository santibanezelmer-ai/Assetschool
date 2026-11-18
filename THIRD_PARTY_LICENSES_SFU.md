# ASSETSCHOOL — INVENTARIO DE COMPONENTES DE TERCEROS Y LICENCIAS (SFU ENGINE)

Este documento certifica el análisis de propiedad intelectual y cumplimiento legal para la incorporación del motor SFU (Selective Forwarding Unit) en la plataforma comercial y propietaria **AssetSchool**.

---

## 1. COMPONENTE PRINCIPAL: MEDIASOUP

| Componente | Versión | Licencia | Autor / Titular de Copyright | Términos de Distribución Comercial |
| :--- | :--- | :--- | :--- | :--- |
| **mediasoup** | `3.14.16` | **ISC License** | © 2017-2024 Iñaki Baz Castillo `<ibc@aliax.net>` | **100% Compatible**. Licencia permisiva tipo BSD/MIT. Permite su uso en código cerrado, distribución binaria comercial y enlaces propietarios sin obligación de liberar código fuente. |

### Texto de la Licencia ISC de Mediasoup:
```
Copyright (c) 2017-2024 Iñaki Baz Castillo <ibc@aliax.net>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

---

## 2. DEPENDENCIAS TRANSITIVAS DE MEDIASOUP (NODE.JS)

Todas las dependencias directas y transitivas han sido auditadas. **Ninguna incluye GPL, AGPL ni licencias con copyleft recíproco**:

| Paquete | Versión | Licencia | Propósito |
| :--- | :--- | :--- | :--- |
| `h264-profile-level-id` | `^2.0.0` | **Apache-2.0** | Parsing de perfiles H.264 para negociación SDP |
| `flatbuffers` | `^24.3.25` | **Apache-2.0** | Serialización binaria de alta velocidad para IPC C++ |
| `debug` | `^4.3.7` | **MIT** | Trazabilidad y diagnósticos de logging |
| `node-fetch` | `^3.3.2` | **MIT** | Cliente HTTP ligero para descargas seguras |
| `supports-color` | `^9.4.0` | **MIT** | Detección de capacidades de terminal |
| `tar` | `^7.4.3` | **ISC** | Extracción segura de precompilados de worker |
| `ini` | `^5.0.0` | **ISC** | Parsing de configuración |
| `@types/ini` | `^4.1.1` | **MIT** | Tipado estático TypeScript |

---

## 3. DEPENDENCIAS INTERNAS DEL WORKER (C++)

El ejecutable nativo `mediasoup-worker` compila y enlaza internamente las siguientes bibliotecas abiertas de grado industrial:

| Biblioteca C++ | Licencia | Función en Mediasoup |
| :--- | :--- | :--- |
| **libuv** | **MIT** | Bucle de eventos asíncronos y sockets de red de alto rendimiento |
| **OpenSSL / BoringSSL** | **Apache-2.0 / OpenSSL** | Criptografía DTLS, cifrado SRTP y generación de certificados |
| **libsrtp** | **BSD 3-Clause** | Cifrado y descifrado de flujos multimedia SRTP en tiempo real |
| **usrsctp** | **BSD 2-Clause** | Soporte de WebRTC DataChannels SCTP |
| **abseil-cpp** | **Apache-2.0** | Primitivas de concurrencia y estructuras de datos de Google |

---

## 4. CERTIFICACIÓN DE NO CONTAMINACIÓN GPL

- **Veyon (GPLv3):** Cero líneas de código, bibliotecas o encabezados de Veyon han sido incorporados en AssetSchool.
- **Janus WebRTC Gateway (GPLv3):** Descartado formalmente para preservar la naturaleza de código cerrado y distribución comercial de AssetSchool.
- **AssetSchool Source Code:** El código de AssetSchool en `apps/local-server`, `packages/protocol`, `apps/master-macos`, `apps/master-windows`, `agents/macos-agent` y `agents/student-windows` permanece **100% propietario y protegido**.
