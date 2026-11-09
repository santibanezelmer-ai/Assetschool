import { spawn } from 'child_process';

async function run() {
  console.log('[TEST RUNNER] Iniciando Google Chrome en modo Headless con puerto CDP 9222...');
  const chromeProc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--use-fake-ui-for-media-stream',
    '--no-sandbox',
    '--disable-gpu',
    'http://localhost:8080/tests/webrtc_real_stream_test.html',
  ]);

  chromeProc.stderr.on('data', (d) => {
    // console.log('[CHROME STDERR]', d.toString());
  });

  // Wait for CDP port to open
  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch('http://localhost:9222/json/version');
      if (res.ok) {
        const data = await res.json();
        wsUrl = data.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    console.error('No se pudo conectar a Chrome DevTools Protocol en el puerto 9222');
    chromeProc.kill();
    process.exit(1);
  }

  console.log('[TEST RUNNER] Conectado a Chrome DevTools:', wsUrl);

  // Get active page target
  const targetsRes = await fetch('http://localhost:9222/json/list');
  const targets = await targetsRes.json();
  const pageTarget = targets.find((t) => t.type === 'page');

  if (!pageTarget) {
    console.error('No se encontró página objetivo en Chrome');
    chromeProc.kill();
    process.exit(1);
  }

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  await new Promise((resolve) => {
    ws.onopen = () => {
      // Enable console and runtime
      ws.send(JSON.stringify({ id: 1, method: 'Console.enable' }));
      ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
      resolve();
    };
  });

  let testPassed = false;
  let testFinished = false;

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value || a.description).join(' ');
      console.log('  [BROWSER CONSOLE]', text);

      if (text.includes('ÉXITO CONFIRMADO') || text.includes('TEST RESULT: PASSED')) {
        testPassed = true;
        testFinished = true;
      }
      if (text.includes('ERROR EN TEST')) {
        testFinished = true;
      }
    }
  };

  // Timeout after 15 seconds
  const startTime = Date.now();
  while (!testFinished && Date.now() - startTime < 15000) {
    await new Promise((r) => setTimeout(r, 500));
  }

  ws.close();
  chromeProc.kill();

  if (testPassed) {
    console.log('\n================================================================');
    console.log('>>> VERIFICACIÓN WEBRTC LAN EXITOSA: VIDEO REAL RECIBIDO Y DECODIFICADO <<<');
    console.log('================================================================\n');
    process.exit(0);
  } else {
    console.error('\n>>> ERROR: La prueba WebRTC no completó la decodificación de cuadros dentro del tiempo esperado. <<<');
    process.exit(1);
  }
}

run();
