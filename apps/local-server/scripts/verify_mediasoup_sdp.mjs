import * as mediasoup from 'mediasoup';
import sdpTransform from 'sdp-transform';
import os from 'os';

function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

async function testMediasoupSfu() {
  console.log('--- TEST VERIFICACIÓN MEDIASOUP SFU ---');
  const lanIp = getLanIp();
  console.log(`[SFU] IP LAN detectada: ${lanIp}`);

  const worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: 40000,
    rtcMaxPort: 40100,
  });
  console.log(`[SFU] Worker C++ iniciado (PID: ${worker.pid})`);

  const mediaCodecs = [
    {
      kind: 'video',
      mimeType: 'video/H264',
      clockRate: 90000,
      parameters: {
        'packetization-mode': 1,
        'profile-level-id': '42e01f',
        'level-asymmetry-allowed': 1,
      },
    },
  ];

  const router = await worker.createRouter({ mediaCodecs });
  console.log(`[SFU] Router creado para aula de prueba (ID: ${router.id})`);

  const transport = await router.createWebRtcTransport({
    listenIps: [{ ip: '0.0.0.0', announcedIp: lanIp }],
    enableUdp: true,
    enableTcp: false,
    preferUdp: true,
  });
  console.log(`[SFU] WebRtcTransport creado (ID: ${transport.id})`);
  console.log(` -> ICE ufrag: ${transport.iceParameters.usernameFragment}`);
  console.log(` -> ICE candidates: ${JSON.stringify(transport.iceCandidates)}`);
  console.log(` -> DTLS fingerprints: ${JSON.stringify(transport.dtlsParameters.fingerprints)}`);

  transport.close();
  router.close();
  worker.close();
  console.log('[SFU] Prueba de inicialización de Mediasoup exitosa!');
}

testMediasoupSfu().catch(err => {
  console.error('[ERROR SFU]:', err);
  process.exit(1);
});
