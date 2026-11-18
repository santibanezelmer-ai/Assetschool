import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import * as sdpTransformModule from 'sdp-transform';
const sdpTransform: typeof sdpTransformModule = ((sdpTransformModule as any).default || sdpTransformModule) as any;
import * as os from 'os';

export interface ActiveBroadcastSession {
  institutionId: string;
  classroomId: string;
  teacherSocketId: string;
  producerId: string;
  producer: mediasoup.types.Producer;
  sendTransport: mediasoup.types.WebRtcTransport;
  consumers: Map<string, { consumer: mediasoup.types.Consumer; transport: mediasoup.types.WebRtcTransport; studentDeviceId: string }>;
  startedAt: number;
}

@Injectable()
export class SfuService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SfuService.name);
  private worker?: mediasoup.types.Worker;
  private readonly classroomRouters = new Map<string, mediasoup.types.Router>();
  private readonly activeBroadcasts = new Map<string, ActiveBroadcastSession>();
  private lanIp: string = '127.0.0.1';

  private readonly rtcMinPort = 40000;
  private readonly rtcMaxPort = 40999;

  async onModuleInit() {
    this.lanIp = this.detectLanIp();
    this.logger.log(`Inicializando Mediasoup SFU v3 en LAN IP: ${this.lanIp} (Rango UDP: ${this.rtcMinPort}-${this.rtcMaxPort})...`);

    try {
      this.worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: this.rtcMinPort,
        rtcMaxPort: this.rtcMaxPort,
      });

      this.worker.on('died', () => {
        this.logger.error(`Mediasoup worker murió inesperadamente (PID: ${this.worker?.pid}).`);
      });

      this.logger.log(`[MEDIASOUP C++ WORKER ACTIVO]: PID ${this.worker.pid} — Transporte WebRTC LAN preparado.`);
    } catch (err: any) {
      this.logger.error(`Error al iniciar Mediasoup Worker: ${err?.message}`, err?.stack);
    }
  }

  async onModuleDestroy() {
    this.logger.log('Deteniendo Mediasoup SFU y cerrando sesiones WebRTC activas...');
    for (const [key, session] of this.activeBroadcasts.entries()) {
      session.producer.close();
      session.sendTransport.close();
      for (const { consumer, transport } of session.consumers.values()) {
        consumer.close();
        transport.close();
      }
    }
    this.activeBroadcasts.clear();

    for (const router of this.classroomRouters.values()) {
      router.close();
    }
    this.classroomRouters.clear();

    if (this.worker && !this.worker.closed) {
      this.worker.close();
    }
  }

  public getLanIp(): string {
    return this.lanIp;
  }

  private detectLanIp(): string {
    if (process.env.SFU_ANNOUNCED_IP) {
      return process.env.SFU_ANNOUNCED_IP;
    }
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      const list = ifaces[name];
      if (!list) continue;
      for (const iface of list) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  private getMediaCodecs(): mediasoup.types.RtpCodecCapability[] {
    return [
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
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {},
      },
    ];
  }

  public async getOrCreateRouter(institutionId: string, classroomId: string): Promise<mediasoup.types.Router> {
    const key = `${institutionId}:${classroomId}`;
    let router = this.classroomRouters.get(key);
    if (!router || router.closed) {
      if (!this.worker || this.worker.closed) {
        throw new Error('Mediasoup Worker no está inicializado.');
      }
      router = await this.worker.createRouter({ mediaCodecs: this.getMediaCodecs() });
      this.classroomRouters.set(key, router);
      this.logger.log(`Router SFU creado para Aula ${classroomId} (Institución: ${institutionId}, Router ID: ${router.id})`);
    }
    return router;
  }

  /**
   * Teacher starts screen presentation: creates Send WebRtcTransport, connects DTLS,
   * creates H.264 Producer, and returns SDP Answer.
   */
  public async handleTeacherBroadcastStart(
    institutionId: string,
    classroomId: string,
    teacherSocketId: string,
    clientOfferSdp: string,
  ): Promise<{ producerId: string; sdpAnswer: string }> {
    const router = await this.getOrCreateRouter(institutionId, classroomId);
    const key = `${institutionId}:${classroomId}`;

    // Close any previous broadcast in this classroom
    const existing = this.activeBroadcasts.get(key);
    if (existing) {
      this.logger.warn(`Cerrando transmisión previa en aula ${classroomId}...`);
      existing.producer.close();
      existing.sendTransport.close();
      for (const { consumer, transport } of existing.consumers.values()) {
        consumer.close();
        transport.close();
      }
      this.activeBroadcasts.delete(key);
    }

    // 1. Create WebRtcTransport for sending video from teacher
    const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: this.lanIp }],
      enableUdp: true,
      enableTcp: false,
      preferUdp: true,
    });

    // 2. Parse client SDP Offer
    const parsedOffer = sdpTransform.parse(clientOfferSdp);
    const videoMedia = parsedOffer.media.find((m: any) => m.type === 'video') || parsedOffer.media[0];
    if (!videoMedia || !videoMedia.fingerprint) {
      transport.close();
      throw new Error('La oferta SDP del docente no contiene sección de video o fingerprint DTLS válido.');
    }

    const dtlsParameters: mediasoup.types.DtlsParameters = {
      role: 'server',
      fingerprints: [
        {
          algorithm: videoMedia.fingerprint.type as any,
          value: videoMedia.fingerprint.hash,
        },
      ],
    };

    await transport.connect({ dtlsParameters });

    // 3. Create Producer
    const ssrc = videoMedia.ssrcs?.[0]?.id || 11223344;
    const rtpParameters: mediasoup.types.RtpParameters = {
      mid: String(videoMedia.mid || '0'),
      codecs: [
        {
          mimeType: 'video/H264',
          payloadType: 96,
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '42e01f',
            'level-asymmetry-allowed': 1,
          },
          rtcpFeedback: [
            { type: 'nack' },
            { type: 'nack', parameter: 'pli' },
            { type: 'ccm', parameter: 'fir' },
          ],
        },
      ],
      encodings: [{ ssrc }],
    };

    const producer = await transport.produce({ kind: 'video', rtpParameters });
    this.logger.log(`[SFU PRODUCER] Flujo de video docente H.264 iniciado (Aula: ${classroomId}, Producer ID: ${producer.id})`);

    // Store active session
    this.activeBroadcasts.set(key, {
      institutionId,
      classroomId,
      teacherSocketId,
      producerId: producer.id,
      producer,
      sendTransport: transport,
      consumers: new Map(),
      startedAt: Date.now(),
    });

    // 4. Build standard WebRTC SDP Answer
    const sdpAnswer = this.buildSdpAnswer(transport, clientOfferSdp, rtpParameters, 'recvonly');
    return { producerId: producer.id, sdpAnswer };
  }

  /**
   * Student subscribes to teacher screen broadcast: creates Recv WebRtcTransport,
   * creates Consumer, requests PLI keyframe, and returns SDP Answer.
   */
  public async handleStudentBroadcastSubscribe(
    institutionId: string,
    classroomId: string,
    studentSocketId: string,
    studentDeviceId: string,
    clientOfferSdp: string,
  ): Promise<{ consumerId: string; sdpAnswer: string }> {
    const key = `${institutionId}:${classroomId}`;
    const broadcast = this.activeBroadcasts.get(key);
    if (!broadcast || broadcast.producer.closed) {
      throw new Error('No hay transmisión activa del docente en esta aula.');
    }

    const router = await this.getOrCreateRouter(institutionId, classroomId);

    // 1. Create Recv WebRtcTransport for student
    const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: this.lanIp }],
      enableUdp: true,
      enableTcp: false,
      preferUdp: true,
    });

    // 2. Parse client SDP Offer
    const parsedOffer = sdpTransform.parse(clientOfferSdp);
    const videoMedia = parsedOffer.media.find((m: any) => m.type === 'video') || parsedOffer.media[0];
    if (!videoMedia || !videoMedia.fingerprint) {
      transport.close();
      throw new Error('La oferta SDP del estudiante no contiene fingerprint DTLS válido.');
    }

    const dtlsParameters: mediasoup.types.DtlsParameters = {
      role: 'server',
      fingerprints: [
        {
          algorithm: videoMedia.fingerprint.type as any,
          value: videoMedia.fingerprint.hash,
        },
      ],
    };

    await transport.connect({ dtlsParameters });

    // 3. Create Consumer
    const rtpCapabilities: mediasoup.types.RtpCapabilities = {
      codecs: [
        {
          kind: 'video',
          mimeType: 'video/H264',
          clockRate: 90000,
          preferredPayloadType: 96,
          rtcpFeedback: [
            { type: 'nack' },
            { type: 'nack', parameter: 'pli' },
            { type: 'ccm', parameter: 'fir' },
          ],
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '42e01f',
          },
        },
      ],
      headerExtensions: [],
    };

    const consumer = await transport.consume({
      producerId: broadcast.producerId,
      rtpCapabilities,
      paused: false,
    });

    // Register consumer
    broadcast.consumers.set(studentSocketId, {
      consumer,
      transport,
      studentDeviceId,
    });

    this.logger.log(
      `[SFU CONSUMER] Estudiante ${studentDeviceId} suscrito a pantalla docente (Aula: ${classroomId}, Consumer ID: ${consumer.id}, Total: ${broadcast.consumers.size})`,
    );

    // 4. Request Keyframe (PLI) so the student displays video immediately
    await consumer.requestKeyFrame();

    // 5. Build standard WebRTC SDP Answer (sendonly from server perspective)
    const sdpAnswer = this.buildSdpAnswer(transport, clientOfferSdp, consumer.rtpParameters, 'sendonly');
    return { consumerId: consumer.id, sdpAnswer };
  }

  public handleTeacherBroadcastStop(institutionId: string, classroomId: string): boolean {
    const key = `${institutionId}:${classroomId}`;
    const broadcast = this.activeBroadcasts.get(key);
    if (!broadcast) return false;

    this.logger.log(`[SFU STOP] Deteniendo transmisión docente en aula ${classroomId}...`);
    broadcast.producer.close();
    broadcast.sendTransport.close();

    for (const { consumer, transport } of broadcast.consumers.values()) {
      consumer.close();
      transport.close();
    }

    this.activeBroadcasts.delete(key);
    return true;
  }

  public handleSocketDisconnect(socketId: string) {
    for (const [key, broadcast] of this.activeBroadcasts.entries()) {
      if (broadcast.teacherSocketId === socketId) {
        this.logger.warn(`Docente desconectado: cerrando broadcast en aula ${broadcast.classroomId}`);
        this.handleTeacherBroadcastStop(broadcast.institutionId, broadcast.classroomId);
        return;
      }
      if (broadcast.consumers.has(socketId)) {
        const item = broadcast.consumers.get(socketId)!;
        item.consumer.close();
        item.transport.close();
        broadcast.consumers.delete(socketId);
        this.logger.log(`Consumidor desconectado: liberado en aula ${broadcast.classroomId} (Restantes: ${broadcast.consumers.size})`);
      }
    }
  }

  public isBroadcastActive(institutionId: string, classroomId: string): boolean {
    const key = `${institutionId}:${classroomId}`;
    const broadcast = this.activeBroadcasts.get(key);
    return !!broadcast && !broadcast.producer.closed;
  }

  public getConnectedConsumerCount(institutionId: string, classroomId: string): number {
    const key = `${institutionId}:${classroomId}`;
    const broadcast = this.activeBroadcasts.get(key);
    return broadcast ? broadcast.consumers.size : 0;
  }

  public async getSessionStats(institutionId: string, classroomId: string): Promise<any> {
    const key = `${institutionId}:${classroomId}`;
    const broadcast = this.activeBroadcasts.get(key);
    if (!broadcast) return null;

    const producerStats = await broadcast.producer.getStats();
    const sendTransportStats = await broadcast.sendTransport.getStats();

    const consumerStatsList: any[] = [];
    for (const [socketId, item] of broadcast.consumers.entries()) {
      const cStats = await item.consumer.getStats();
      const tStats = await item.transport.getStats();
      consumerStatsList.push({
        socketId,
        studentDeviceId: item.studentDeviceId,
        consumerStats: cStats,
        transportStats: tStats,
      });
    }

    return {
      classroomId,
      producerId: broadcast.producerId,
      producerStats,
      sendTransportStats,
      consumerCount: broadcast.consumers.size,
      consumerStatsList,
      dtlsState: sendTransportStats[0]?.dtlsState,
      iceState: sendTransportStats[0]?.iceState,
      iceSelectedTuple: (sendTransportStats[0] as any)?.iceSelectedTuple,
      rtpBytesReceived: (sendTransportStats[0] as any)?.rtpBytesReceived || 0,
      rtpBytesSent: (sendTransportStats[0] as any)?.rtpBytesSent || 0,
    };
  }

  public async getWorkerResourceUsage(): Promise<mediasoup.types.WorkerResourceUsage | null> {
    if (!this.worker || this.worker.closed) return null;
    return this.worker.getResourceUsage();
  }

  private buildSdpAnswer(
    transport: mediasoup.types.WebRtcTransport,
    remoteSdpOffer: string,
    rtpParameters: mediasoup.types.RtpParameters,
    direction: 'recvonly' | 'sendonly',
  ): string {
    const parsedOffer = sdpTransform.parse(remoteSdpOffer);
    const videoMedia = parsedOffer.media.find((m: any) => m.type === 'video') || parsedOffer.media[0] || {};
    const mid = videoMedia.mid || '0';
    const candidate = transport.iceCandidates[0] || { ip: this.lanIp, port: 40000, protocol: 'udp', foundation: '1', priority: 1, type: 'host' };

    const answerObj: any = {
      version: 0,
      origin: {
        username: '-',
        sessionId: `${Date.now()}`,
        sessionVersion: 2,
        netType: 'IN',
        ipVer: 4,
        address: candidate.ip || this.lanIp,
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
          port: candidate.port || 40000,
          protocol: 'UDP/TLS/RTP/SAVPF',
          payloads: '96',
          connection: {
            version: 4,
            ip: candidate.ip || this.lanIp,
          },
          direction,
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
          candidates: transport.iceCandidates.map((c: any) => ({
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
}
