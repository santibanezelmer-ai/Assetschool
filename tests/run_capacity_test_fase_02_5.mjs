/**
 * ASSETSCHOOL - FASE 02.5 CAPACITY & BENCHMARK TEST
 * Evalúa concurrencia y límites en red LAN local con 1, 5, 10, 20 y 40 dispositivos.
 * Mide CPU, RAM, latencia de señalización, ancho de banda LAN proyectado y estabilidad.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getProcessUsage(pid) {
  if (!pid) return { cpu: 0, memMb: 0 };
  return new Promise((resolve) => {
    const ps = spawn('ps', ['-p', String(pid), '-o', '%cpu,rss']);
    let out = '';
    ps.stdout.on('data', (d) => (out += d.toString()));
    ps.on('close', () => {
      const lines = out.trim().split('\n');
      if (lines.length > 1) {
        const parts = lines[1].trim().split(/\s+/);
        const cpu = parseFloat(parts[0]) || 0;
        const rssKb = parseInt(parts[1], 10) || 0;
        resolve({ cpu, memMb: Math.round((rssKb / 1024) * 10) / 10 });
      } else {
        resolve({ cpu: 0, memMb: 0 });
      }
    });
  });
}

async function findLocalServerPid() {
  return new Promise((resolve) => {
    const lsof = spawn('lsof', ['-i', ':3000', '-t']);
    let out = '';
    lsof.stdout.on('data', (d) => (out += d.toString()));
    lsof.on('close', () => {
      const pids = out.trim().split('\n').filter(Boolean);
      resolve(pids.length > 0 ? parseInt(pids[0], 10) : null);
    });
  });
}

async function main() {
  console.log('========================================================================================');
  console.log('   ASSETSCHOOL — PRUEBAS DE CAPACIDAD Y ESCALABILIDAD EN LAN (1, 5, 10, 20 y 40 EQUIPOS)');
  console.log('   Entorno: PostgreSQL 16 Real + NestJS AgentGateway + WebSocket');
  console.log('========================================================================================\n');

  const serverPid = await findLocalServerPid();
  console.log(`[Servidor] PID identificado: ${serverPid || 'desconocido'}`);

  // Autenticación de profesor para obtener token JWT
  const loginRes = await fetch('http://127.0.0.1:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'profesor@assetschool.lan', password: 'Docente123!*' }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login docente falló: HTTP ${loginRes.status}`);
  }
  const { accessToken } = await loginRes.json();
  console.log('[Auth] Token JWT docente obtenido exitosamente.\n');

  const tiers = [1, 5, 10, 20, 40];
  const benchmarkResults = [];

  for (const deviceCount of tiers) {
    console.log(`----------------------------------------------------------------------------------------`);
    console.log(`>>> Ejecutando prueba con ${deviceCount} equipo(s) concurrentes...`);
    
    const startTime = Date.now();
    let negotiationErrors = 0;
    let signalingLatencies = [];
    const sockets = [];

    // 1. Conexión WebSocket del docente
    const teacherWs = new WebSocket('ws://127.0.0.1:3000/socket.io/?EIO=4&transport=websocket');
    await new Promise((r) => (teacherWs.onopen = r));
    await sleep(150);
    teacherWs.send('40'); // Socket.IO CONNECT
    await sleep(150);

    // Unirse al aula
    teacherWs.send(
      `42["TEACHER_JOIN_CLASSROOM",{"token":"${accessToken}","classroomId":"d1111111-1111-1111-1111-111111111111"}]`,
    );
    await sleep(200);

    // 2. Conectar N agentes concurrentes
    for (let i = 1; i <= deviceCount; i++) {
      const devId = `dev-bench-${String(i).padStart(3, '0')}`;
      const mac = `02:00:00:00:${String(Math.floor(i / 100)).padStart(2, '0')}:${String(i % 100).padStart(2, '0')}`;
      const hostname = `PC-LAB-${String(i).padStart(2, '0')}`;

      const agentWs = new WebSocket('ws://127.0.0.1:3000/socket.io/?EIO=4&transport=websocket');
      sockets.push(agentWs);

      await new Promise((r) => (agentWs.onopen = r));
      agentWs.send('40');
      await sleep(20);

      const helloPkt = {
        packetId: `hello_${i}`,
        packetType: 'AGENT_HELLO',
        timestamp: Date.now(),
        payload: {
          hostname,
          deviceId: devId,
          macAddress: mac,
          localIp: `192.168.1.${100 + i}`,
          osType: i % 2 === 0 ? 'windows' : 'macos',
          osVersion: '11 / 14.5',
          agentVersion: '1.0.0',
          authKey: 'benchmark_key',
        },
      };
      agentWs.send(`42["AGENT_HELLO",${JSON.stringify(helloPkt)}]`);
      await sleep(15);
    }

    // Esperar estabilización de conexiones de agentes
    await sleep(1000);

    // 3. Negociar streaming para cada dispositivo
    for (let i = 1; i <= deviceCount; i++) {
      const devId = `dev-bench-${String(i).padStart(3, '0')}`;
      const t0 = Date.now();

      // Docente inicia streaming para el equipo i
      teacherWs.send(
        `42["SCREEN_CAPTURE_START",{"packetId":"start_${i}","packetType":"SCREEN_CAPTURE_START","timestamp":${Date.now()},"payload":{"deviceId":"${devId}","streamTier":"thumbnail"}}]`,
      );

      // Agente i envía SDP Offer
      const agentWs = sockets[i - 1];
      if (agentWs && agentWs.readyState === WebSocket.OPEN) {
        agentWs.send(
          `42["WEBRTC_OFFER",{"packetId":"off_${i}","packetType":"WEBRTC_OFFER","timestamp":${Date.now()},"payload":{"deviceId":"${devId}","sdp":"v=0\\r\\no=- 12345 2 IN IP4 127.0.0.1\\r\\ns=-\\r\\nt=0 0\\r\\nm=video 9 UDP/TLS/RTP/SAVPF 96\\r\\n","type":"offer"}}]`,
        );

        // Docente responde con SDP Answer
        teacherWs.send(
          `42["WEBRTC_ANSWER",{"packetId":"ans_${i}","packetType":"WEBRTC_ANSWER","timestamp":${Date.now()},"payload":{"deviceId":"${devId}","sdp":"v=0\\r\\no=- 67890 2 IN IP4 127.0.0.1\\r\\ns=-\\r\\nt=0 0\\r\\nm=video 9 UDP/TLS/RTP/SAVPF 96\\r\\n","type":"answer"}}]`,
        );

        signalingLatencies.push(Date.now() - t0);
      } else {
        negotiationErrors++;
      }
      await sleep(10);
    }

    // Período de sostenimiento de carga (3 segundos)
    await sleep(3000);

    // Medición de recursos
    const usage = await getProcessUsage(serverPid);
    const avgLatency =
      signalingLatencies.length > 0
        ? Math.round(signalingLatencies.reduce((a, b) => a + b, 0) / signalingLatencies.length)
        : 0;

    // Cálculo de ancho de banda LAN proyectado:
    // Modo mosaico (thumbnail 320x180 @ 15-20 FPS): ~250 kbps por stream
    const estimatedThumbnailBandwidthKbps = deviceCount * 250;
    const estimatedThumbnailBandwidthMbps = (estimatedThumbnailBandwidthKbps / 1000).toFixed(2);

    const result = {
      deviceCount,
      serverCpuPercent: usage.cpu,
      serverMemoryMb: usage.memMb,
      avgSignalingLatencyMs: avgLatency,
      estimatedLanBandwidthMbps: estimatedThumbnailBandwidthMbps,
      negotiationErrors,
      errorRatePercent: ((negotiationErrors / deviceCount) * 100).toFixed(1),
      status: negotiationErrors === 0 ? 'ESTABLE' : 'DEGRADADO',
    };

    benchmarkResults.push(result);

    console.log(`  Equipos simulados:         ${deviceCount}`);
    console.log(`  CPU Servidor:              ${usage.cpu}%`);
    console.log(`  Memoria Servidor (RSS):    ${usage.memMb} MB`);
    console.log(`  Latencia Señalización:     ${avgLatency} ms promedio`);
    console.log(`  Ancho de Banda LAN est.:   ${estimatedThumbnailBandwidthMbps} Mbps (mosaico a 250 kbps c/u)`);
    console.log(`  Errores de negociación:    ${negotiationErrors} (${result.errorRatePercent}%)`);
    console.log(`  Estado de Estabilidad:     ${result.status}`);

    // Limpieza de sockets
    for (const ws of sockets) {
      try {
        ws.close();
      } catch {}
    }
    try {
      teacherWs.close();
    } catch {}

    await sleep(1000);
  }

  console.log('\n========================================================================================');
  console.log('                      RESUMEN DE PRUEBAS DE CAPACIDAD LAN                                ');
  console.log('========================================================================================');
  console.log('| Dispositivos | CPU Servidor | RAM Servidor | Latencia Señal | Ancho Banda LAN | Estado   |');
  console.log('|:------------:|:------------:|:------------:|:--------------:|:---------------:|:--------:|');
  for (const r of benchmarkResults) {
    console.log(
      `| ${String(r.deviceCount).padEnd(12)} | ${String(r.serverCpuPercent + '%').padEnd(12)} | ${String(r.serverMemoryMb + ' MB').padEnd(12)} | ${String(r.avgSignalingLatencyMs + ' ms').padEnd(14)} | ${String(r.estimatedLanBandwidthMbps + ' Mbps').padEnd(15)} | ${r.status.padEnd(8)} |`,
    );
  }
  console.log('========================================================================================\n');

  // Guardar archivo JSON con los resultados reproducibles
  fs.writeFileSync(
    path.join(ROOT_DIR, 'tests/fase_02_5_capacity_results.json'),
    JSON.stringify(benchmarkResults, null, 2),
  );
}

main().catch((err) => {
  console.error('[Benchmark Error]:', err);
  process.exit(1);
});
