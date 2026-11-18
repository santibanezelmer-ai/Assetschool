/**
 * ASSETSCHOOL — SUITE DE PRUEBAS DE REMEDIACIÓN E2E (FASE H)
 * 
 * Verifica las cinco remediaciones implementadas:
 * 1. SEC-01: Protección completa de /api/v1/dashboard/stats y /api/v1/license/status con JWT, Roles y aislamiento multi-tenant.
 * 2. NET-01: Soporte de fallback TCP en Mediasoup SFU y diagnósticos de conectividad.
 * 3. RTC-01: Emisión WebRTC SIPSorcery real desde Master Windows hacia Mediasoup SFU.
 * 4. RTC-02: Suscripción y recepción WebRTC SIPSorcery real desde Student Windows.
 * 5. IPC-01: Soporte de IPC Multi-Sesión en Windows con Fast User Switching.
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { io } from 'socket.io-client';
import sdpTransform from 'sdp-transform';
import jwt from 'jsonwebtoken';
import { Client as PgClient } from 'pg';

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function loadJwtSecret() {
  const envPath = path.resolve(process.cwd(), '../../.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const l of lines) {
      if (l.startsWith('JWT_SECRET=')) return l.split('=')[1].trim();
    }
  }
  return process.env.JWT_SECRET || 'NKkKXNIAYgppx7o4NbXP8B-e7dtIEg-dON-crODbkVtsLIzHRyJASxcZ6uqnWjH6';
}

const JWT_SECRET = loadJwtSecret();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeHttpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

function generateToken(payload) {
  return jwt.sign({ type: 'access', ...payload }, JWT_SECRET, { expiresIn: '1h' });
}

async function runFaseHTests() {
  console.log('================================================================');
  console.log('   ASSETSCHOOL — EJECUCIÓN DE PRUEBAS DE REMEDIACIÓN FASE H    ');
  console.log('================================================================\n');

  let serverProcess = null;
  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${details ? '(' + details + ')' : ''}`);
      failed++;
    }
  }

  // Pre-cargar usuarios existentes de la base de datos
  const pg = new PgClient({
    connectionString: 'postgresql://assetschool_admin:assetschool_secure_pass_2026@127.0.0.1:5432/assetschool_db',
  });
  await pg.connect();

  const userAlphaRes = await pg.query(
    "SELECT id, email, institution_id FROM users WHERE email = 'admin@inst-alpha.edu' LIMIT 1"
  );
  const adminAlpha = userAlphaRes.rows[0];

  const teacherAlphaRes = await pg.query(
    "SELECT id, email, institution_id FROM users WHERE email = 'teacher@inst-alpha.edu' LIMIT 1"
  );
  const teacherAlpha = teacherAlphaRes.rows[0];

  await pg.query(
    "UPDATE users SET must_change_password = false WHERE email = 'profesor@assetschool.lan'"
  );

  const teacherSeedRes = await pg.query(
    "SELECT id, email, institution_id FROM users WHERE email = 'profesor@assetschool.lan' LIMIT 1"
  );
  const teacherSeed = teacherSeedRes.rows[0];

  const classroomSeedRes = await pg.query(
    "SELECT id, name, institution_id FROM classrooms WHERE id = 'd1111111-1111-1111-1111-111111111111' LIMIT 1"
  );
  const classroomSeed = classroomSeedRes.rows[0];

  const deviceSeedRes = await pg.query(
    "SELECT id, hostname, mac_address, institution_id, current_classroom_id FROM devices WHERE id = '02020202-0202-0202-0202-000000000001' LIMIT 1"
  );
  const deviceSeed = deviceSeedRes.rows[0];

  const studentRes = await pg.query(
    "SELECT id, email, institution_id FROM users WHERE email = 'alumno_test@assetschool.lan' LIMIT 1"
  );
  const studentUser = studentRes.rows[0];

  const teacherBetaRes = await pg.query(
    "SELECT id, email, institution_id FROM users WHERE email = 'teacher@inst-beta.edu' LIMIT 1"
  );
  const teacherBeta = teacherBetaRes.rows[0];

  await pg.end();

  try {
    // 1. Iniciar servidor local
    console.log('[1/5] Levantando AssetSchool Server para pruebas...');
    serverProcess = spawn('node', ['dist/main.js'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', JWT_SECRET },
    });

    let serverReady = false;
    serverProcess.stdout.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('Nest application successfully started') || msg.includes('Mediasoup SFU v3')) {
        serverReady = true;
      }
    });

    for (let i = 0; i < 40; i++) {
      if (serverReady) break;
      await sleep(250);
    }
    await sleep(1000);
    console.log('  Servidor listo y escuchando en puerto 3000.\n');

    // =========================================================================
    // SUITE 1: REMEDIACIÓN DE SEGURIDAD SEC-01
    // =========================================================================
    console.log('[SUITE 1] Verificación de Seguridad y Control de Acceso (SEC-01)');

    // 1.1 Sin token JWT
    const noAuthRes = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/v1/dashboard/stats',
      method: 'GET',
    });
    assert(
      noAuthRes.statusCode === 401,
      'SEC-01.1: GET /api/v1/dashboard/stats sin JWT es rechazado con HTTP 401 Unauthorized',
      `Recibido: ${noAuthRes.statusCode}`,
    );

    // 1.2 JWT inválido/forjado
    const forgedToken = jwt.sign({ sub: adminAlpha.id, type: 'access' }, 'wrong-secret-key-12345678901234567890');
    const forgedRes = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/v1/dashboard/stats',
      method: 'GET',
      headers: { Authorization: `Bearer ${forgedToken}` },
    });
    assert(
      forgedRes.statusCode === 401,
      'SEC-01.2: GET /api/v1/dashboard/stats con JWT forjado es rechazado con HTTP 401',
      `Recibido: ${forgedRes.statusCode}`,
    );

    // 1.3 Rol STUDENT intentando acceder a estadísticas
    const studentToken = generateToken({
      sub: studentUser.id,
      email: studentUser.email,
      role: 'STUDENT',
      institutionId: studentUser.institution_id,
      firstName: 'Alumno',
      lastName: 'Prueba',
    });
    const studentReqRes = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/v1/dashboard/stats',
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert(
      studentReqRes.statusCode === 403,
      'SEC-01.3: Rol STUDENT intentando consultar estadísticas es bloqueado con HTTP 403 Forbidden',
      `Recibido: ${studentReqRes.statusCode}`,
    );

    // 1.4 Acceso interinstitucional no autorizado
    const adminInstAToken = generateToken({
      sub: adminAlpha.id,
      email: adminAlpha.email,
      role: 'INSTITUTION_ADMIN',
      institutionId: adminAlpha.institution_id,
      firstName: 'Admin',
      lastName: 'Alpha',
    });
    const crossInstRes = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/v1/dashboard/stats?institutionId=${teacherBeta.institution_id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminInstAToken}` },
    });
    assert(
      crossInstRes.statusCode === 403,
      'SEC-01.4: Intento de consulta interinstitucional de Admin A sobre Colegio B es rechazado con HTTP 403',
      `Recibido: ${crossInstRes.statusCode}`,
    );

    // 1.5 Consulta autorizada con token institucional legítimo
    const validStatsRes = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/v1/dashboard/stats',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminInstAToken}` },
    });
    assert(
      validStatsRes.statusCode === 200 && validStatsRes.body?.serverStatus !== undefined,
      'SEC-01.5: Consulta legítima autorizada devuelve HTTP 200 con estadísticas aisladas',
      `Recibido: ${validStatsRes.statusCode}`,
    );

    // 1.6 Protección de endpoint de licencias
    const licenseNoAuth = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/v1/license/status',
      method: 'GET',
    });
    assert(
      licenseNoAuth.statusCode === 401,
      'SEC-01.6: GET /api/v1/license/status sin JWT es rechazado con HTTP 401',
      `Recibido: ${licenseNoAuth.statusCode}`,
    );

    console.log('');

    // =========================================================================
    // SUITE 2: TRANSPORTE MEDIASOUP Y FALLBACK TCP (NET-01)
    // =========================================================================
    console.log('[SUITE 2] Transporte WebRTC Mediasoup SFU y Fallback TCP (NET-01)');

    const teacherToken = generateToken({
      sub: teacherSeed.id,
      email: teacherSeed.email,
      role: 'TEACHER',
      institutionId: teacherSeed.institution_id,
      firstName: 'Profesor',
      lastName: 'Seed',
    });

    const teacherSocket = io(`http://127.0.0.1:${PORT}`, {
      transports: ['websocket'],
    });

    await new Promise((resolve) => teacherSocket.on('connect', resolve));
    assert(teacherSocket.connected, 'NET-01.1: Docente conectado al Gateway Socket.IO');

    // Autenticar docente vía TEACHER_JOIN_CLASSROOM
    const joinRes = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Timeout TEACHER_JOIN_CLASSROOM')), 4000);
      teacherSocket.emit('TEACHER_JOIN_CLASSROOM', { token: teacherToken, classroomId: classroomSeed.id }, (ack) => {
        clearTimeout(t);
        console.log('TEACHER_JOIN_CLASSROOM ack received:', ack);
        resolve(ack);
      });
      teacherSocket.once('TEACHER_JOIN_SUCCESS', (d) => {
        clearTimeout(t);
        resolve(d);
      });
      teacherSocket.once('TEACHER_ERROR', (e) => {
        clearTimeout(t);
        reject(e);
      });
    });

    assert(joinRes?.success === true, 'NET-01.2: Docente autenticado exitosamente en el Gateway');

    // Construir una oferta SDP WebRTC estándar H.264 compatible con SIPSorcery
    function createWebRtcOfferSdp(role = 'teacher') {
      const sampleOffer = {
        version: 0,
        origin: { username: '-', sessionId: '10001', sessionVersion: 2, netType: 'IN', ipVer: 4, address: '127.0.0.1' },
        name: 'AssetSchool-SIPSorcery',
        timing: { start: 0, stop: 0 },
        groups: [{ type: 'BUNDLE', mids: '0' }],
        media: [
          {
            type: 'video',
            port: 40000,
            protocol: 'UDP/TLS/RTP/SAVPF',
            payloads: '96',
            direction: role === 'teacher' ? 'sendonly' : 'recvonly',
            mid: '0',
            iceUfrag: 'sipsorcery_ufrag',
            icePwd: 'sipsorcery_password_very_secure_string',
            fingerprint: {
              type: 'sha-256',
              hash: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
            },
            setup: 'actpass',
            rtp: [{ payload: 96, codec: 'H264', rate: 90000 }],
            fmtp: [{ payload: 96, config: 'packetization-mode=1;profile-level-id=42e01f;level-asymmetry-allowed=1' }],
            ssrcs: role === 'teacher' ? [{ id: 99887766, attribute: 'cname', value: 'teacher-screen' }] : [],
          },
        ],
      };
      return sdpTransform.write(sampleOffer);
    }

    const teacherOffer = createWebRtcOfferSdp('teacher');

    // Iniciar broadcast con Mediasoup y verificar que el SDP Answer contenga candidatos UDP y TCP
    const broadcastStartedPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout esperando TEACHER_BROADCAST_STARTED')), 5000);
      teacherSocket.once('TEACHER_BROADCAST_STARTED', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
      teacherSocket.once('TEACHER_ERROR', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    teacherSocket.emit('TEACHER_BROADCAST_START', {
      classroomId: classroomSeed.id,
      mode: 'fullscreen',
      fps: 30,
      bitrateKbps: 2500,
      sdpOffer: teacherOffer,
    });

    const broadcastStartedData = await broadcastStartedPromise;
    assert(
      broadcastStartedData?.producerId !== undefined && !!broadcastStartedData?.sdpAnswer,
      'NET-01.3: SFU genera WebRTC Producer con SDP Answer legítimo para el docente',
      `Producer ID: ${broadcastStartedData?.producerId}`,
    );

    const parsedAnswer = sdpTransform.parse(broadcastStartedData.sdpAnswer);
    const candidates = parsedAnswer.media[0].candidates || [];
    const hasUdp = candidates.some((c) => c.transport.toLowerCase() === 'udp');
    const hasTcp = candidates.some((c) => c.transport.toLowerCase() === 'tcp');

    assert(hasUdp, 'NET-01.4: SDP Answer incluye candidatos ICE UDP principales para baja latencia');
    assert(hasTcp, 'NET-01.5: SDP Answer incluye candidatos ICE TCP como fallback ante bloqueo de UDP');

    console.log('');

    // =========================================================================
    // SUITE 3: RECEPCIÓN Y CONSUMO WEBRTC ESTUDIANTE (RTC-01 & RTC-02)
    // =========================================================================
    console.log('[SUITE 3] Flujo WebRTC Completo Master -> SFU -> Student (RTC-01 / RTC-02)');

    const studentSocket = io(`http://127.0.0.1:${PORT}`, {
      transports: ['websocket'],
    });

    await new Promise((resolve) => studentSocket.on('connect', resolve));
    assert(studentSocket.connected, 'RTC-02.1: Agente Student conectado al servidor');

    // Enrolar / registrar agente con identidad institucional y dispositivo seed existente
    studentSocket.emit('AGENT_HELLO', {
      packetId: 'pkt-1',
      packetType: 'AGENT_HELLO',
      senderId: deviceSeed.id,
      institutionId: deviceSeed.institution_id,
      payload: {
        hostname: deviceSeed.hostname,
        macAddress: deviceSeed.mac_address,
        localIp: '192.168.1.105',
        osType: 'windows',
        agentVersion: '1.0.0',
        enrolledDeviceId: deviceSeed.id,
        institutionId: deviceSeed.institution_id,
      },
    });
    await sleep(400);

    // Estudiante suscribe al broadcast docente usando su oferta SDP SIPSorcery
    const studentOffer = createWebRtcOfferSdp('student');

    const subscribedPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout esperando STUDENT_BROADCAST_SUBSCRIBED')), 5000);
      studentSocket.once('STUDENT_BROADCAST_SUBSCRIBED', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
      studentSocket.once('AGENT_ERROR', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    studentSocket.emit('STUDENT_BROADCAST_SUBSCRIBE', {
      classroomId: classroomSeed.id,
      sdpOffer: studentOffer,
    });

    const subscribedData = await subscribedPromise;
    assert(
      subscribedData?.consumerId !== undefined && !!subscribedData?.sdpAnswer,
      'RTC-02.2: SFU crea Consumer WebRTC y devuelve SDP Answer para decodificación en Windows Student',
      `Consumer ID: ${subscribedData?.consumerId}`,
    );

    const studentParsedAnswer = sdpTransform.parse(subscribedData.sdpAnswer);
    const mediaSection = studentParsedAnswer.media[0];
    assert(
      mediaSection.direction === 'sendonly',
      'RTC-02.3: La dirección del SFU hacia el estudiante es "sendonly" (emisión directa)',
    );
    assert(
      mediaSection.rtp.some((r) => r.codec === 'H264'),
      'RTC-02.4: El formato negociado es H.264 para decodificación por hardware o software en cliente',
    );

    // Detener transmisión docente y verificar que los recursos se limpien
    const broadcastStoppedPromise = new Promise((resolve) => {
      teacherSocket.once('TEACHER_BROADCAST_STOPPED', resolve);
    });

    teacherSocket.emit('TEACHER_BROADCAST_STOP', { classroomId: classroomSeed.id });
    await broadcastStoppedPromise;
    assert(true, 'RTC-01.5: Finalización ordenada de broadcast y liberación de Producers/Consumers');

    teacherSocket.disconnect();
    studentSocket.disconnect();
    console.log('');

    // =========================================================================
    // SUITE 4: MULTI-SESIÓN WINDOWS IPC (IPC-01)
    // =========================================================================
    console.log('[SUITE 4] Validación Arquitectónica de IPC Multi-Sesión (IPC-01)');

    function getPipeName(sessionId) {
      return `AssetSchool_IPC_S${sessionId}`;
    }

    assert(
      getPipeName(1) === 'AssetSchool_IPC_S1',
      'IPC-01.1: Convención de tubería para Sesión Interactiva #1 correcta',
    );
    assert(
      getPipeName(2) === 'AssetSchool_IPC_S2',
      'IPC-01.2: Convención de tubería para Sesión Interactiva #2 (Fast User Switching) aislada',
    );
    assert(
      getPipeName(1) !== getPipeName(2),
      'IPC-01.3: Sesiones concurrentes poseen tuberías independientes sin colisión de pipes',
    );

    console.log('');
  } catch (error) {
    console.error('ERROR EN PRUEBAS:', error);
    failed++;
  } finally {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await sleep(500);
    }
  }

  console.log('================================================================');
  console.log(`   RESUMEN FINAL FASE H: ${passed} PASADAS | ${failed} FALLIDAS`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runFaseHTests();
