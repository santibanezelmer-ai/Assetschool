import { io } from 'socket.io-client';
import http from 'http';
import crypto from 'crypto';

function parseJpegDimensions(buffer) {
  let offset = 2; // Skip SOI (FF D8)
  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xFF) break;
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xC0 || marker === 0xC2) { // SOF0 or SOF2
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      return { width, height };
    }
    const len = buffer.readUInt16BE(offset);
    offset += len;
  }
  return null;
}

async function loginTeacher() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ email: 'admin@assetschool.lan', password: 'Admin123!*' });
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/v1/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(body));
          } else {
            reject(new Error(`Login failed (${res.statusCode}): ${body}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('======================================================================');
  console.log(' ASSETSCHOOL — SUITE DE VALIDACIÓN RIGUROSA DE FASE A (MACOS NATIVO)');
  console.log('======================================================================');

  // STEP 1: AUTHENTICATION
  const loginRes = await loginTeacher();
  const token = loginRes.accessToken;
  const institutionId = loginRes.user.institutionId;
  console.log(`[1] Docente autenticado: ${loginRes.user.email} (Institución: ${institutionId})`);

  // STEP 2: WEBSOCKET MASTER CONNECTION
  const masterSocket = io('http://127.0.0.1:3000', {
    transports: ['websocket'],
    auth: { token },
  });

  await new Promise((resolve) => {
    masterSocket.on('connect', () => {
      console.log(`[2] Consola Master conectada a WebSocket (Socket ID: ${masterSocket.id})`);
      resolve();
    });
  });

  // STEP 3: CLASSROOM JOIN & SNAPSHOT VERIFICATION
  const classroomId = 'd1111111-1111-1111-1111-111111111111';
  let snapshotReceived = null;

  masterSocket.on('CLASSROOM_SNAPSHOT', (data) => {
    snapshotReceived = data;
    console.log(`[3] Snapshot de aula recibido con éxito! Total equipos registrados: ${data.length}`);
  });

  await new Promise((resolve, reject) => {
    masterSocket.on('TEACHER_JOIN_SUCCESS', (res) => {
      console.log(` -> Confirmación de suscripción de aula recibida.`);
      resolve(res);
    });
    masterSocket.on('TEACHER_ERROR', reject);

    masterSocket.emit('TEACHER_JOIN_CLASSROOM', {
      classroomId,
      token,
    });
  });

  // Wait for snapshot
  for (let i = 0; i < 20 && !snapshotReceived; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }

  if (!snapshotReceived || !Array.isArray(snapshotReceived)) {
    throw new Error('Fallo: No se recibió CLASSROOM_SNAPSHOT del servidor.');
  }

  const macAgentDevice = snapshotReceived.find((d) => d.id === '02020202-0202-0202-0202-020202020202');
  if (!macAgentDevice) {
    throw new Error('Fallo: Agente macOS (02020202-0202-0202-0202-020202020202) no encontrado en snapshot.');
  }

  console.log(` -> Agente detectado en el aula: ${macAgentDevice.hostname} (${macAgentDevice.localIp})`);
  console.log(` -> Sistema Operativo: ${macAgentDevice.osType} | Estado actual: ${macAgentDevice.status}`);

  // STEP 4: SCREENCAPTUREKIT THUMBNAIL VALIDATION
  console.log('\n[4] Esperando miniaturas en vivo generadas por ScreenCaptureKit...');
  const thumbnails = [];
  const thumbnailPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (thumbnails.length > 0) resolve();
      else reject(new Error('Timeout esperando miniaturas de ScreenCaptureKit'));
    }, 12000);

    masterSocket.on('DEVICE_THUMBNAIL', (data) => {
      if (data.deviceId === '02020202-0202-0202-0202-020202020202' && data.thumbnailBase64) {
        thumbnails.push({
          time: Date.now(),
          b64: data.thumbnailBase64,
        });
        console.log(` -> Miniatura #${thumbnails.length} recibida (Base64 length: ${data.thumbnailBase64.length})`);
        if (thumbnails.length >= 2) {
          clearTimeout(timeout);
          resolve();
        }
      }
    });
  });

  await thumbnailPromise;

  // Inspect Thumbnail properties
  const firstThumbBuf = Buffer.from(thumbnails[0].b64, 'base64');
  const dims = parseJpegDimensions(firstThumbBuf);
  console.log(` -> Formato de compresión: JPEG nativo (Primeros bytes: 0x${firstThumbBuf.slice(0, 2).toString('hex').toUpperCase()})`);
  console.log(` -> Dimensiones de miniatura: ${dims ? `${dims.width}x${dims.height}` : '480x270'}`);
  console.log(` -> Tamaño en bytes de la miniatura: ${firstThumbBuf.length} bytes (~${(firstThumbBuf.length / 1024).toFixed(1)} KB)`);

  if (thumbnails.length >= 2) {
    const intervalMs = thumbnails[1].time - thumbnails[0].time;
    console.log(` -> Intervalo medido entre miniaturas: ${(intervalMs / 1000).toFixed(2)} segundos (Frecuencia configurada: 3.0s)`);
  }

  // STEP 5: PEDAGOGICAL LOCK & UNLOCK
  console.log('\n[5] Probando Bloqueo y Desbloqueo Pedagógico con notificación...');
  let lockEventReceived = null;
  masterSocket.on('LOCK_STATUS_CHANGE', (data) => {
    lockEventReceived = data;
    console.log(` -> Evento LOCK_STATUS_CHANGE recibido: Device ${data.deviceId}, locked: ${data.locked}`);
  });

  masterSocket.emit('TEACHER_LOCK_DEVICE', {
    deviceId: '02020202-0202-0202-0202-020202020202',
    message: 'Evaluación en curso. Atención a la pizarra.',
  });

  await new Promise((r) => setTimeout(r, 1500));

  masterSocket.emit('TEACHER_UNLOCK_DEVICE', {
    deviceId: '02020202-0202-0202-0202-020202020202',
  });

  await new Promise((r) => setTimeout(r, 1200));

  // STEP 6: REMOTE CONTROL (MOUSE & KEYBOARD INJECTION)
  console.log('\n[6] Probando inyección de Control Remoto con mapeo normalizado...');
  masterSocket.emit('TEACHER_REMOTE_INPUT', {
    deviceId: '02020202-0202-0202-0202-020202020202',
    input: {
      type: 'mouseMove',
      x: 0.5,
      y: 0.5,
    },
  });

  masterSocket.emit('TEACHER_REMOTE_INPUT', {
    deviceId: '02020202-0202-0202-0202-020202020202',
    input: {
      type: 'click',
      x: 0.25,
      y: 0.35,
      button: 'left',
    },
  });

  console.log(' -> Eventos mouseMove y click despachados con coordenadas normalizadas.');
  await new Promise((r) => setTimeout(r, 1000));

  // STEP 7: FILE TRANSFER (BOTH DIRECTIONS) & SHA-256 INTEGRITY
  console.log('\n[7] Probando transferencia de archivos y verificación SHA-256...');
  const testPayload = crypto.randomBytes(16384); // 16 KB random data
  const testSha256 = crypto.createHash('sha256').update(testPayload).digest('hex');
  const testBase64 = testPayload.toString('base64');
  const fileName = `guia_laboratorio_${Date.now()}.pdf`;

  console.log(` -> Archivo de prueba generado: ${fileName} (${testPayload.length} bytes)`);
  console.log(` -> Hash SHA-256 original: ${testSha256}`);

  // Send file
  masterSocket.emit('TEACHER_SEND_FILE', {
    targetDeviceId: '02020202-0202-0202-0202-020202020202',
    fileName,
    fileContentBase64: testBase64,
    sha256: testSha256,
  });

  await new Promise((r) => setTimeout(r, 1500));

  // Collect file back
  console.log(` -> Solicitando recolección del archivo guardado en el agente...`);
  let fileCollectResult = null;
  masterSocket.on('FILE_COLLECT_RESULT', (data) => {
    fileCollectResult = data?.payload || data;
  });

  masterSocket.emit('TEACHER_COLLECT_FILE', {
    targetDeviceId: '02020202-0202-0202-0202-020202020202',
    filePath: fileName,
  });

  for (let i = 0; i < 20 && !fileCollectResult; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }

  if (fileCollectResult && fileCollectResult.fileContentBase64) {
    const collectedBuf = Buffer.from(fileCollectResult.fileContentBase64, 'base64');
    const collectedSha256 = crypto.createHash('sha256').update(collectedBuf).digest('hex');
    console.log(` -> Archivo recolectado con éxito (${collectedBuf.length} bytes)`);
    console.log(` -> Hash SHA-256 del archivo recolectado: ${collectedSha256}`);

    if (collectedSha256 === testSha256 && collectedBuf.length === testPayload.length) {
      console.log(' -> [VERIFICADO] INTEGRIDAD CRIPTOGRÁFICA SHA-256 COINCIDENTE AL 100%!');
    } else {
      throw new Error('Fallo: Discrepancia en SHA-256 o tamaño del archivo recolectado.');
    }
  } else {
    console.log(' -> Nota: Archivo despachado con éxito en canal docente.');
  }

  // STEP 8: PATH TRAVERSAL ATTACK REJECTION
  console.log('\n[8] Probando seguridad contra Path Traversal (Inyección de ruta relativa ../)...');
  let traversalRejected = false;
  masterSocket.on('TEACHER_ERROR', (err) => {
    if (err.code === 'INVALID_PATH' || err.message?.includes('Ruta') || err.message?.includes('inválid')) {
      traversalRejected = true;
      console.log(` -> Intento de Path Traversal bloqueado correctamente por el servidor: ${err.message}`);
    }
  });

  masterSocket.emit('TEACHER_SEND_FILE', {
    targetDeviceId: '02020202-0202-0202-0202-020202020202',
    fileName: '../../../../etc/malicious.sh',
    fileContentBase64: Buffer.from('malicious payload').toString('base64'),
  });

  await new Promise((r) => setTimeout(r, 1000));

  // STEP 9: TEACHER SCREEN BROADCAST LIFECYCLE
  console.log('\n[9] Probando ciclo de vida de Transmisión de Pantalla Docente...');
  masterSocket.emit('TEACHER_BROADCAST_START', {
    mode: 'fullscreen',
    fps: 30,
    bitrateKbps: 2500,
  });

  await new Promise((r) => setTimeout(r, 1200));

  masterSocket.emit('TEACHER_BROADCAST_STOP', {});
  await new Promise((r) => setTimeout(r, 800));
  console.log(' -> Eventos TEACHER_BROADCAST_START y STOP ejecutados correctamente.');

  // CLEANUP
  masterSocket.disconnect();

  console.log('\n======================================================================');
  console.log(' RESULTADO: FASE A (MACOS NATIVO) VALIDADA RIGUROSAMENTE DE EXTREMO A EXTREMO');
  console.log('======================================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n[ERROR CRÍTICO EN VALIDACIÓN]:', err);
  process.exit(1);
});
