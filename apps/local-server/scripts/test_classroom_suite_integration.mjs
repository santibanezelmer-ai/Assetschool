import { io } from 'socket.io-client';
import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'NKkKXNIAYgppx7o4NbXP8B-e7dtIEg-dON-crODbkVtsLIzHRyJASxcZ6uqnWjH6';
const SERVER_URL = 'http://localhost:3000';
const INST_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_A1 = 'd1111111-1111-1111-1111-111111111111';
const CLASS_A2 = 'd2222222-2222-2222-2222-222222222222';
const TEACHER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; // admin@assetschool.lan

async function run() {
  console.log('================================================================================');
  console.log('   ASSETSCHOOL — PRUEBA DE INTEGRACIÓN E2E DE ENTORNO DE AULA COMPLETO (FASE A.4)');
  console.log('================================================================================\n');

  const pgClient = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'assetschool_admin',
    password: 'assetschool_secure_pass_2026',
    database: 'assetschool_db',
  });
  await pgClient.connect();

  // Ensure devices are assigned to CLASS_A1 and not revoked
  await pgClient.query('UPDATE devices SET current_classroom_id = $1, is_revoked = false WHERE institution_id = $2', [CLASS_A1, INST_A]);

  const devRes = await pgClient.query('SELECT id, hostname, mac_address FROM devices WHERE institution_id = $1 AND is_revoked = false LIMIT 2', [INST_A]);
  const dev1 = devRes.rows[0];
  const dev2 = devRes.rows[1];

  console.log(`[TEST SETUP] Dispositivo Estudiante 1: ${dev1.hostname} (${dev1.id}) en Aula ${CLASS_A1}`);
  console.log(`[TEST SETUP] Dispositivo Estudiante 2: ${dev2.hostname} (${dev2.id}) en Aula ${CLASS_A1}`);

  const teacherToken = jwt.sign(
    { sub: TEACHER_ID, type: 'access', email: 'admin@assetschool.lan', role: 'INSTITUTION_ADMIN', institutionId: INST_A },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const results = [];

  // 1. Teacher and Student connections
  const teacherSocket = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
  const student1Socket = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
  const student2Socket = io(SERVER_URL, { transports: ['websocket'], forceNew: true });

  await Promise.all([
    new Promise(res => teacherSocket.on('connect', res)),
    new Promise(res => student1Socket.on('connect', res)),
    new Promise(res => student2Socket.on('connect', res)),
  ]);
  console.log('[E2E] Sockets de Docente y Estudiantes conectados al Gateway.');

  // Student 1 & 2 Handshake
  await new Promise(resolve => {
    student1Socket.on('SERVER_HELLO_ACK', () => resolve());
    student1Socket.emit('AGENT_HELLO', {
      packetId: 'hello_s1',
      type: 'AGENT_HELLO',
      timestamp: Date.now(),
      source: 'AGENT',
      destination: 'SERVER',
      payload: {
        enrolledDeviceId: dev1.id,
        macAddress: dev1.mac_address,
        hostname: dev1.hostname,
        osType: 'MACOS',
        agentVersion: '1.0.0'
      }
    });
  });

  await new Promise(resolve => {
    student2Socket.on('SERVER_HELLO_ACK', () => resolve());
    student2Socket.emit('AGENT_HELLO', {
      packetId: 'hello_s2',
      type: 'AGENT_HELLO',
      timestamp: Date.now(),
      source: 'AGENT',
      destination: 'SERVER',
      payload: {
        enrolledDeviceId: dev2.id,
        macAddress: dev2.mac_address,
        hostname: dev2.hostname,
        osType: 'MACOS',
        agentVersion: '1.0.0'
      }
    });
  });

  console.log('[E2E] Handshake de ambos agentes completado con éxito.');

  // Teacher Joins Classroom
  const joinAck = await new Promise(resolve => {
    teacherSocket.emit('TEACHER_JOIN_CLASSROOM', { token: teacherToken, classroomId: CLASS_A1 }, resolve);
  });
  console.log(`[TEST 1] Docente se une al Aula ${CLASS_A1}:`, joinAck?.success ? 'ÉXITO' : 'ERROR', joinAck?.error || '');
  results.push({ test: '1. Selección de Aula y Unión Docente', passed: joinAck?.success === true });

  // 2. Student Thumbnail Dispatch & Reception by Teacher
  console.log('\n[TEST 2] Envío periódico de miniatura ScreenCaptureKit desde Student -> Docente...');
  const fakeJpgBase64 = Buffer.from('FAKE_JPEG_THUMBNAIL_DATA_ASSETSCHOOL_2026').toString('base64');
  const thumbPromise = new Promise(resolve => {
    teacherSocket.on('DEVICE_THUMBNAIL', payload => {
      if (payload.deviceId === dev1.id) {
        resolve(payload);
      }
    });
  });

  student1Socket.emit('DEVICE_THUMBNAIL', {
    deviceId: dev1.id,
    thumbnailBase64: fakeJpgBase64,
    timestamp: Date.now()
  });

  const receivedThumb = await thumbPromise;
  console.log(`  -> Miniatura recibida en consola docente para equipo ${receivedThumb.deviceId} (${receivedThumb.thumbnailBase64.length} chars)`);
  results.push({ test: '2. Recepción de Miniatura de Pantalla', passed: !!receivedThumb?.thumbnailBase64 });

  // 3. Pedagogical Lock (Bloqueo y Desbloqueo)
  console.log('\n[TEST 3] Bloqueo pedagógico de aula y de equipo individual...');
  const lockPromise = new Promise(resolve => {
    student1Socket.on('COMMAND_DISPATCH', (envelope) => {
      const type = envelope?.payload?.commandType || envelope?.commandType;
      if (type === 'LOCK_SCREEN') {
        resolve(envelope);
      }
    });
  });

  teacherSocket.emit('TEACHER_LOCK_CLASSROOM', { classroomId: CLASS_A1, message: 'Atención al frente. Pausa activa.' });
  const lockReceived = await lockPromise;
  console.log('  -> Orden de bloqueo recibida en agente de estudiante (COMMAND_DISPATCH / LOCK_SCREEN):', lockReceived ? 'SÍ' : 'NO');

  const unlockPromise = new Promise(resolve => {
    student1Socket.on('COMMAND_DISPATCH', (envelope) => {
      const type = envelope?.payload?.commandType || envelope?.commandType;
      if (type === 'UNLOCK_SCREEN') {
        resolve(envelope);
      }
    });
  });

  teacherSocket.emit('TEACHER_UNLOCK_CLASSROOM', { classroomId: CLASS_A1 });
  const unlockReceived = await unlockPromise;
  console.log('  -> Orden de desbloqueo recibida en agente de estudiante (COMMAND_DISPATCH / UNLOCK_SCREEN):', unlockReceived ? 'SÍ' : 'NO');
  results.push({ test: '3. Bloqueo y Desbloqueo Pedagógico', passed: !!lockReceived && !!unlockReceived });

  // 4. Popup Text Messaging & Message Ack
  console.log('\n[TEST 4] Mensajería docente con acuse de recibo...');
  const msgPromise = new Promise(resolve => {
    student1Socket.on('POPUP_MESSAGE', resolve);
  });
  const ackPromise = new Promise(resolve => {
    teacherSocket.on('MESSAGE_ACK', resolve);
  });

  teacherSocket.emit('TEACHER_SEND_POPUP_MESSAGE', {
    title: 'Aviso Importante',
    message: 'Favor abrir el documento de laboratorio en la página 15.',
    priority: 'urgent',
    targetDeviceId: dev1.id
  });

  const receivedMsg = await msgPromise;
  console.log(`  -> Mensaje recibido en estudiante: "${receivedMsg.payload?.message || receivedMsg.message}"`);

  // Student acknowledges message
  student1Socket.emit('MESSAGE_ACK', {
    messageId: receivedMsg.payload?.messageId || receivedMsg.messageId || 'msg-1',
    hostname: dev1.hostname,
    timestamp: Date.now()
  });

  const receivedAck = await ackPromise;
  console.log(`  -> Acuse de recibo confirmado en consola docente para: ${receivedAck.hostname} (${receivedAck.deviceId})`);
  results.push({ test: '4. Mensajería Docente y Confirmación (ACK)', passed: !!receivedMsg && !!receivedAck });

  // 5. File Distribution & Checksum Verification
  console.log('\n[TEST 5] Distribución de archivos con verificación SHA-256...');
  const testFileContent = 'CONTENIDO_DE_PRUEBA_LABORATORIO_ASSETSCHOOL_2026';
  const testFileSha256 = crypto.createHash('sha256').update(testFileContent).digest('hex');
  const testFileBase64 = Buffer.from(testFileContent).toString('base64');

  const fileSendPromise = new Promise(resolve => {
    student1Socket.on('FILE_SEND', resolve);
  });

  teacherSocket.emit('TEACHER_SEND_FILE', {
    deviceId: dev1.id,
    fileName: 'guia_ejercicios.txt',
    fileSizeBytes: Buffer.byteLength(testFileContent),
    fileContentBase64: testFileBase64,
    sha256: testFileSha256
  });

  const receivedFile = await fileSendPromise;
  console.log(`  -> Archivo recibido en agente de estudiante: ${receivedFile.payload?.fileName} (${receivedFile.payload?.fileSizeBytes} bytes)`);
  const computedHash = crypto.createHash('sha256').update(Buffer.from(receivedFile.payload?.fileContentBase64, 'base64')).digest('hex');
  const hashMatches = computedHash === testFileSha256;
  console.log(`  -> Verificación de hash SHA-256: ${hashMatches ? 'COINCIDE (' + computedHash.slice(0, 10) + '...)' : 'DISCREPANCIA'}`);
  results.push({ test: '5. Distribución de Archivo y Hash SHA-256', passed: !!receivedFile && hashMatches });

  // 6. Remote Control Input Events
  console.log('\n[TEST 6] Control remoto interactivo (Mouse y Teclado)...');
  const inputPromise = new Promise(resolve => {
    student1Socket.on('REMOTE_INPUT_EVENT', resolve);
  });

  teacherSocket.emit('TEACHER_REMOTE_INPUT', {
    deviceId: dev1.id,
    input: {
      type: 'click',
      x: 0.55,
      y: 0.45,
      button: 'left'
    }
  });

  const receivedInput = await inputPromise;
  console.log(`  -> Evento de entrada recibido en agente: Tipo=${receivedInput.payload?.type}, X=${receivedInput.payload?.x}, Y=${receivedInput.payload?.y}`);
  results.push({ test: '6. Control Remoto e Inyección de Entrada', passed: !!receivedInput?.payload?.type });

  // 7. Teacher Broadcast via Mediasoup SFU
  console.log('\n[TEST 7] Emisión de Pantalla Docente mediante Mediasoup SFU...');
  const sdpOffer = `v=0\r\no=- ${Date.now()} 2 IN IP4 127.0.0.1\r\ns=AssetSchool-Teacher\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\nc=IN IP4 127.0.0.1\r\na=sendonly\r\na=rtpmap:96 H264/90000\r\na=fmtp:96 packetization-mode=1;profile-level-id=42e01f\r\na=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF\r\n`;

  const broadcastStartPromise = new Promise(resolve => {
    teacherSocket.on('TEACHER_BROADCAST_STARTED', resolve);
  });

  teacherSocket.emit('TEACHER_BROADCAST_START', {
    mode: 'fullscreen',
    fps: 30,
    bitrateKbps: 2500,
    classroomId: CLASS_A1,
    sdpOffer
  });

  const broadcastStarted = await broadcastStartPromise;
  console.log(`  -> Respuesta de inicio de emisión docente recibida: Producer ID: ${broadcastStarted?.producerId || 'N/A'}, TargetCount: ${broadcastStarted?.targetCount}`);

  // Stop broadcast
  teacherSocket.emit('TEACHER_BROADCAST_STOP', { classroomId: CLASS_A1 });
  results.push({ test: '7. Broadcast Docente Mediasoup SFU', passed: !!broadcastStarted?.producerId });

  // Cleanup
  teacherSocket.disconnect();
  student1Socket.disconnect();
  student2Socket.disconnect();
  await pgClient.end();

  console.log('\n================================================================================');
  console.log('              RESUMEN DE PRUEBAS DE INTEGRACIÓN E2E DE AULA');
  console.log('================================================================================');
  console.table(results);

  const allPassed = results.every(r => r.passed);
  console.log(`\nRESULTADO GENERAL: ${allPassed ? 'TODAS LAS PRUEBAS PASARON EXITOSAMENTE (100%)' : 'HAY PRUEBAS FALLIDAS'}`);

  if (!allPassed) process.exit(1);
}

run().catch(err => {
  console.error('[ERROR FATAL EN TEST]', err);
  process.exit(1);
});
