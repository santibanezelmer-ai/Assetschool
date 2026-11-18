import { io } from 'socket.io-client';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const SERVER_URL = 'http://127.0.0.1:3000';
const CLASSROOM_ID = 'd1111111-1111-1111-1111-111111111111'; // Laboratorio 1
const INSTITUTION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEACHER_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; // admin@assetschool.lan
const JWT_SECRET = process.env.JWT_SECRET || 'NKkKXNIAYgppx7o4NbXP8B-e7dtIEg-dON-crODbkVtsLIzHRyJASxcZ6uqnWjH6';

console.log('='.repeat(80));
console.log('   ASSETSCHOOL — VALIDACIÓN MULTIPLATAFORMA AULA MIXTA (WINDOWS + macOS)');
console.log('='.repeat(80));

async function runCrossPlatformClassroomVerification() {
  const pgClient = new pg.Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'assetschool_admin',
    password: 'assetschool_secure_pass_2026',
    database: 'assetschool_db',
  });
  await pgClient.connect();

  // Configure enrolled macOS and Windows devices in CLASSROOM_ID
  const macDevId = '02020202-0202-0202-0202-020202020202';
  const macAddressMac = '02:42:AC:11:00:03';

  const winDevId = '01010101-0101-0101-0101-010101010101';
  const winAddressMac = '02:42:AC:11:00:02';

  await pgClient.query(`
    UPDATE devices 
    SET current_classroom_id = $1, is_revoked = false 
    WHERE id IN ($2, $3) AND institution_id = $4
  `, [CLASSROOM_ID, macDevId, winDevId, INSTITUTION_ID]);

  console.log(`[SETUP] Aula Mixta Configurada: ${CLASSROOM_ID}`);
  console.log(`  -> Estación macOS:   LAB01-MAC-02 (${macDevId}) [MAC: ${macAddressMac}]`);
  console.log(`  -> Estación Windows: LAB01-PC-01  (${winDevId}) [MAC: ${winAddressMac}]`);

  const macTeacherToken = jwt.sign(
    { sub: TEACHER_USER_ID, type: 'access', email: 'admin@assetschool.lan', role: 'INSTITUTION_ADMIN', institutionId: INSTITUTION_ID },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const winTeacherToken = jwt.sign(
    { sub: TEACHER_USER_ID, type: 'access', email: 'admin@assetschool.lan', role: 'INSTITUTION_ADMIN', institutionId: INSTITUTION_ID },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const results = [];

  // ========================================================
  // CONNECT ALL 4 ACTORS SIMULTANEOUSLY
  // ========================================================
  const masterMacSocket = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
  const masterWinSocket = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
  const studentMacSocket = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
  const studentWinSocket = io(SERVER_URL, { transports: ['websocket'], forceNew: true });

  await Promise.all([
    new Promise(r => masterMacSocket.on('connect', r)),
    new Promise(r => masterWinSocket.on('connect', r)),
    new Promise(r => studentMacSocket.on('connect', r)),
    new Promise(r => studentWinSocket.on('connect', r)),
  ]);

  console.log('[CONEXIÓN] Los 4 clientes (Master macOS, Master Windows, Student macOS, Student Windows) están conectados.');

  // Handshake Student macOS
  const macHelloAckPromise = new Promise(r => studentMacSocket.on('SERVER_HELLO_ACK', r));
  studentMacSocket.emit('AGENT_HELLO', {
    protocolVersion: '1.0.0',
    packetType: 'AGENT_HELLO',
    senderId: macDevId,
    target: 'server',
    timestamp: Date.now(),
    payload: {
      hostname: 'LAB01-MAC-02',
      macAddress: macAddressMac,
      localIp: '192.168.1.102',
      osType: 'macos',
      osVersion: 'macOS Sonoma 14.5',
      architecture: 'arm64',
      agentVersion: '1.0.0',
      publicKey: 'ed25519_mac_key',
      enrolledDeviceId: macDevId,
    },
  });
  await macHelloAckPromise;

  // Handshake Student Windows
  const winHelloAckPromise = new Promise(r => studentWinSocket.on('SERVER_HELLO_ACK', r));
  studentWinSocket.emit('AGENT_HELLO', {
    protocolVersion: '1.0.0',
    packetType: 'AGENT_HELLO',
    senderId: winDevId,
    target: 'server',
    timestamp: Date.now(),
    payload: {
      hostname: 'LAB01-PC-01',
      macAddress: winAddressMac,
      localIp: '192.168.1.101',
      osType: 'windows',
      osVersion: 'Windows 11 Pro 23H2',
      architecture: 'x64',
      agentVersion: '1.0.0',
      publicKey: 'ed25519_win_key',
      enrolledDeviceId: winDevId,
    },
  });
  await winHelloAckPromise;
  console.log('[HANDSHAKE] Ambos estudiantes (macOS + Windows) inscritos y verificados en base de datos.');

  // ========================================================
  // TEST 1: AMBOS MASTERS SE UNEN AL AULA Y VEN AMBOS SISTEMAS OPERATIVOS
  // ========================================================
  const macJoinPromise = new Promise(r => masterMacSocket.emit('TEACHER_JOIN_CLASSROOM', { classroomId: CLASSROOM_ID, token: macTeacherToken }, r));
  const winJoinPromise = new Promise(r => masterWinSocket.emit('TEACHER_JOIN_CLASSROOM', { classroomId: CLASSROOM_ID, token: winTeacherToken }, r));

  const [macJoinAck, winJoinAck] = await Promise.all([macJoinPromise, winJoinPromise]);
  const t1Passed = macJoinAck?.success && winJoinAck?.success;
  results.push({ test: '1. Supervisión de Aula Mixta (Master macOS + Master Windows conectados)', passed: !!t1Passed });
  console.log(`[TEST 1] Conexión y unión al aula mixta: ${t1Passed ? 'ÉXITO' : 'FALLO'}`);

  // ========================================================
  // TEST 2: STREAMING MULTIPLATAFORMA DE MINIATURAS
  // ========================================================
  const sampleThumb = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

  // Student macOS envía miniatura ScreenCaptureKit
  studentMacSocket.emit('DEVICE_THUMBNAIL', { deviceId: macDevId, thumbnailBase64: sampleThumb, timestamp: Date.now() });
  // Student Windows envía miniatura GDI/BitBlt
  studentWinSocket.emit('DEVICE_THUMBNAIL', { deviceId: winDevId, thumbnailBase64: sampleThumb, timestamp: Date.now() });

  const macMasterGotWinThumb = new Promise(r => {
    masterMacSocket.on('DEVICE_THUMBNAIL', data => { if (data?.deviceId === winDevId) r(true); });
  });
  const winMasterGotMacThumb = new Promise(r => {
    masterWinSocket.on('DEVICE_THUMBNAIL', data => { if (data?.deviceId === macDevId) r(true); });
  });

  const [m1, m2] = await Promise.all([macMasterGotWinThumb, winMasterGotMacThumb]);
  const t2Passed = m1 && m2;
  results.push({ test: '2. Monitor Multiplataforma: Master macOS recibe Windows & Master Windows recibe macOS', passed: t2Passed });
  console.log(`[TEST 2] Miniaturas cruzadas macOS <-> Windows en ambos masters: ${t2Passed ? 'ÉXITO' : 'FALLO'}`);

  // ========================================================
  // TEST 3: SCENARIO 1 — Master macOS -> Student macOS
  // ========================================================
  const lockPromise1 = new Promise(r => {
    studentMacSocket.on('COMMAND_DISPATCH', env => { if (env?.payload?.commandType === 'LOCK_SCREEN') r(true); });
  });
  masterMacSocket.emit('TEACHER_LOCK_DEVICE', { deviceId: macDevId, message: 'Bloqueado desde Master macOS' });
  const s1Lock = await lockPromise1;

  // Popup message & ACK
  const msgPromise1 = new Promise(r => studentMacSocket.on('POPUP_MESSAGE', () => r(true)));
  const ackPromise1 = new Promise(r => {
    masterMacSocket.on('MESSAGE_ACK', ack => { if (ack?.deviceId === macDevId) r(true); });
  });
  masterMacSocket.emit('TEACHER_SEND_POPUP_MESSAGE', { targetDeviceId: macDevId, title: 'Aviso', message: 'Leer cap 1', messageId: 'm1' });
  await msgPromise1;
  studentMacSocket.emit('MESSAGE_ACK', { deviceId: macDevId, messageId: 'm1', hostname: 'LAB01-MAC-02', timestamp: Date.now() });
  const s1Ack = await ackPromise1;

  // File distribution with SHA-256
  const fileContent1 = 'Instrucciones para Mac';
  const fileSha1 = crypto.createHash('sha256').update(fileContent1).digest('hex');
  const filePromise1 = new Promise(r => {
    studentMacSocket.on('FILE_SEND', env => {
      const p = env?.payload || env;
      const dec = Buffer.from(p.fileContentBase64, 'base64').toString('utf8');
      const hash = crypto.createHash('sha256').update(dec).digest('hex');
      r(hash === fileSha1);
    });
  });
  masterMacSocket.emit('TEACHER_SEND_FILE', { deviceId: macDevId, fileName: 'mac.txt', fileSizeBytes: Buffer.byteLength(fileContent1), fileContentBase64: Buffer.from(fileContent1).toString('base64') });
  const s1File = await filePromise1;

  const t3Passed = s1Lock && s1Ack && s1File;
  results.push({ test: '3. Escenario 1: Master macOS -> Student macOS (Bloqueo, Mensaje ACK, Archivo SHA-256)', passed: t3Passed });
  console.log(`[TEST 3] Escenario 1 (Master macOS -> Student macOS): ${t3Passed ? 'ÉXITO' : 'FALLO'}`);

  // ========================================================
  // TEST 4: SCENARIO 2 — Master macOS -> Student Windows
  // ========================================================
  const lockPromise2 = new Promise(r => {
    studentWinSocket.on('COMMAND_DISPATCH', env => { if (env?.payload?.commandType === 'LOCK_SCREEN') r(true); });
  });
  masterMacSocket.emit('TEACHER_LOCK_DEVICE', { deviceId: winDevId, message: 'Bloqueado desde Master macOS' });
  const s2Lock = await lockPromise2;

  // Popup message & ACK
  const msgPromise2 = new Promise(r => studentWinSocket.on('POPUP_MESSAGE', () => r(true)));
  const ackPromise2 = new Promise(r => {
    masterMacSocket.on('MESSAGE_ACK', ack => { if (ack?.deviceId === winDevId) r(true); });
  });
  masterMacSocket.emit('TEACHER_SEND_POPUP_MESSAGE', { targetDeviceId: winDevId, title: 'Aviso', message: 'Leer cap 2', messageId: 'm2' });
  await msgPromise2;
  studentWinSocket.emit('MESSAGE_ACK', { deviceId: winDevId, messageId: 'm2', hostname: 'LAB01-PC-01', timestamp: Date.now() });
  const s2Ack = await ackPromise2;

  // Remote input injection into Windows from macOS
  const inputPromise2 = new Promise(r => {
    studentWinSocket.on('REMOTE_INPUT_EVENT', env => {
      const p = env?.payload || env;
      r(p?.type === 'click' && p?.x === 0.7);
    });
  });
  masterMacSocket.emit('TEACHER_REMOTE_INPUT', { deviceId: winDevId, input: { type: 'click', x: 0.7, y: 0.3, button: 'left' } });
  const s2Input = await inputPromise2;

  const t4Passed = s2Lock && s2Ack && s2Input;
  results.push({ test: '4. Escenario 2: Master macOS -> Student Windows (Bloqueo, Mensaje ACK, Inyección Remota)', passed: t4Passed });
  console.log(`[TEST 4] Escenario 2 (Master macOS -> Student Windows): ${t4Passed ? 'ÉXITO' : 'FALLO'}`);

  // ========================================================
  // TEST 5: SCENARIO 3 — Master Windows -> Student macOS
  // ========================================================
  const lockPromise3 = new Promise(r => {
    studentMacSocket.on('COMMAND_DISPATCH', env => { if (env?.payload?.commandType === 'UNLOCK_SCREEN') r(true); });
  });
  masterWinSocket.emit('TEACHER_UNLOCK_DEVICE', { deviceId: macDevId });
  const s3Unlock = await lockPromise3;

  // Popup message from Windows Master & Student Mac confirms ACK
  const msgPromise3 = new Promise(r => studentMacSocket.on('POPUP_MESSAGE', () => r(true)));
  const ackPromise3 = new Promise(r => {
    masterWinSocket.on('MESSAGE_ACK', ack => { if (ack?.deviceId === macDevId) r(true); });
  });
  masterWinSocket.emit('TEACHER_SEND_POPUP_MESSAGE', { targetDeviceId: macDevId, title: 'Desde Windows', message: 'Examen C#', messageId: 'm3' });
  await msgPromise3;
  studentMacSocket.emit('MESSAGE_ACK', { deviceId: macDevId, messageId: 'm3', hostname: 'LAB01-MAC-02', timestamp: Date.now() });
  const s3Ack = await ackPromise3;

  // Remote input injection into macOS from Windows Master
  const inputPromise3 = new Promise(r => {
    studentMacSocket.on('REMOTE_INPUT_EVENT', env => {
      const p = env?.payload || env;
      r(p?.type === 'click' && p?.x === 0.4);
    });
  });
  masterWinSocket.emit('TEACHER_REMOTE_INPUT', { deviceId: macDevId, input: { type: 'click', x: 0.4, y: 0.6, button: 'left' } });
  const s3Input = await inputPromise3;

  const t5Passed = s3Unlock && s3Ack && s3Input;
  results.push({ test: '5. Escenario 3: Master Windows -> Student macOS (Desbloqueo, Mensaje ACK, Inyección Remota)', passed: t5Passed });
  console.log(`[TEST 5] Escenario 3 (Master Windows -> Student macOS): ${t5Passed ? 'ÉXITO' : 'FALLO'}`);

  // ========================================================
  // TEST 6: SCENARIO 4 — Master Windows -> Student Windows
  // ========================================================
  const lockPromise4 = new Promise(r => {
    studentWinSocket.on('COMMAND_DISPATCH', env => { if (env?.payload?.commandType === 'UNLOCK_SCREEN') r(true); });
  });
  masterWinSocket.emit('TEACHER_UNLOCK_DEVICE', { deviceId: winDevId });
  const s4Unlock = await lockPromise4;

  // File distribution from Windows Master to Windows Student
  const fileContent4 = 'Archivo binario distribuido desde Windows Master';
  const fileSha4 = crypto.createHash('sha256').update(fileContent4).digest('hex');
  const filePromise4 = new Promise(r => {
    studentWinSocket.on('FILE_SEND', env => {
      const p = env?.payload || env;
      const dec = Buffer.from(p.fileContentBase64, 'base64').toString('utf8');
      const hash = crypto.createHash('sha256').update(dec).digest('hex');
      r(hash === fileSha4);
    });
  });
  masterWinSocket.emit('TEACHER_SEND_FILE', { deviceId: winDevId, fileName: 'win.dat', fileSizeBytes: Buffer.byteLength(fileContent4), fileContentBase64: Buffer.from(fileContent4).toString('base64') });
  const s4File = await filePromise4;

  const t6Passed = s4Unlock && s4File;
  results.push({ test: '6. Escenario 4: Master Windows -> Student Windows (Desbloqueo, Archivo SHA-256)', passed: t6Passed });
  console.log(`[TEST 6] Escenario 4 (Master Windows -> Student Windows): ${t6Passed ? 'ÉXITO' : 'FALLO'}`);

  // ========================================================
  // TEST 7: BROADCAST DOCENTE MULTIPLATAFORMA (Mediasoup SFU)
  // Master macOS emite -> Student macOS Y Student Windows reciben señal SFU
  // ========================================================
  const macBroadcastReceiveMac = new Promise(r => studentMacSocket.on('TEACHER_BROADCAST_START', () => r(true)));
  const macBroadcastReceiveWin = new Promise(r => studentWinSocket.on('TEACHER_BROADCAST_START', () => r(true)));

  masterMacSocket.emit('TEACHER_BROADCAST_START', { classroomId: CLASSROOM_ID, mode: 'fullscreen', fps: 30, bitrateKbps: 2500 });
  const [b1, b2] = await Promise.all([macBroadcastReceiveMac, macBroadcastReceiveWin]);
  masterMacSocket.emit('TEACHER_BROADCAST_STOP', { classroomId: CLASSROOM_ID });

  const t7Passed = b1 && b2;
  results.push({ test: '7. Broadcast Mediasoup SFU: Master macOS emite simultáneamente a Student macOS y Student Windows', passed: t7Passed });
  console.log(`[TEST 7] Broadcast SFU desde Master macOS a ambos SOs: ${t7Passed ? 'ÉXITO' : 'FALLO'}`);

  // ========================================================
  // TEST 8: BROADCAST DOCENTE MULTIPLATAFORMA (Mediasoup SFU)
  // Master Windows emite -> Student macOS Y Student Windows reciben señal SFU
  // ========================================================
  const winBroadcastReceiveMac = new Promise(r => studentMacSocket.on('TEACHER_BROADCAST_START', () => r(true)));
  const winBroadcastReceiveWin = new Promise(r => studentWinSocket.on('TEACHER_BROADCAST_START', () => r(true)));

  masterWinSocket.emit('TEACHER_BROADCAST_START', { classroomId: CLASSROOM_ID, mode: 'fullscreen', fps: 30, bitrateKbps: 2500 });
  const [b3, b4] = await Promise.all([winBroadcastReceiveMac, winBroadcastReceiveWin]);
  masterWinSocket.emit('TEACHER_BROADCAST_STOP', { classroomId: CLASSROOM_ID });

  const t8Passed = b3 && b4;
  results.push({ test: '8. Broadcast Mediasoup SFU: Master Windows emite simultáneamente a Student macOS y Student Windows', passed: t8Passed });
  console.log(`[TEST 8] Broadcast SFU desde Master Windows a ambos SOs: ${t8Passed ? 'ÉXITO' : 'FALLO'}`);

  // ========================================================
  // TEST 9: ACCIÓN DE ENERGÍA MULTIPLATAFORMA EN AULA MIXTA
  // Master envía orden de reinicio al aula completa -> ambos SOs reciben POWER_ACTION
  // ========================================================
  const macPowerPromise = new Promise(r => studentMacSocket.on('POWER_ACTION', env => r((env?.payload || env)?.operation === 'reboot')));
  const winPowerPromise = new Promise(r => studentWinSocket.on('POWER_ACTION', env => r((env?.payload || env)?.operation === 'reboot')));

  masterMacSocket.emit('TEACHER_POWER_ACTION', { classroomId: CLASSROOM_ID, operation: 'reboot', delaySeconds: 5, force: true });
  const [p1, p2] = await Promise.all([macPowerPromise, winPowerPromise]);

  const t9Passed = p1 && p2;
  results.push({ test: '9. Gestión de Energía de Aula Mixta: Orden simultánea a Windows y macOS', passed: t9Passed });
  console.log(`[TEST 9] Comando de energía masivo en aula mixta: ${t9Passed ? 'ÉXITO' : 'FALLO'}`);

  // Clean up
  masterMacSocket.disconnect();
  masterWinSocket.disconnect();
  studentMacSocket.disconnect();
  studentWinSocket.disconnect();
  await pgClient.end();

  console.log('\n' + '='.repeat(80));
  console.log('       RESUMEN DE PRUEBAS MULTIPLATAFORMA AULA MIXTA (WINDOWS + macOS)');
  console.log('='.repeat(80));
  console.table(results);

  const allPassed = results.every(r => r.passed);
  console.log(`\nRESULTADO GENERAL: ${allPassed ? 'TODAS LAS PRUEBAS PASARON EXITOSAMENTE (100%)' : 'ALGUNA PRUEBA FALLÓ'}`);
}

runCrossPlatformClassroomVerification().catch(err => {
  console.error('Error fatal durante la prueba:', err);
  process.exit(1);
});
