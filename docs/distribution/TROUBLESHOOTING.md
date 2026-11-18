# RESOLUCIÓN DE PROBLEMAS Y DIAGNÓSTICO (ASSETSCHOOL)

Guía de resolución de incidencias técnicas en instalación, red, audio/video y servicios del sistema.

---

## 1. PROBLEMAS DE DESCUBRIMIENTO Y CONECTIVIDAD DE RED

### Síntoma: Master no detecta el servidor en el aula
- **Causa 1:** El router o switch del colegio tiene deshabilitado el broadcast UDP en el puerto `48500`.
  - **Solución:** Configure en Master la IP fija del servidor en lugar de detección automática (ej: `http://192.168.1.100:3000`).
- **Causa 2:** El Firewall de Windows o el Filtro de macOS bloquea las conexiones entrantes al puerto 3000.
  - **Solución:**
    - En Windows: `netsh advfirewall firewall add rule name="AssetSchool Port 3000" dir=in action=allow protocol=TCP localport=3000`
    - En macOS: Verifique en *Ajustes del Sistema > Red > Firewall* que la aplicación no esté bloqueada.

---

## 2. PROBLEMAS DE TRANSMISIÓN MULTIMEDIA Y MINIATURAS (SFU MEDIASOUP)

### Síntoma: La pantalla docente no llega a los alumnos o las miniaturas aparecen en negro
- **Causa 1 (macOS):** Falta autorización de Grabación de Pantalla (TCC).
  - **Solución:** Ejecute en el equipo afectado:
    ```bash
    open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
    ```
    Marque la casilla correspondiente a **AssetSchool Master** o **AssetSchool Student** y reinicie la aplicación.
- **Causa 2 (Red LAN):** Los puertos UDP 40000 a 40999 de WebRTC están bloqueados entre subredes.
  - **Solución:** Asegúrese de que el switch o firewall interno de la escuela permita tráfico UDP en el rango `40000-40999` entre la VLAN de profesores y la VLAN de alumnos.
- **Causa 3:** El servidor está publicando `127.0.0.1` en vez de su IP LAN alcanzable.
  - **Solución:** Verifique en `config/assetschool-server-config.json` que `sfu.announcedIp` coincida con la IP física de la interfaz de red (ej: `192.168.50.126`).

---

## 3. PROBLEMAS EN WINDOWS SERVICE (STUDENT)

### Síntoma: El servicio `AssetSchoolStudentService` no arranca
- **Diagnóstico:** Revise el Visor de Eventos de Windows (`eventvwr.msc > Registros de Windows > Aplicación`) o consulte:
  ```powershell
  Get-Content -Tail 50 "C:\ProgramData\AssetSchool\Student\logs\service.stderr.log"
  ```
- **Causa Habitual:** Falta el runtime de .NET 8 Desktop Runtime en la máquina de destino si se usó una compilación dependiente del framework.
  - **Solución:** Utilice siempre los instaladores oficiales autocontenidos (`--self-contained true`), los cuales incorporan el runtime de .NET 8 sin requerir preinstalación.

---

## 4. PROBLEMAS DE LICENCIAMIENTO

### Síntoma: "Licencia Inválida: FIRMA_INVALIDA" o "LIMITE_EXCEDIDO"
- **Causa 1:** El archivo `.aslic` fue editado manualmente, alterando su firma criptográfica RSA-SHA256.
  - **Solución:** Reinstale el archivo original firmado emitido por el distribuidor oficial.
- **Causa 2:** El número de computadores matriculados y activos en el colegio supera la cuota contratada (`maxDevices`).
  - **Solución:** Revise en *Teacher Web > Inventario* los equipos dados de baja o duplicados y revoque los puestos en desuso, o solicite una ampliación de licencia institucional.
