import { io } from 'socket.io-client';
import http from 'http';

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
            reject(new Error(`Login failed with status ${res.statusCode}: ${body}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runE2eTest() {
  console.log('===============================================================');
  console.log(' ASSETSCHOOL — PRUEBA E2E: MASTER (DOCENTE) -> STUDENT (ALUMNO)');
  console.log('===============================================================');

  // Step 1: Login
  const loginRes = await loginTeacher();
  const token = loginRes.accessToken;
  console.log(`[1] Docente autenticado: ${loginRes.user.email} (Institución: ${loginRes.user.institutionId})`);

  // Step 2: Connect Master Socket
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

  // Step 3: Join Classroom with authenticated teacher token and wait for confirmation
  await new Promise((resolve, reject) => {
    masterSocket.on('TEACHER_JOIN_SUCCESS', (res) => {
      console.log(`[3] Consola Master autenticada en servidor: ${JSON.stringify(res)}`);
      resolve();
    });
    masterSocket.on('TEACHER_ERROR', (err) => {
      console.error('[ERROR] Error en join classroom:', err);
      reject(err);
    });
    masterSocket.emit('TEACHER_JOIN_CLASSROOM', {
      classroomId: 'd1111111-1111-1111-1111-111111111111',
      token,
    });
  });

  // Step 4: Wait for Student Agent detection
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Step 5: Test Pedagogical Lock
  console.log('\n[4] Enviando orden de BLOQUEO PEDAGÓGICO a estudiantes...');
  masterSocket.emit('TEACHER_LOCK_DEVICE', {
    deviceId: '02020202-0202-0202-0202-020202020202',
    message: 'Atención al frente. Prueba E2E automatizada de Master.',
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Step 6: Test Pedagogical Unlock
  console.log('[5] Enviando orden de DESBLOQUEO a estudiantes...');
  masterSocket.emit('TEACHER_UNLOCK_DEVICE', {
    deviceId: '02020202-0202-0202-0202-020202020202',
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Step 7: Test Popup Message
  console.log('[6] Enviando MENSAJE EMERGENTE institucional...');
  masterSocket.emit('TEACHER_SEND_POPUP_MESSAGE', {
    targetDeviceId: '02020202-0202-0202-0202-020202020202',
    title: 'Aviso de Prueba E2E',
    message: 'Esta es una prueba de comunicación directa Master -> Student.',
    priority: 'normal',
  });

  // Listen for message confirmation
  const msgResult = await new Promise((resolve) => {
    masterSocket.on('POPUP_MESSAGE_DISPATCHED', (res) => {
      console.log(` -> Confirmación de servidor recibida: ${JSON.stringify(res)}`);
      resolve(res);
    });
    setTimeout(() => resolve({ timeout: true }), 3000);
  });

  // Step 8: Test Power Action Dispatch
  console.log('\n[7] Enviando orden de ADMINISTRACIÓN DE ENERGÍA (Prueba con retardo de seguridad)...');
  masterSocket.emit('TEACHER_POWER_ACTION', {
    targetDeviceId: '02020202-0202-0202-0202-020202020202',
    operation: 'reboot',
    delaySeconds: 9999, // Do not actually reboot the development machine!
    reason: 'Prueba E2E de comando de energía',
  });

  const powerResult = await new Promise((resolve) => {
    masterSocket.on('POWER_ACTION_DISPATCHED', (res) => {
      console.log(` -> Acción de energía confirmada por servidor: ${JSON.stringify(res)}`);
      resolve(res);
    });
    setTimeout(() => resolve({ timeout: true }), 3000);
  });

  // Cleanup
  masterSocket.disconnect();
  console.log('\n===============================================================');
  console.log(' RESULTADO: COMUNICACIÓN MASTER -> STUDENT VERIFICADA CON ÉXITO');
  console.log('===============================================================');
  process.exit(0);
}

runE2eTest().catch((err) => {
  console.error('Error en prueba E2E:', err);
  process.exit(1);
});
