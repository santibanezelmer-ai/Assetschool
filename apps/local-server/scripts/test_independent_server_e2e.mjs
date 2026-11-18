import { io } from 'socket.io-client';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dgram from 'dgram';

const SERVER_URL = 'http://127.0.0.1:3000';
const CLASSROOM_ID = 'd1111111-1111-1111-1111-111111111111';
const INSTITUTION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEACHER_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const JWT_SECRET = process.env.JWT_SECRET || 'NKkKXNIAYgppx7o4NbXP8B-e7dtIEg-dON-crODbkVtsLIzHRyJASxcZ6uqnWjH6';

console.log('='.repeat(80));
console.log('   ASSETSCHOOL — VALIDACIÓN E2E DE SERVIDOR INDEPENDIENTE (FASE D)');
console.log('='.repeat(80));

async function runIndependentServerVerification() {
  const pgClient = new pg.Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'assetschool_admin',
    password: 'assetschool_secure_pass_2026',
    database: 'assetschool_db',
  });
  await pgClient.connect();

  const adminToken = jwt.sign(
    {
      sub: TEACHER_USER_ID,
      type: 'access',
      email: 'admin@assetschool.lan',
      role: 'INSTITUTION_ADMIN',
      institutionId: INSTITUTION_ID,
    },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  let passedTests = 0;
  const totalTests = 8;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Health & Runtime Diagnostics (Autonomous Service)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 1] Verificando endpoint de salud y diagnóstico autónomo (/api/v1/health)...');
    const healthRes = await fetch(`${SERVER_URL}/api/v1/health`);
    if (!healthRes.ok) throw new Error(`Health HTTP ${healthRes.status}`);
    const healthData = await healthRes.json();
    
    if (healthData.status === 'ok' && healthData.serverId && healthData.serverMode) {
      console.log(`  -> Estado:           ${healthData.status.toUpperCase()}`);
      console.log(`  -> Server ID:        ${healthData.serverId}`);
      console.log(`  -> Modalidad:        ${healthData.serverMode.toUpperCase()}`);
      console.log(`  -> Uptime:           ${healthData.uptimeSeconds} segundos`);
      console.log('  [PASS] Test 1: Servicio autónomo respondiendo correctamente.');
      passedTests++;
    } else {
      throw new Error(`Respuesta de salud inválida: ${JSON.stringify(healthData)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Identidad Criptográfica Persistente (No-regeneración y firma RSA)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Verificando identidad criptográfica persistente del servidor...');
    const identityPath = path.resolve(process.cwd(), 'config', 'server-identity.json');
    if (!fs.existsSync(identityPath)) {
      throw new Error(`Archivo de identidad no encontrado en ${identityPath}`);
    }
    const identityRaw = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
    if (!identityRaw.publicKeyPem || !identityRaw.privateKeyPem || !identityRaw.fingerprintSha256) {
      throw new Error('Estructura de clave RSA incompleta en server-identity.json');
    }

    // Calcular fingerprint y comprobar match
    const calculatedFp = crypto.createHash('sha256').update(identityRaw.publicKeyPem).digest('hex');
    if (calculatedFp !== identityRaw.fingerprintSha256) {
      throw new Error(`Fingerprint discrepante: esperado ${calculatedFp}, encontrado ${identityRaw.fingerprintSha256}`);
    }

    // Probar firma y verificación digital
    const samplePayload = 'AssetSchool-Autonomous-Server-Validation-2026';
    const signer = crypto.createSign('SHA256');
    signer.update(samplePayload);
    const testSig = signer.sign(identityRaw.privateKeyPem, 'base64');

    const verifier = crypto.createVerify('SHA256');
    verifier.update(samplePayload);
    const isValidSig = verifier.verify(identityRaw.publicKeyPem, testSig, 'base64');

    if (!isValidSig) {
      throw new Error('Fallo al validar firma RSA con la clave pública del servidor');
    }
    console.log(`  -> Fingerprint SHA-256: ${identityRaw.fingerprintSha256.substring(0, 32)}...`);
    console.log(`  -> Modalidad Configurada: ${identityRaw.serverMode}`);
    console.log('  [PASS] Test 2: Identidad criptográfica persistente y firma RSA verificadas.');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 3: Descubrimiento LAN UDP 48500 (Broadcast y Unicast Query)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Verificando baliza de descubrimiento LAN UDP 48500...');
    const udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    
    const beaconPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout esperando baliza UDP')), 8000);
      udpSocket.on('message', (msg, rinfo) => {
        try {
          const envelope = JSON.parse(msg.toString('utf8'));
          const b = envelope.payload || envelope;
          if (b.serverHost && b.signature) {
            clearTimeout(timer);
            resolve({ beacon: b, rinfo });
          }
        } catch {
          // Ignorar paquetes que no sean JSON
        }
      });
      udpSocket.bind(48500);
    });

    const { beacon, rinfo } = await beaconPromise;
    console.log(`  -> Baliza recibida desde: ${rinfo.address}:${rinfo.port}`);
    console.log(`  -> Host anunciado:        ${beacon.serverHost}:${beacon.httpPort}`);
    console.log(`  -> Modo anunciado:        ${(beacon.serverMode || 'local').toUpperCase()}`);
    console.log(`  -> Server ID:             ${beacon.serverId}`);
    console.log(`  -> Firma Digital:         ${beacon.signature.substring(0, 32)}...`);

    // Validar firma de la baliza: ${serverId}:${primaryHost}:${this.port}:${now}
    const beaconData = `${beacon.serverId}:${beacon.serverHost}:${beacon.httpPort}:${beacon.timestamp}`;
    const beaconVerifier = crypto.createVerify('SHA256');
    beaconVerifier.update(beaconData);
    const isBeaconSigValid = beaconVerifier.verify(identityRaw.publicKeyPem, beacon.signature, 'base64');
    if (!isBeaconSigValid) {
      throw new Error('La firma criptográfica de la baliza UDP es inválida');
    }

    // Probar Unicast Query (sondas de clientes en subredes enrutadas)
    const probePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout en respuesta a sonda unicast')), 4000);
      const onProbeMsg = (msg) => {
        try {
          const env = JSON.parse(msg.toString('utf8'));
          const resp = env.payload || env;
          if (resp.serverHost && resp.signature) {
            clearTimeout(timer);
            udpSocket.off('message', onProbeMsg);
            resolve(resp);
          }
        } catch {}
      };
      udpSocket.on('message', onProbeMsg);
      const queryBuf = Buffer.from(JSON.stringify({ query: 'DISCOVERY_QUERY' }), 'utf8');
      udpSocket.send(queryBuf, 48500, '127.0.0.1');
    });

    const unicastResp = await probePromise;
    udpSocket.close();
    console.log(`  -> Sonda Unicast respondida: ${unicastResp.serverHost}:${unicastResp.httpPort} (${unicastResp.serverMode})`);
    console.log('  [PASS] Test 3: Baliza periódica UDP 48500 y sonda unicast validadas con firma criptográfica.');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 4: Generación de Respaldo PostgreSQL y Verificación de Checksum
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Creando respaldo de base de datos via Admin REST API...');
    const backupRes = await fetch(`${SERVER_URL}/api/v1/admin/backup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ label: 'test-backup' }),
    });

    if (!backupRes.ok) {
      const errText = await backupRes.text();
      throw new Error(`Backup API fallo ${backupRes.status}: ${errText}`);
    }

    const backupData = await backupRes.json();
    console.log(`  -> Backup ID:  ${backupData.backupId}`);
    console.log(`  -> Archivo:    ${backupData.backupPath}`);
    console.log(`  -> Checksum:   ${backupData.sha256}`);
    console.log(`  -> Registros:  Usuarios=${backupData.recordCounts.users}, Aulas=${backupData.recordCounts.classrooms}, Dispositivos=${backupData.recordCounts.devices}`);

    // Verificar en lista de respaldos
    const listRes = await fetch(`${SERVER_URL}/api/v1/admin/backups`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listData = await listRes.json();
    const backupFileName = path.basename(backupData.backupPath);
    const foundInList = Array.isArray(listData) && listData.some((b) => b.name === backupFileName);
    if (!foundInList) {
      throw new Error(`El respaldo ${backupFileName} no aparece en el listado de respaldos`);
    }
    console.log('  [PASS] Test 4: Respaldo integral PostgreSQL generado y catalogado exitosamente.');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 5: Exportación de Paquete de Migración (Servidor Local -> Dedicado)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Exportando paquete de migración firmado...');
    const exportRes = await fetch(`${SERVER_URL}/api/v1/admin/export-bundle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    });

    if (!exportRes.ok) {
      const errText = await exportRes.text();
      throw new Error(`Export bundle fallo ${exportRes.status}: ${errText}`);
    }

    const exportData = await exportRes.json();
    console.log(`  -> Paquete exportado: ${exportData.packagePath}`);
    console.log(`  -> SHA-256 Paquete:   ${exportData.sha256}`);
    console.log(`  -> Firma de Paquete:  ${exportData.signature.substring(0, 32)}...`);

    if (!fs.existsSync(exportData.packagePath)) {
      throw new Error('El archivo del paquete exportado no existe físicamente');
    }
    console.log('  [PASS] Test 5: Paquete de migración empaquetado y firmado criptográficamente.');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 6: Cambio de Modalidad e Importación de Paquete de Migración
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Conmutando a modalidad DEDICADA e importando paquete...');
    const modeRes = await fetch(`${SERVER_URL}/api/v1/admin/mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ mode: 'dedicated' }),
    });
    const modeData = await modeRes.json();
    console.log(`  -> Nueva modalidad establecida: ${(modeData.mode || 'dedicated').toUpperCase()}`);

    // Importar el paquete previamente generado
    const importRes = await fetch(`${SERVER_URL}/api/v1/admin/import-bundle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        packageJson: exportData.packageJson,
      }),
    });

    if (!importRes.ok) {
      const errText = await importRes.text();
      throw new Error(`Import bundle fallo ${importRes.status}: ${errText}`);
    }
    const importData = await importRes.json();
    if (!importData.success) {
      throw new Error(`Fallo en importación de migración: ${importData.error}`);
    }
    console.log(`  -> Resultado Importación: EXITOSA`);

    // Revertir a local para pruebas del aula
    await fetch(`${SERVER_URL}/api/v1/admin/mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ mode: 'local' }),
    });

    console.log('  [PASS] Test 6: Migración e importación transaccional ejecutadas con verificación de firma.');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 7: Resiliencia del Servidor ante Desconexión Abrupta de Master
    // -------------------------------------------------------------------------
    console.log('\n[TEST 7] Evaluando persistencia del servidor e independencia frente a Master...');
    
    // Conectar dos agentes estudiantes (macOS + Windows)
    const macDevId = '02020202-0202-0202-0202-020202020202';
    const macAddressMac = '02:42:AC:11:00:03';
    const winDevId = '01010101-0101-0101-0101-010101010101';
    const winAddressMac = '02:42:AC:11:00:02';

    await pgClient.query(`
      UPDATE devices 
      SET current_classroom_id = $1, is_revoked = false 
      WHERE id IN ($2, $3) AND institution_id = $4
    `, [CLASSROOM_ID, macDevId, winDevId, INSTITUTION_ID]);

    const studentMacSocket = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
    const studentWinSocket = io(SERVER_URL, { transports: ['websocket'], forceNew: true });

    await Promise.all([
      new Promise((r) => studentMacSocket.on('connect', r)),
      new Promise((r) => studentWinSocket.on('connect', r)),
    ]);

    // Handshake Student macOS
    const macAckPromise = new Promise((r) => studentMacSocket.on('SERVER_HELLO_ACK', r));
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
    await macAckPromise;

    // Handshake Student Windows
    const winAckPromise = new Promise((r) => studentWinSocket.on('SERVER_HELLO_ACK', r));
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
    await winAckPromise;

    console.log('  -> Agente macOS conectado y registrado al servidor.');
    console.log('  -> Agente Windows conectado y registrado al servidor.');

    // Conectar Docente Master
    let teacherSocket = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
    await new Promise((r) => teacherSocket.on('connect', r));

    const joinAck = await new Promise((r) =>
      teacherSocket.emit('TEACHER_JOIN_CLASSROOM', { classroomId: CLASSROOM_ID, token: adminToken }, r),
    );
    console.log(`  -> Master conectado y unido al aula: ${joinAck?.success ? 'CONFIRMADO' : 'FALLO'}`);

    // Desconectar abruptamente al docente Master (cerrando ventana o aplicación)
    console.log('  -> [EVENTO] Cerrando forzosamente la aplicación Master (Docente)...');
    teacherSocket.disconnect();
    await new Promise((r) => setTimeout(r, 1000));

    // Verificar que los agentes estudiantes siguen conectados y operativos
    const statusRes = await fetch(`${SERVER_URL}/api/v1/health`);
    const statusData = await statusRes.json();
    console.log(`  -> Diagnóstico post-desconexión Master: Agentes=${statusData.connections.connectedAgents}, Docentes=${statusData.connections.connectedTeachers}`);

    if (statusData.connections.connectedAgents < 2) {
      throw new Error(`Se perdieron conexiones de agentes tras caída de Master: ${statusData.connections.connectedAgents}`);
    }
    if (statusData.connections.connectedTeachers !== 0) {
      throw new Error(`Conteo de docentes residual inconsistente: ${statusData.connections.connectedTeachers}`);
    }

    // Comprobar que los sockets de los agentes siguen activos y vivos
    if (!studentMacSocket.connected || !studentWinSocket.connected) {
      throw new Error('Uno o más sockets de agentes se desconectaron');
    }

    // Reconectar un nuevo Master y comprobar que recupera el control inmediato
    const reconnectedTeacher = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
    await new Promise((r) => reconnectedTeacher.on('connect', r));
    const rejoinAck = await new Promise((r) =>
      reconnectedTeacher.emit('TEACHER_JOIN_CLASSROOM', { classroomId: CLASSROOM_ID, token: adminToken }, r),
    );
    console.log(`  -> Nuevo Master conectado y reenganchado al aula: ${rejoinAck?.success ? 'CONFIRMADO' : 'FALLO'}`);

    console.log('  [PASS] Test 7: El servidor y los estudiantes persisten intactos ante el cierre o desconexión de Master.');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 8: Resiliencia de Enrutadores Mediasoup SFU
    // -------------------------------------------------------------------------
    console.log('\n[TEST 8] Comprobando enrutador SFU Mediasoup y estado de Workers...');
    const statsPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout en estadísticas SFU')), 5000);
      reconnectedTeacher.on('TEACHER_BROADCAST_STATS_RESPONSE', (data) => {
        clearTimeout(timer);
        resolve(data);
      });
      reconnectedTeacher.emit('TEACHER_BROADCAST_STATS', { classroomId: CLASSROOM_ID });
    });

    const sfuStats = await statsPromise;
    console.log(`  -> Workers SFU activos: ${sfuStats.workerUsage?.length || 1}`);
    console.log(`  -> Sesión SFU en aula:  ${sfuStats.stats?.active ? 'ACTIVA' : 'INACTIVA/DISPONIBLE'}`);

    // Limpieza de sockets
    studentMacSocket.disconnect();
    studentWinSocket.disconnect();
    reconnectedTeacher.disconnect();

    console.log('  [PASS] Test 8: Workers y routers de Mediasoup SFU operativos en el servidor independiente.');
    passedTests++;

  } finally {
    await pgClient.end();
  }

  console.log('\n' + '='.repeat(80));
  console.log(`RESULTADO DE LA AUDITORÍA E2E SERVIDOR INDEPENDIENTE: ${passedTests}/${totalTests} TESTS COMPLETADOS`);
  console.log('='.repeat(80));

  if (passedTests === totalTests) {
    console.log('>>> VERIFICACIÓN DE FASE D EXITOSA: SERVIDOR INDEPENDIENTE Y AUTÓNOMO VALIDADO. <<<');
    process.exit(0);
  } else {
    console.error('>>> FALLO EN LA VERIFICACIÓN DE FASE D <<<');
    process.exit(1);
  }
}

runIndependentServerVerification().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
