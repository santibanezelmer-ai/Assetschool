# AssetSchool Agent — ChromeOS

## Tecnologías
- **Modelo**: Extensión Manifest V3 (MV3) para Google Chrome / ChromeOS Managed Devices
- **Distribución**: Google Workspace Admin Console (Forced Install Policy)

## Declaración de Capacidades y Restricciones Reales
A diferencia de los agentes nativos de Windows, macOS y Linux, ChromeOS impone un modelo de caja de arena (Sandbox) estricto:
- **No Simulación**: No se simulan funciones que requieran privilegios de root/sistema operativo.
- **Filtrado Web**: Se realiza a través de la API `declarativeNetRequest`, aplicando las listas de bloqueo dictadas por el profesor en la sesión.
- **Transmisión de Pantalla Docente**: Los estudiantes pueden recibir la señal de video del profesor en una ventana maximizada utilizando WebRTC estándar en el navegador.
- **Identificación de Dispositivo**: Se obtiene el número de serie administrado a través de `chrome.enterprise.deviceAttributes.getDeviceSerialNumber()`.
