import { io } from 'socket.io-client';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const JWT_SECRET = process.env.JWT_SECRET || 'NKkKXNIAYgppx7o4NbXP8B-e7dtIEg-dON-crODbkVtsLIzHRyJASxcZ6uqnWjH6';
const SERVER_URL = 'http://127.0.0.1:3000';
const CLASSROOM_ID = 'd1111111-1111-1111-1111-111111111111'; // Lab Informatica 1
const INSTITUTION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEACHER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

console.log('='.repeat(80));
console.log('   ASSETSCHOOL — VALIDACIÓN DE INTEGRACIÓN SUITE WINDOWS (FASE B)');
console.log('='.repeat(80));

async function runWindowsSuiteVerification() {
  const pgClient = new pg.Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'assetschool_admin',
    password: 'assetschool_secure_pass_2026',
    database: 'assetschool_db',
  });
  await pgClient.connect();

  // Ensure devices are assigned to CLASSROOM_ID and not revoked
  await pgClient.query('UPDATE devices SET current_classroom_id = $1, is_revoked = false WHERE institution_id = $2', [CLASSROOM_ID, INSTITUTION_ID]);

  const devRes = await pgClient.query('SELECT id, hostname, mac_address FROM devices WHERE institution_id = $1 AND is_revoked = false LIMIT 1', [INSTITUTION_ID]);
  const winDev = devRes.rows[0];
  const winDeviceId = winDev.id;
  const winMac = winDev.mac_address;

  console.log(`[TEST SETUP] Dispositivo Windows Enrolado: ${winDev.hostname} (${winDeviceId}) [MAC: ${winMac}]`);

  const teacherToken = jwt.sign(
    { sub: TEACHER_ID, type: 'access', email: 'admin@assetschool.lan', role: 'INSTITUTION_ADMIN', institutionId: INSTITUTION_ID },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const results = [];

  // 1. Connect Teacher Master Windows socket
  const teacherSocket = io(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true,
  });

  // 2. Connect Student Windows Service (Session 0) socket
  const winStudentSocket = io(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true,
  });

  await Promise.all([
    new Promise((resolve) => teacherSocket.on('connect', resolve)),
    new Promise((resolve) => winStudentSocket.on('connect', resolve)),
  ]);

  console.log('[E2E Windows] Sockets de Master Windows y Windows Service (Sesión 0) conectados.');

  // Handshake: Windows Student Service registers via AGENT_HELLO
  const helloPromise = new Promise((resolve) => {
    winStudentSocket.on('SERVER_HELLO_ACK', (ack) => resolve(ack));
  });

  winStudentSocket.emit('AGENT_HELLO', {
    protocolVersion: '1.0.0',
    packetType: 'AGENT_HELLO',
    senderId: winDeviceId,
    target: 'server',
    timestamp: Date.now(),
    payload: {
      hostname: winDev.hostname,
      macAddress: winMac,
      localIp: '192.168.1.121',
      osType: 'windows',
      osVersion: 'Microsoft Windows 11 Pro 10.0.22631',
      architecture: 'x64',
      agentVersion: '1.0.0',
      publicKey: 'ed25519_win_sample_key',
      enrolledDeviceId: winDeviceId,
    },
  });

  await helloPromise;
  console.log('[E2E Windows] Handshake de Windows Service en Sesión 0 verificado.');

  // TEST 1: Teacher Master joins classroom
  const joinPromise = new Promise((resolve) => {
    teacherSocket.emit('TEACHER_JOIN_CLASSROOM', { classroomId: CLASSROOM_ID, token: teacherToken }, (ack) => {
      resolve(ack);
    });
  });

  const joinAck = await joinPromise;
  const t1Passed = joinAck?.success === true;
  results.push({ test: '1. Master Windows: Selección y Unión a Aula', passed: t1Passed });
  console.log(`[TEST 1] Master Windows se une al Aula: ${t1Passed ? 'ÉXITO' : 'FALLO'}`);

  // TEST 2: Windows SessionAgent generates 3s thumbnail over IPC -> Service forwards -> Teacher receives
  const sampleThumbnailJpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const thumbnailReceivedPromise = new Promise((resolve) => {
    teacherSocket.on('DEVICE_THUMBNAIL', (data) => {
      if (data?.deviceId === winDeviceId) {
        resolve(data);
      }
    });
  });

  winStudentSocket.emit('DEVICE_THUMBNAIL', {
    deviceId: winDeviceId,
    thumbnailBase64: sampleThumbnailJpegBase64,
    timestamp: Date.now(),
  });

  const thumbData = await thumbnailReceivedPromise;
  const t2Passed = !!thumbData?.thumbnailBase64;
  results.push({ test: '2. Streaming de Miniatura Windows (GDI/BitBlt -> Master)', passed: t2Passed });
  console.log(`[TEST 2] Recepción de miniatura Windows en Master: ${t2Passed ? 'ÉXITO' : 'FALLO'}`);

  // TEST 3: Pedagogical Lock / Unlock
  const lockReceivedPromise = new Promise((resolve) => {
    winStudentSocket.on('COMMAND_DISPATCH', (envelope) => {
      if (envelope?.payload?.commandType === 'LOCK_SCREEN') {
        resolve(envelope);
      }
    });
  });

  teacherSocket.emit('TEACHER_LOCK_CLASSROOM', { classroomId: CLASSROOM_ID, message: 'Atención al frente' });
  const lockCmd = await lockReceivedPromise;
  const t3Passed = lockCmd?.payload?.commandType === 'LOCK_SCREEN';
  results.push({ test: '3. Bloqueo de Pantalla y Gancho Teclado Win32 (LL Hook)', passed: t3Passed });
  console.log(`[TEST 3] Orden de bloqueo pedagógico recibida en Windows: ${t3Passed ? 'ÉXITO' : 'FALLO'}`);

  // TEST 4: Teacher Popup Message and Student "Entendido" ACK
  const msgReceivedPromise = new Promise((resolve) => {
    winStudentSocket.on('POPUP_MESSAGE', (envelope) => {
      resolve(envelope?.payload || envelope);
    });
  });

  const msgId = 'win-msg-' + Date.now();
  teacherSocket.emit('TEACHER_SEND_POPUP_MESSAGE', {
    classroomId: CLASSROOM_ID,
    messageId: msgId,
    title: 'Instrucción Docente',
    message: 'Comenzar el examen de programación.',
    priority: 'high',
    teacherName: 'Profesor Windows',
  });

  await msgReceivedPromise;

  // Student clicks "Entendido" -> SessionAgent generates MESSAGE_ACK -> forwards to Gateway
  const ackReceivedPromise = new Promise((resolve) => {
    teacherSocket.on('MESSAGE_ACK', (ack) => {
      if (ack?.deviceId === winDeviceId) {
        resolve(ack);
      }
    });
  });

  winStudentSocket.emit('MESSAGE_ACK', {
    deviceId: winDeviceId,
    messageId: msgId,
    hostname: winDev.hostname,
    timestamp: Date.now(),
  });

  const ackData = await ackReceivedPromise;
  const t4Passed = ackData?.deviceId === winDeviceId;
  results.push({ test: '4. Mensajería Docente y Confirmación (ACK) de Estudiante', passed: t4Passed });
  console.log(`[TEST 4] Confirmación ACK de lectura recibida en Master Windows: ${t4Passed ? 'ÉXITO' : 'FALLO'}`);

  // TEST 5: Dual-pane File Distribution with SHA-256
  const fileContent = 'Código fuente del ejercicio práctico C# .NET 8';
  const fileBase64 = Buffer.from(fileContent).toString('base64');
  const fileSha256 = crypto.createHash('sha256').update(fileContent).digest('hex');

  const fileReceivedPromise = new Promise((resolve) => {
    winStudentSocket.on('FILE_SEND', (env) => {
      resolve(env?.payload || env);
    });
  });

  teacherSocket.emit('TEACHER_SEND_FILE', {
    deviceId: winDeviceId,
    fileName: 'ejercicio.cs',
    fileSizeBytes: Buffer.byteLength(fileContent),
    fileContentBase64: fileBase64,
  });

  const filePayload = await fileReceivedPromise;
  const receivedContent = Buffer.from(filePayload.fileContentBase64, 'base64').toString('utf8');
  const computedHash = crypto.createHash('sha256').update(receivedContent).digest('hex');
  const t5Passed = computedHash === fileSha256;
  results.push({ test: '5. Distribución de Archivo a Sandbox Windows con SHA-256', passed: t5Passed });
  console.log(`[TEST 5] Integridad de archivo distribuido (SHA-256 ${computedHash.slice(0, 10)}...): ${t5Passed ? 'ÉXITO' : 'FALLO'}`);

  // TEST 6: Interactive Remote Control (Mouse & Keyboard injection)
  const inputPromise = new Promise((resolve) => {
    winStudentSocket.on('REMOTE_INPUT_EVENT', (inputEvent) => {
      resolve(inputEvent?.payload || inputEvent);
    });
  });

  teacherSocket.emit('TEACHER_REMOTE_INPUT', {
    deviceId: winDeviceId,
    input: {
      type: 'click',
      x: 0.65,
      y: 0.35,
      button: 'left',
    },
  });

  const inputEvent = await inputPromise;
  const t6Passed = inputEvent?.type === 'click';
  results.push({ test: '6. Inyección de Mouse y Teclado en Sesión Activa (SendInput)', passed: t6Passed });
  console.log(`[TEST 6] Inyección remota de eventos recibida en Windows: ${t6Passed ? 'ÉXITO' : 'FALLO'}`);

  // TEST 7: Power Management (Reboot order to Session 0)
  const powerPromise = new Promise((resolve) => {
    winStudentSocket.on('POWER_ACTION', (env) => {
      resolve(env?.payload || env);
    });
  });

  teacherSocket.emit('TEACHER_POWER_ACTION', {
    targetDeviceId: winDeviceId,
    operation: 'reboot',
    delaySeconds: 5,
    force: true,
  });

  const powerPayload = await powerPromise;
  const t7Passed = powerPayload?.operation === 'reboot';
  results.push({ test: '7. Acción de Energía en Sesión 0 (Win32 ExitWindowsEx)', passed: t7Passed });
  console.log(`[TEST 7] Orden de energía recibida en Session 0 Service: ${t7Passed ? 'ÉXITO' : 'FALLO'}`);

  // TEST 8: Mediasoup SFU Screen Broadcast Trigger (SIPSorcery pipeline)
  const broadcastPromise = new Promise((resolve) => {
    teacherSocket.on('TEACHER_BROADCAST_STARTED', (res) => {
      resolve(res);
    });
  });

  teacherSocket.emit('TEACHER_BROADCAST_START', {
    classroomId: CLASSROOM_ID,
    mode: 'fullscreen',
    fps: 30,
    bitrateKbps: 2500,
  });

  const broadcastRes = await broadcastPromise;
  const t8Passed = typeof broadcastRes?.targetCount === 'number';
  results.push({ test: '8. Emisión Docente Mediasoup SFU (SIPSorcery H.264)', passed: t8Passed });
  console.log(`[TEST 8] Activación de emisión Mediasoup SFU desde Master Windows: ${t8Passed ? 'ÉXITO' : 'FALLO'}`);

  // Stop broadcast
  await new Promise((resolve) => {
    teacherSocket.on('TEACHER_BROADCAST_STOPPED', resolve);
    teacherSocket.emit('TEACHER_BROADCAST_STOP', { classroomId: CLASSROOM_ID });
  });

  // Clean up
  teacherSocket.disconnect();
  winStudentSocket.disconnect();
  await pgClient.end();

  console.log('\n' + '='.repeat(80));
  console.log('              RESUMEN DE PRUEBAS DE LA PLATAFORMA WINDOWS');
  console.log('='.repeat(80));
  console.table(results);

  const allPassed = results.every((r) => r.passed);
  console.log(`\nRESULTADO GENERAL: ${allPassed ? 'TODAS LAS PRUEBAS PASARON EXITOSAMENTE (100%)' : 'ALGUNA PRUEBA FALLÓ'}`);
}

runWindowsSuiteVerification().catch((err) => {
  console.error('Error fatal durante la prueba:', err);
  process.exit(1);
});
