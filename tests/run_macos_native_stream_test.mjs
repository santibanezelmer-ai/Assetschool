import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. Static HTTP Server
const server = http.createServer((req, res) => {
  const filePath = path.join(projectRoot, req.url);
  if (fs.existsSync(filePath)) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

await new Promise((resolve) => server.listen(8089, '127.0.0.1', resolve));
console.log('[TEST RUNNER] Servidor HTTP de prueba escuchando en http://127.0.0.1:8089');

// 2. Launch Chrome Headless with CDP
console.log('[TEST RUNNER] Iniciando Google Chrome Headless en puerto CDP 9223...');
const chromeProc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--remote-debugging-port=9223',
  '--use-fake-ui-for-media-stream',
  '--no-sandbox',
  '--disable-gpu',
  'http://127.0.0.1:8089/tests/webrtc_macos_agent_test.html',
]);

// Wait for CDP
let wsUrl = null;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 400));
  try {
    const res = await fetch('http://127.0.0.1:9223/json/version');
    if (res.ok) {
      const data = await res.json();
      wsUrl = data.webSocketDebuggerUrl;
      break;
    }
  } catch {}
}

if (!wsUrl) {
  console.error('[TEST RUNNER ERROR] No se pudo conectar a Chrome CDP');
  chromeProc.kill();
  server.close();
  process.exit(1);
}

// Find Page Target
const targetsRes = await fetch('http://127.0.0.1:9223/json/list');
const targets = await targetsRes.json();
const pageTarget = targets.find((t) => t.type === 'page');
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

await new Promise((resolve) => {
  ws.onopen = () => {
    ws.send(JSON.stringify({ id: 1, method: 'Console.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 3, method: 'Runtime.addBinding', params: { name: 'onChromeCandidateReady' } }));
    resolve();
  };
});

// 3. Spawn macOS Native Agent with libwebrtc
const agentBin = path.join(projectRoot, 'agents/macos-agent/.build/debug/AssetSchoolAgent');
console.log(`[TEST RUNNER] Ejecutando agente nativo macOS: ${agentBin} --json-signaling`);

const agentProc = spawn(agentBin, ['--json-signaling'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

let testPassed = false;
let testFinished = false;

// Handle Chrome CDP messages
ws.onmessage = async (event) => {
  const msg = JSON.parse(event.data);

  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args.map((a) => a.value || a.description).join(' ');
    console.log('  [CHROME LOG]', text);

    if (text.includes('TEST RESULT: PASSED')) {
      testPassed = true;
      testFinished = true;
    }
  }

  // Handle Chrome ICE Candidate binding
  if (msg.method === 'Runtime.bindingCalled' && msg.params.name === 'onChromeCandidateReady') {
    const candidateJson = JSON.parse(msg.params.payload);
    // Send to Swift libwebrtc
    agentProc.stdin.write(JSON.stringify({
      action: 'add_candidate',
      candidate: candidateJson,
    }) + '\n');
  }
};

// Handle Swift Agent JSON output
let buffer = '';
agentProc.stdout.on('data', async (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // keep last incomplete line

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      console.log(`  [AGENT STDOUT EVENT] ${data.event}`);

      if (data.event === 'sdp_offer') {
        console.log('[TEST RUNNER] SDP Offer recibido del agente Swift. Entregando a Chrome...');
        
        // Call initializePeerConnection in Chrome
        const callId = 100;
        const evalPromise = new Promise((resolve) => {
          const handler = (event) => {
            const res = JSON.parse(event.data);
            if (res.id === callId) {
              ws.removeEventListener('message', handler);
              resolve(res.result.result.value);
            }
          };
          ws.addEventListener('message', handler);
        });

        ws.send(JSON.stringify({
          id: callId,
          method: 'Runtime.evaluate',
          params: {
            expression: `window.initializePeerConnection(${JSON.stringify(data.sdp)})`,
            awaitPromise: true,
            returnByValue: true,
          },
        }));

        const answerSdp = await evalPromise;
        console.log('[TEST RUNNER] SDP Answer generado por Chrome. Enviando de vuelta a libwebrtc...');

        agentProc.stdin.write(JSON.stringify({
          action: 'set_answer',
          sdp: answerSdp,
        }) + '\n');
      } else if (data.event === 'ice_candidate') {
        // Send candidate to Chrome
        ws.send(JSON.stringify({
          id: Date.now(),
          method: 'Runtime.evaluate',
          params: {
            expression: `window.addRemoteCandidate(${JSON.stringify(JSON.stringify(data.candidate))})`,
          },
        }));
      }
    } catch (e) {
      // not json, log raw
      console.log('  [AGENT RAW]', line);
    }
  }
});

// Wait up to 20 seconds for completion
const startTime = Date.now();
while (!testFinished && Date.now() - startTime < 20000) {
  await new Promise((r) => setTimeout(r, 500));
}

// Cleanup
console.log('[TEST RUNNER] Finalizando procesos de prueba...');
agentProc.stdin.write(JSON.stringify({ action: 'stop' }) + '\n');
await new Promise((r) => setTimeout(r, 500));
agentProc.kill();
ws.close();
chromeProc.kill();
server.close();

if (testPassed) {
  console.log('\n========================================================================================');
  console.log('>>> VERIFICACIÓN EXITOSA: AGENTE NATIVO MACOS -> LIBWEBRTC -> CHROME (DTLS/SRTP REAL) <<<');
  console.log('========================================================================================\n');
  process.exit(0);
} else {
  console.error('\n>>> ERROR: La prueba no completó la decodificación de cuadros dentro del tiempo límite. <<<');
  process.exit(1);
}
