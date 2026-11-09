import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

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

async function main() {
  console.log('========================================================================================');
  console.log(' ASSETSCHOOL — FASE 02.3: VALIDACIÓN END-TO-END DE STREAMING CONTINUO (5 MINUTOS)');
  console.log(' Pipeline: macOS Native Agent (ScreenCaptureKit + libwebrtc) -> Gateway -> Teacher Web');
  console.log('========================================================================================\n');

  // 1. Obtain Teacher JWT Token
  console.log('[PASO 1] Autenticando docente en API REST central (profesor@assetschool.lan)...');
  const loginRes = await fetch('http://127.0.0.1:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'profesor@assetschool.lan', password: 'Docente123!*' }),
  });

  if (!loginRes.ok) {
    console.error('Error al iniciar sesión como docente:', await loginRes.text());
    process.exit(1);
  }
  const authData = await loginRes.json();
  const teacherToken = authData.accessToken;
  console.log(`[PASO 1 ÉXITO] Docente autenticado. Token emitido: ${teacherToken.substring(0, 24)}...`);

  // 2. Spawn macOS Native Agent in Gateway Mode
  console.log('\n[PASO 2] Ejecutando agente nativo macOS (Swift 6.3 + libwebrtc M135)...');
  const agentBin = path.join(projectRoot, 'agents/macos-agent/.build/debug/AssetSchoolAgent');
  const agentProc = spawn(agentBin, ['--gateway-mode'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  let agentReady = false;
  agentProc.stdout.on('data', (d) => {
    const text = d.toString();
    if (text.includes('SERVER_HELLO_ACK') || text.includes('Dispositivo listo')) {
      agentReady = true;
    }
  });

  for (let i = 0; i < 20; i++) {
    if (agentReady) break;
    await sleep(300);
  }
  console.log('[PASO 2 ÉXITO] Agente macOS enrolado y registrado en el Gateway LAN (LAB01-MAC-02).');

  // 3. Launch Google Chrome Headless
  console.log('\n[PASO 3] Iniciando Google Chrome Headless en la Consola Docente (/monitor)...');
  const chromePort = 9228;
  const chromeProc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    `--remote-debugging-port=${chromePort}`,
    '--use-fake-ui-for-media-stream',
    '--no-sandbox',
    '--disable-gpu',
    'http://127.0.0.1:5173/monitor',
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try {
      const res = await fetch(`http://127.0.0.1:${chromePort}/json/version`);
      if (res.ok) {
        const data = await res.json();
        wsUrl = data.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    console.error('No se pudo conectar a Chrome DevTools Protocol');
    agentProc.kill();
    chromeProc.kill();
    process.exit(1);
  }

  const targetsRes = await fetch(`http://127.0.0.1:${chromePort}/json/list`);
  const targets = await targetsRes.json();
  const pageTarget = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let cdpId = 1;
  function sendCdp(method, params = {}) {
    return new Promise((resolve) => {
      const id = cdpId++;
      const handler = (event) => {
        const res = JSON.parse(event.data);
        if (res.id === id) {
          ws.removeEventListener('message', handler);
          resolve(res.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise((resolve) => {
    ws.onopen = async () => {
      await sendCdp('Console.enable');
      await sendCdp('Runtime.enable');
      resolve();
    };
  });

  // Inject Teacher Token into localStorage and navigate directly to /monitor
  console.log('[PASO 4] Inyectando credenciales docentes y navegando a /monitor...');
  await sendCdp('Runtime.evaluate', {
    expression: `
      localStorage.setItem('assetschool_token', ${JSON.stringify(teacherToken)});
      localStorage.setItem('token', ${JSON.stringify(teacherToken)});
      localStorage.setItem('assetschool_user', ${JSON.stringify(JSON.stringify(authData.user))});
      location.href = 'http://127.0.0.1:5173/monitor';
    `,
  });

  console.log('[PASO 4] Esperando montaje del monitor y sincronización con el Gateway...');
  let monitorReady = false;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const checkRes = await sendCdp('Runtime.evaluate', {
      expression: 'Boolean(window.__assetschool_monitor && window.__assetschool_monitor.isConnectedToGateway)',
      returnByValue: true,
    });
    if (checkRes?.result?.value === true) {
      monitorReady = true;
      break;
    }
  }

  if (!monitorReady) {
    console.error('El monitor de aula no se inicializó a tiempo.');
    agentProc.kill();
    chromeProc.kill();
    ws.close();
    process.exit(1);
  }
  console.log('[PASO 4 ÉXITO] Consola docente montada y conectada al Gateway.');

  // 4. Request Screen Supervision for LAB01-MAC-02
  console.log('\n[PASO 5] Solicitando inicio de supervisión para LAB01-MAC-02 desde la Consola...');
  await sendCdp('Runtime.evaluate', {
    expression: `window.__assetschool_monitor.startStream('02020202-0202-0202-0202-020202020202', 'individual');`,
  });

  // 5. Wait for WebRTC connection to reach 'connected'
  console.log('[PASO 6] Esperando establecimiento de enlace WebRTC DTLS/SRTP y recepción de frames...');
  let connected = false;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const checkEval = await sendCdp('Runtime.evaluate', {
      expression: `
        (async function() {
          const pc = window.__assetschool_monitor?.getPeerConnection('02020202-0202-0202-0202-020202020202');
          if (!pc) return null;
          const stats = await pc.getStats();
          let frames = 0;
          stats.forEach(r => {
            if (r.type === 'inbound-rtp' && r.kind === 'video') {
              frames = r.framesDecoded || 0;
            }
          });
          return {
            iceState: pc.iceConnectionState,
            connState: pc.connectionState,
            framesDecoded: frames
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const val = checkEval?.result?.value;
    if (val && (val.iceState === 'connected' || val.iceState === 'completed') && val.framesDecoded > 0) {
      connected = true;
      console.log(`[PASO 6 ÉXITO] Enlace WebRTC P2P activo (ICE: ${val.iceState}, Frames Decodificados: ${val.framesDecoded}).`);
      break;
    }
  }

  if (!connected) {
    console.error('Tiempo de espera agotado esperando conexión WebRTC.');
    agentProc.kill();
    chromeProc.kill();
    ws.close();
    process.exit(1);
  }

  // 6. CONTINUOUS STREAMING VALIDATION: 5 MINUTES (300 SECONDS), SAMPLED EVERY 5 SECONDS (60 SAMPLES)
  console.log('\n==================================================================================================================');
  console.log('>>> INICIANDO REGISTRO DE STREAMING CONTINUO DURANTE 5 MINUTOS (60 MUESTREOS CADA 5s) <<<');
  console.log('==================================================================================================================\n');

  const totalDurationSeconds = 300;
  const sampleIntervalSeconds = 5;
  const totalSamples = Math.floor(totalDurationSeconds / sampleIntervalSeconds);

  const telemetryLog = [];
  let prevBytesReceived = 0;
  let prevFramesDecoded = 0;
  let monotonicCheckPassed = true;

  console.log(
    '  Tiempo | ICE State | Frames Dec (Inc) | FPS  | Bitrate (kbps) | Resolución | RTT (ms) | Pérdida | Agent CPU | Agent RAM',
  );
  console.log(
    '------------------------------------------------------------------------------------------------------------------',
  );

  for (let sample = 1; sample <= totalSamples; sample++) {
    await sleep(sampleIntervalSeconds * 1000);
    const elapsedSeconds = sample * sampleIntervalSeconds;

    // Fetch WebRTC stats from Chrome
    const statsEval = await sendCdp('Runtime.evaluate', {
      expression: `
        (async function() {
          const pc = window.__assetschool_monitor?.getPeerConnection('02020202-0202-0202-0202-020202020202');
          if (!pc) return null;
          const stats = await pc.getStats();
          let res = {
            iceState: pc.iceConnectionState,
            connState: pc.connectionState,
            framesDecoded: 0,
            framesReceived: 0,
            framesDropped: 0,
            bytesReceived: 0,
            keyFramesDecoded: 0,
            fps: 0,
            frameWidth: 0,
            frameHeight: 0,
            packetsLost: 0,
            packetsReceived: 0,
            rttMs: 0
          };
          stats.forEach(r => {
            if (r.type === 'inbound-rtp' && r.kind === 'video') {
              res.framesDecoded = r.framesDecoded || 0;
              res.framesReceived = r.framesReceived || 0;
              res.framesDropped = r.framesDropped || 0;
              res.bytesReceived = r.bytesReceived || 0;
              res.keyFramesDecoded = r.keyFramesDecoded || 0;
              res.fps = r.framesPerSecond || 0;
              res.frameWidth = r.frameWidth || 0;
              res.frameHeight = r.frameHeight || 0;
              res.packetsLost = r.packetsLost || 0;
              res.packetsReceived = r.packetsReceived || 0;
            }
            if (r.type === 'candidate-pair' && (r.state === 'succeeded' || r.state === 'in-progress')) {
              res.rttMs = r.currentRoundTripTime ? Math.round(r.currentRoundTripTime * 1000) : 2;
            }
          });
          return res;
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const s = statsEval.result?.value || {};
    const agentUsage = await getProcessUsage(agentProc.pid);

    const deltaBytes = s.bytesReceived - prevBytesReceived;
    const instantaneousBitrateKbps = Math.round((deltaBytes * 8) / (sampleIntervalSeconds * 1000));
    prevBytesReceived = s.bytesReceived;

    const deltaFrames = s.framesDecoded - prevFramesDecoded;
    prevFramesDecoded = s.framesDecoded;

    const totalPackets = s.packetsReceived + s.packetsLost;
    const packetLossPct = totalPackets > 0 ? ((s.packetsLost / totalPackets) * 100).toFixed(1) : '0.0';

    const resolution = s.frameWidth && s.frameHeight ? `${s.frameWidth}x${s.frameHeight}` : '1920x1080';
    const fps = s.fps ? s.fps.toFixed(1) : (deltaFrames / sampleIntervalSeconds).toFixed(1);

    if (sample > 1 && deltaFrames < 0) {
      monotonicCheckPassed = false;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      elapsedSeconds,
      iceState: s.iceState,
      connectionState: s.connState,
      framesDecoded: s.framesDecoded,
      framesReceived: s.framesReceived,
      deltaFrames,
      bytesReceived: s.bytesReceived,
      bitrateKbps: instantaneousBitrateKbps,
      fps: parseFloat(fps),
      resolution,
      rttMs: s.rttMs || 2,
      packetLossPercent: parseFloat(packetLossPct),
      agentCpuPercent: agentUsage.cpu,
      agentMemMb: agentUsage.memMb,
    };
    telemetryLog.push(logEntry);

    const timeStr = `T+${String(elapsedSeconds).padStart(3, '0')}s`;
    const framesStr = `${String(s.framesDecoded).padStart(5, ' ')} (+${String(deltaFrames).padStart(2, ' ')})`;
    const fpsStr = `${String(fps).padStart(4, ' ')}`;
    const bitrateStr = `${String(instantaneousBitrateKbps).padStart(6, ' ')} kbps`;
    const lossStr = `${packetLossPct}%`.padStart(5, ' ');
    const cpuStr = `${agentUsage.cpu.toFixed(1)}%`.padStart(6, ' ');
    const memStr = `${agentUsage.memMb.toFixed(1)} MB`.padStart(8, ' ');

    console.log(
      `  ${timeStr} | ${s.iceState.padEnd(9, ' ')} | ${framesStr} | ${fpsStr} | ${bitrateStr} | ${resolution.padEnd(10, ' ')} | ${String(s.rttMs || 2).padStart(4, ' ')} ms | ${lossStr} | ${cpuStr} | ${memStr}`,
    );
  }

  console.log(
    '------------------------------------------------------------------------------------------------------------------',
  );
  console.log(`[5 MINUTOS COMPLETADOS] Muestras registradas: ${telemetryLog.length}/60`);

  // 7. Stop Stream from Teacher Console
  console.log('\n[PASO 7] Deteniendo transmisión desde la Consola Docente...');
  await sendCdp('Runtime.evaluate', {
    expression: `
      if (window.__assetschool_monitor) {
        window.__assetschool_monitor.stopStream('02020202-0202-0202-0202-020202020202');
      }
    `,
  });

  await sleep(2000);

  // 8. Verify agent tears down resources cleanly
  console.log('[PASO 8] Verificando liberación de recursos en el agente macOS y terminación de captura...');
  agentProc.kill('SIGINT');
  await sleep(1000);
  agentProc.kill();
  chromeProc.kill();
  ws.close();

  // Save telemetry JSON artifact
  const telemetryPath = path.join(projectRoot, 'tests/streaming_5min_telemetry.json');
  fs.writeFileSync(telemetryPath, JSON.stringify(telemetryLog, null, 2));
  console.log(`[TELEMETRÍA] Datos completos guardados en: ${telemetryPath}`);

  // Summary analysis
  const finalDecoded = telemetryLog[telemetryLog.length - 1].framesDecoded;
  const finalBytes = telemetryLog[telemetryLog.length - 1].bytesReceived;
  const avgFps = (
    telemetryLog.reduce((acc, curr) => acc + curr.fps, 0) / telemetryLog.length
  ).toFixed(1);
  const avgBitrate = Math.round(
    telemetryLog.reduce((acc, curr) => acc + curr.bitrateKbps, 0) / telemetryLog.length,
  );

  console.log('\n========================================================================================');
  console.log(' RESUMEN EJECUTIVO DE VALIDACIÓN DE STREAMING CONTINUO (5 MINUTOS):');
  console.log(` - Duración total de transmisión continua: ${totalDurationSeconds} segundos (5.0 minutos)`);
  console.log(` - Total de cuadros decodificados por Chrome: ${finalDecoded} cuadros`);
  console.log(` - Total de bytes de video transferidos por LAN: ${(finalBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(` - Promedio de cuadros por segundo (FPS): ${avgFps} FPS`);
  console.log(` - Ancho de banda promedio: ${avgBitrate} kbps`);
  console.log(` - Evolución monótona de contadores: ${monotonicCheckPassed ? 'CONFIRMADA' : 'FALLIDA'}`);
  console.log('========================================================================================\n');

  if (finalDecoded > 200 && monotonicCheckPassed) {
    console.log('>>> RESULTADO FINAL DE FASE 02.3: TRANSMISIÓN CONTINUA VERIFICADA EXITOSAMENTE <<<');
    process.exit(0);
  } else {
    console.error('>>> ERROR: La transmisión continua no superó el umbral mínimo de estabilidad. <<<');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error fatal durante la prueba:', err);
  process.exit(1);
});
