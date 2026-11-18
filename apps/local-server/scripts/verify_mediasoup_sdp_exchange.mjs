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

function buildSdpAnswer(transport, remoteSdpOffer, localRtpParameters) {
  const parsedOffer = sdpTransform.parse(remoteSdpOffer);
  const videoMedia = parsedOffer.media.find(m => m.type === 'video') || parsedOffer.media[0];
  const mid = videoMedia.mid || '0';

  const answerObj = {
    version: 0,
    origin: {
      username: '-',
      sessionId: `${Date.now()}`,
      sessionVersion: 2,
      netType: 'IN',
      ipVer: 4,
      address: transport.iceCandidates[0]?.ip || '127.0.0.1',
    },
    name: 'AssetSchool-SFU',
    timing: { start: 0, stop: 0 },
    groups: [
      {
        type: 'BUNDLE',
        mids: `${mid}`,
      },
    ],
    msidSemantic: parsedOffer.msidSemantic || { semantic: 'WMS', token: '*' },
    media: [
      {
        type: 'video',
        port: transport.iceCandidates[0]?.port || 40000,
        protocol: 'UDP/TLS/RTP/SAVPF',
        payloads: '96',
        connection: {
          version: 4,
          ip: transport.iceCandidates[0]?.ip || '127.0.0.1',
        },
        direction: 'recvonly', // Server is receiving from teacher
        iceUfrag: transport.iceParameters.usernameFragment,
        icePwd: transport.iceParameters.password,
        fingerprint: {
          type: transport.dtlsParameters.fingerprints[0].algorithm,
          hash: transport.dtlsParameters.fingerprints[0].value,
        },
        setup: 'passive',
        mid: `${mid}`,
        rtp: [
          {
            payload: 96,
            codec: 'H264',
            rate: 90000,
          },
        ],
        fmtp: [
          {
            payload: 96,
            config: 'packetization-mode=1;profile-level-id=42e01f;level-asymmetry-allowed=1',
          },
        ],
        rtcpFeedback: [
          { payload: 96, type: 'nack' },
          { payload: 96, type: 'nack', subtype: 'pli' },
          { payload: 96, type: 'ccm', subtype: 'fir' },
        ],
        candidates: transport.iceCandidates.map(c => ({
          foundation: c.foundation,
          component: 1,
          transport: c.protocol,
          priority: c.priority,
          ip: c.ip,
          port: c.port,
          type: c.type,
        })),
        endOfCandidates: 'end-of-candidates',
      },
    ],
  };

  return sdpTransform.write(answerObj);
}

async function testSdpTranslation() {
  const lanIp = getLanIp();
  const worker = await mediasoup.createWorker({ rtcMinPort: 40000, rtcMaxPort: 40100 });
  const router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: { 'packetization-mode': 1, 'profile-level-id': '42e01f' },
      },
    ],
  });

  const transport = await router.createWebRtcTransport({
    listenIps: [{ ip: '0.0.0.0', announcedIp: lanIp }],
    enableUdp: true,
  });

  // Dummy WebRTC client offer
  const clientOfferSdp = `v=0
o=- 4611686018427387904 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0
m=video 9 UDP/TLS/RTP/SAVPF 96
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:clientufrag
a=ice-pwd:clientpassword1234567890
a=ice-options:trickle
a=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF
a=setup:actpass
a=mid:0
a=sendonly
a=rtpmap:96 H264/90000
a=fmtp:96 packetization-mode=1;profile-level-id=42e01f
a=ssrc:12345678 cname:screenshare
`;

  // Parse client offer
  const parsed = sdpTransform.parse(clientOfferSdp);
  const videoMedia = parsed.media[0];
  const dtlsParameters = {
    role: 'server',
    fingerprints: [
      {
        algorithm: videoMedia.fingerprint.type,
        value: videoMedia.fingerprint.hash,
      },
    ],
  };

  await transport.connect({ dtlsParameters });
  console.log('[SFU TEST] WebRtcTransport conectado exitosamente con DTLS del cliente!');

  // Produce on transport
  const rtpParameters = {
    mid: '0',
    codecs: [
      {
        mimeType: 'video/H264',
        payloadType: 96,
        clockRate: 90000,
        parameters: { 'packetization-mode': 1, 'profile-level-id': '42e01f' },
        rtcpFeedback: [
          { type: 'nack' },
          { type: 'nack', parameter: 'pli' },
          { type: 'ccm', parameter: 'fir' },
        ],
      },
    ],
    encodings: [{ ssrc: 12345678 }],
  };

  const producer = await transport.produce({ kind: 'video', rtpParameters });
  console.log(`[SFU TEST] Producer H.264 creado en Mediasoup (ID: ${producer.id})!`);

  // Generate SDP Answer
  const sdpAnswer = buildSdpAnswer(transport, clientOfferSdp, rtpParameters);
  console.log('[SFU TEST] SDP Answer generada correctamente:\n' + sdpAnswer.slice(0, 300) + '...\n');

  producer.close();
  transport.close();
  router.close();
  worker.close();
  console.log('[SFU TEST] Prueba de ciclo completo de negociación completada con éxito!');
}

testSdpTranslation().catch(err => {
  console.error('[SFU ERROR]:', err);
  process.exit(1);
});
