import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Optional, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  PacketType,
  ProtocolEnvelope,
  createEnvelope,
  AgentHelloPayload,
  ServerHelloAckPayload,
  CapabilitiesReportPayload,
  ScreenCaptureStartPayload,
  ScreenCaptureStopPayload,
  ScreenCaptureStatusPayload,
  WebRtcOfferPayload,
  WebRtcAnswerPayload,
  WebRtcIceCandidatePayload,
  WebRtcSessionCreatedPayload,
  WebRtcSessionClosedPayload,
  WebRtcErrorPayload,
  ScreenStreamStatsPayload,
  CommandDispatchPayload,
  CommandResultPayload,
} from '@assetschool/protocol';
import { DatabaseService } from '../database/database.service';
import { DeviceStatus, SystemRole, CommandType, CommandStatus } from '@assetschool/shared-types';
import { randomBytes, randomUUID } from 'crypto';
import { hasPermission, PermissionKey } from '@assetschool/permissions';
import { assertAccessToken } from '../auth/token-policy';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AuthenticatedAgentSession {
  socketId: string;
  hostname: string;
  deviceId?: string;
  institutionId?: string;
  macAddress: string;
  sessionToken: string;
  authenticatedAt: number;
  lastHeartbeatAt: number;
  isCapturing?: boolean;
}

interface AuthenticatedTeacherSession {
  socketId: string;
  userId: string;
  email: string;
  role: string;
  institutionId: string;
  classroomId?: string;
  authenticatedAt: number;
  activeSessionIds: Set<string>;
}

interface ActiveStreamSession {
  sessionId: string;
  classroomId?: string;
  teacherId: string;
  teacherSocketId: string;
  deviceId: string;
  agentSocketId: string;
  institutionId: string;
  qualityTier: 'thumbnail' | 'individual';
  startedAt: number;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AgentGateway.name);
  private connectedAgents = new Map<string, AuthenticatedAgentSession>();
  private deviceToAgentSocket = new Map<string, string>(); // deviceId -> socketId
  private connectedTeachers = new Map<string, AuthenticatedTeacherSession>(); // socketId -> TeacherSession
  private userToTeacherSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>
  private activeStreamSessions = new Map<string, ActiveStreamSession>(); // sessionId -> ActiveStreamSession
  private heartbeatIntervalTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly databaseService: DatabaseService,
    @Optional() private readonly jwtService?: JwtService,
  ) {
    this.heartbeatIntervalTimer = setInterval(() => {
      this.checkStaleConnections();
    }, 10000);
    if (this.heartbeatIntervalTimer && typeof this.heartbeatIntervalTimer.unref === 'function') {
      this.heartbeatIntervalTimer.unref();
    }
  }

  onModuleDestroy() {
    if (this.heartbeatIntervalTimer) {
      clearInterval(this.heartbeatIntervalTimer);
      this.heartbeatIntervalTimer = null;
    }
  }

  handleConnection(client: Socket) {
    this.logger.log(`Conexión TCP entrante en WebSocket desde ${client.handshake.address} (Socket: ${client.id})`);
  }

  handleDisconnect(client: Socket) {
    // 1. If it was an agent disconnecting
    const agentSession = this.connectedAgents.get(client.id);
    if (agentSession) {
      this.logger.warn(`Agente desconectado: ${agentSession.hostname} (Device: ${agentSession.deviceId || 'N/A'})`);
      if (agentSession.deviceId) {
        this.deviceToAgentSocket.delete(agentSession.deviceId);
        this.terminateDeviceStreams(agentSession.deviceId, 'Agente desconectado de la red local');
        if (this.databaseService.isDatabaseReady) {
          this.databaseService.query(
            'UPDATE devices SET status = $1, updated_at = NOW() WHERE id = $2',
            [DeviceStatus.OFFLINE, agentSession.deviceId],
          ).catch(() => {});
        }
      }
      this.connectedAgents.delete(client.id);
      return;
    }

    // 2. If it was a teacher disconnecting
    const teacherSession = this.connectedTeachers.get(client.id);
    if (teacherSession) {
      this.logger.log(`Docente desconectado: ${teacherSession.email} (User: ${teacherSession.userId})`);
      for (const sessionId of teacherSession.activeSessionIds) {
        const stream = this.activeStreamSessions.get(sessionId);
        if (stream) {
          this.stopStreamInternal(sessionId, 'Docente desconectó la consola de supervisión');
        }
      }
      const userSockets = this.userToTeacherSockets.get(teacherSession.userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.userToTeacherSockets.delete(teacherSession.userId);
        }
      }
      this.connectedTeachers.delete(client.id);
    }
  }

  // -------------------------------------------------------------
  // TEACHER AUTHENTICATION & CLASSROOM JOIN
  // -------------------------------------------------------------
  @SubscribeMessage('TEACHER_JOIN_CLASSROOM')
  async handleTeacherJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { token?: string; classroomId?: string },
  ): Promise<{ success: boolean; error?: string }> {
    return this.handleTeacherJoinInternal(client, body);
  }

  @SubscribeMessage(PacketType.SESSION_JOIN_NOTICE)
  async handleTeacherJoinNotice(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: any,
  ): Promise<{ success: boolean; error?: string }> {
    return this.handleTeacherJoinInternal(client, body?.payload || body);
  }

  private async handleTeacherJoinInternal(
    client: Socket,
    body: { token?: string; classroomId?: string },
  ): Promise<{ success: boolean; error?: string }> {
    const token = body?.token;
    if (!token) {
      return { success: false, error: 'Token JWT de autenticación requerido' };
    }

    // R0 / S9: there is no fallback identity. Without a JwtService the gateway
    // cannot verify tokens and every teacher connection is rejected.
    if (!this.jwtService) {
      this.logger.error('JwtService no disponible en el gateway: conexión de docente rechazada');
      return { success: false, error: 'Servicio de autenticación no disponible' };
    }

    let decoded: any;
    try {
      decoded = this.jwtService.verify(token);
      // R0 / S7b: only access tokens are accepted (not refresh tokens).
      assertAccessToken(decoded);
    } catch (err: any) {
      this.logger.warn(`Intento de conexión de docente con token inválido: ${err?.message}`);
      return { success: false, error: 'Token JWT inválido o expirado' };
    }

    if (decoded.mustChangePassword) {
      return { success: false, error: 'Debe cambiar su contraseña antes de supervisar el aula (PASSWORD_CHANGE_REQUIRED)' };
    }

    const userId = decoded.sub;
    const role = decoded.role;
    const normalizedRole = typeof role === 'string' ? role.toUpperCase() : role;
    const institutionId = decoded.institutionId;

    if (!userId || !institutionId) {
      return { success: false, error: 'Token sin identidad institucional' };
    }

    if (
      normalizedRole !== SystemRole.TEACHER &&
      normalizedRole !== SystemRole.INSTITUTION_ADMIN &&
      normalizedRole !== SystemRole.SUPERADMIN
    ) {
      return { success: false, error: 'Permisos insuficientes para supervisión de aula' };
    }

    // R0 / S1: the classroom must exist and belong to the teacher's institution.
    if (body.classroomId) {
      const classroomCheck = await this.validateClassroomForInstitution(
        body.classroomId,
        institutionId,
        normalizedRole,
      );
      if (!classroomCheck.ok) {
        return { success: false, error: classroomCheck.error };
      }
    }

    const teacherSession: AuthenticatedTeacherSession = {
      socketId: client.id,
      userId,
      email: decoded.email || '',
      role: normalizedRole,
      institutionId,
      classroomId: body.classroomId,
      authenticatedAt: Date.now(),
      activeSessionIds: new Set<string>(),
    };

    this.connectedTeachers.set(client.id, teacherSession);
    if (!this.userToTeacherSockets.has(userId)) {
      this.userToTeacherSockets.set(userId, new Set());
    }
    this.userToTeacherSockets.get(userId)!.add(client.id);

    if (body.classroomId) {
      client.join(`classroom:${body.classroomId}`);
    }
    client.join(`institution:${institutionId}`);

    this.logger.log(`Docente autenticado en WebSocket: ${decoded.email} (Aula: ${body.classroomId || 'todas'})`);
    if (typeof client?.emit === 'function') {
      client.emit('TEACHER_JOIN_SUCCESS', { success: true, userId, institutionId });
    }
    return { success: true };
  }

  @SubscribeMessage('TEACHER_LEAVE_CLASSROOM')
  handleTeacherLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { classroomId?: string },
  ) {
    return this.handleTeacherLeaveInternal(client, body);
  }

  @SubscribeMessage(PacketType.SESSION_LEAVE_NOTICE)
  handleTeacherLeaveNotice(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: any,
  ) {
    return this.handleTeacherLeaveInternal(client, body?.payload || body);
  }

  private handleTeacherLeaveInternal(
    client: Socket,
    body: { classroomId?: string },
  ) {
    const teacherSession = this.connectedTeachers.get(client.id);
    if (!teacherSession) return { success: false };

    if (body?.classroomId) {
      client.leave(`classroom:${body.classroomId}`);
    }

    for (const sessionId of Array.from(teacherSession.activeSessionIds)) {
      this.stopStreamInternal(sessionId, 'Docente abandonó el aula');
    }

    return { success: true };
  }

  // -------------------------------------------------------------
  // AGENT HANDSHAKE & HEARTBEAT
  // -------------------------------------------------------------
  @SubscribeMessage(PacketType.AGENT_HELLO)
  async handleAgentHello(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<AgentHelloPayload>,
  ): Promise<ProtocolEnvelope<ServerHelloAckPayload | { error: string }>> {
    const payload = envelope.payload;
    if (!payload || !payload.macAddress || !payload.hostname) {
      client.disconnect(true);
      return createEnvelope(
        PacketType.SERVER_HELLO_ACK,
        'SERVER',
        'server',
        { error: 'Formato de handshake inválido' } as any,
      );
    }

    let isEnrolled = false;
    let deviceId = payload.enrolledDeviceId;
    let institutionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    if (this.databaseService.isDatabaseReady) {
      const devRes = await this.databaseService.query(
        'SELECT id, is_revoked, institution_id FROM devices WHERE LOWER(mac_address) = LOWER($1)',
        [payload.macAddress],
      );

      if (devRes.rows.length > 0) {
        const device = devRes.rows[0];
        if (device.is_revoked) {
          this.logger.warn(`Conexión rechazada: El dispositivo MAC ${payload.macAddress} está REVOCADO`);
          client.disconnect(true);
          return createEnvelope(
            PacketType.SERVER_HELLO_ACK,
            'SERVER',
            'server',
            { error: 'Dispositivo revocado por el administrador' } as any,
          );
        }
        isEnrolled = true;
        deviceId = device.id;
        institutionId = device.institution_id;

        await this.databaseService.query(
          'UPDATE devices SET status = $1, last_heartbeat_at = NOW(), local_ip = $2 WHERE id = $3',
          [DeviceStatus.ONLINE, payload.localIp || '127.0.0.1', deviceId],
        );
      }
    }

    const sessionToken = `ses_${randomBytes(24).toString('hex')}`;

    this.connectedAgents.set(client.id, {
      socketId: client.id,
      hostname: payload.hostname,
      deviceId,
      institutionId,
      macAddress: payload.macAddress,
      sessionToken,
      authenticatedAt: Date.now(),
      lastHeartbeatAt: Date.now(),
      isCapturing: false,
    });

    if (deviceId) {
      this.deviceToAgentSocket.set(deviceId, client.id);
    }

    this.logger.log(`Handshake exitoso: ${payload.hostname} (${payload.osType}) - Token emitido.`);

    const ack = createEnvelope(
      PacketType.SERVER_HELLO_ACK,
      'SERVER',
      'server',
      {
        serverTime: Date.now(),
        serverVersion: '1.0.0-phase2.0',
        institutionId,
        isEnrolled,
        assignedDeviceId: deviceId,
        sessionToken,
        heartbeatIntervalMs: 15000,
      },
    );
    if (typeof client?.emit === 'function') {
      client.emit(PacketType.SERVER_HELLO_ACK, ack);
    }
    return ack;
  }

  @SubscribeMessage(PacketType.HEARTBEAT_PING)
  handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<{ timestamp: number }>,
  ): ProtocolEnvelope<{ serverTime: number }> {
    const session = this.connectedAgents.get(client.id);
    if (!session) {
      client.disconnect(true);
      return createEnvelope(PacketType.HEARTBEAT_PONG, 'SERVER', 'server', { serverTime: 0 });
    }

    session.lastHeartbeatAt = Date.now();

    if (session.deviceId && this.databaseService.isDatabaseReady) {
      this.databaseService.query(
        'UPDATE devices SET last_heartbeat_at = NOW(), status = $1 WHERE id = $2',
        [DeviceStatus.ONLINE, session.deviceId],
      ).catch(() => {});
    }

    return createEnvelope(
      PacketType.HEARTBEAT_PONG,
      'SERVER',
      'server',
      { serverTime: Date.now() },
    );
  }

  @SubscribeMessage(PacketType.CAPABILITIES_REPORT)
  async handleCapabilities(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<CapabilitiesReportPayload>,
  ): Promise<ProtocolEnvelope<{ acknowledged: boolean }>> {
    const session = this.connectedAgents.get(client.id);
    if (!session) {
      client.disconnect(true);
      return createEnvelope(PacketType.CAPABILITIES_ACK, 'SERVER', 'server', { acknowledged: false });
    }

    if (session.deviceId && this.databaseService.isDatabaseReady) {
      const caps = envelope.payload;
      await this.databaseService.query(
        `INSERT INTO device_capabilities (
           id, device_id, can_screen_broadcast, can_screen_receive, can_remote_input,
           can_lock_input, can_blackout_screen, can_file_transfer, can_process_block,
           can_url_block, can_chat, can_execute_command, can_collect_hardware_inventory, platform_notes, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
         ON CONFLICT (device_id) DO UPDATE SET
           can_screen_broadcast = EXCLUDED.can_screen_broadcast,
           can_screen_receive = EXCLUDED.can_screen_receive,
           can_remote_input = EXCLUDED.can_remote_input,
           can_lock_input = EXCLUDED.can_lock_input,
           can_blackout_screen = EXCLUDED.can_blackout_screen,
           can_file_transfer = EXCLUDED.can_file_transfer,
           can_process_block = EXCLUDED.can_process_block,
           can_url_block = EXCLUDED.can_url_block,
           can_chat = EXCLUDED.can_chat,
           can_execute_command = EXCLUDED.can_execute_command,
           can_collect_hardware_inventory = EXCLUDED.can_collect_hardware_inventory,
           platform_notes = EXCLUDED.platform_notes,
           updated_at = NOW()`,
        [
          envelope.packetId,
          session.deviceId,
          caps.canScreenBroadcast,
          caps.canScreenReceive,
          caps.canRemoteInput,
          caps.canLockInput,
          caps.canBlackoutScreen,
          caps.canFileTransfer,
          caps.canProcessBlock,
          caps.canUrlBlock,
          caps.canChat,
          caps.canExecuteCommand,
          caps.canCollectHardwareInventory,
          caps.platformNotes || '',
        ],
      ).catch(() => {});
    }

    return createEnvelope(
      PacketType.CAPABILITIES_ACK,
      'SERVER',
      'server',
      { acknowledged: true },
    );
  }

  // -------------------------------------------------------------
  // SCREEN CAPTURE CONTROL (START / STOP)
  // -------------------------------------------------------------
  @SubscribeMessage(PacketType.SCREEN_CAPTURE_START)
  async handleScreenCaptureStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<ScreenCaptureStartPayload>,
  ): Promise<ProtocolEnvelope<WebRtcSessionCreatedPayload | WebRtcErrorPayload>> {
    const payload = envelope.payload;
    const teacherSession = this.connectedTeachers.get(client.id);

    // 1. Authorize teacher
    if (!teacherSession) {
      return createEnvelope(PacketType.WEBRTC_ERROR, 'SERVER', 'server', {
        code: 'UNAUTHORIZED',
        message: 'No autenticado como docente en la consola LAN',
      });
    }

    const deviceId = payload.deviceId;
    if (!deviceId) {
      return createEnvelope(PacketType.WEBRTC_ERROR, 'SERVER', 'server', {
        code: 'PEER_CONNECTION_FAILED',
        message: 'ID de dispositivo destino requerido',
      });
    }

    // 2. Validate device status & revocation in DB
    if (this.databaseService.isDatabaseReady) {
      const devRes = await this.databaseService.query(
        'SELECT id, institution_id, is_revoked, status, hostname FROM devices WHERE id = $1',
        [deviceId],
      );

      if (devRes.rows.length === 0) {
        return createEnvelope(PacketType.WEBRTC_ERROR, 'SERVER', 'server', {
          deviceId,
          code: 'PEER_CONNECTION_FAILED',
          message: 'Dispositivo no encontrado en la base de datos institucional',
        });
      }

      const device = devRes.rows[0];
      if (device.is_revoked) {
        this.logger.warn(`Rechazado streaming: Dispositivo ${device.hostname} está REVOCADO`);
        return createEnvelope(PacketType.WEBRTC_ERROR, 'SERVER', 'server', {
          deviceId,
          code: 'REVOKED',
          message: 'Dispositivo revocado por el administrador de red TIC',
        });
      }

      // Institutional isolation check
      if (device.institution_id !== teacherSession.institutionId && teacherSession.role !== SystemRole.SUPERADMIN) {
        return createEnvelope(PacketType.WEBRTC_ERROR, 'SERVER', 'server', {
          deviceId,
          code: 'UNAUTHORIZED',
          message: 'Violación de aislamiento institucional entre dispositivo y docente',
        });
      }
    }

    // 3. Find connected agent socket
    const agentSocketId = this.deviceToAgentSocket.get(deviceId);
    if (!agentSocketId || !this.server?.sockets?.sockets?.get(agentSocketId)) {
      return createEnvelope(PacketType.WEBRTC_ERROR, 'SERVER', 'server', {
        deviceId,
        code: 'PEER_CONNECTION_FAILED',
        message: 'El agente del estudiante no está conectado a la red local',
      });
    }

    const sessionId = payload.sessionId || `stream_${randomBytes(8).toString('hex')}`;
    const qualityTier = payload.qualityTier || 'thumbnail';

    // 4. Register active stream
    const activeStream: ActiveStreamSession = {
      sessionId,
      teacherId: teacherSession.userId,
      teacherSocketId: client.id,
      deviceId,
      agentSocketId,
      institutionId: teacherSession.institutionId,
      qualityTier,
      startedAt: Date.now(),
    };

    this.activeStreamSessions.set(sessionId, activeStream);
    teacherSession.activeSessionIds.add(sessionId);

    // 5. Audit Log in PostgreSQL
    if (this.databaseService.isDatabaseReady) {
      let actorUuid: string | null = null;
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teacherSession.userId)) {
        try {
          const uRes = await this.databaseService.query('SELECT id FROM users WHERE id = $1', [teacherSession.userId]);
          if (uRes.rows.length > 0) {
            actorUuid = teacherSession.userId;
          }
        } catch {}
      }

      await this.databaseService.query(
        `INSERT INTO audit_logs (id, institution_id, actor_user_id, actor_role, action, entity_type, entity_id, ip_address, details_json, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          randomUUID(),
          teacherSession.institutionId,
          actorUuid,
          teacherSession.role,
          'SCREEN_CAPTURE_START',
          'DEVICE',
          deviceId,
          client.handshake.address,
          JSON.stringify({
            sessionId,
            qualityTier,
            targetFps: payload.targetFps || (qualityTier === 'thumbnail' ? 10 : 30),
            targetBitrateKbps: payload.targetBitrateKbps || (qualityTier === 'thumbnail' ? 250 : 2000),
          }),
        ],
      ).catch((err) => {
        this.logger.error(`Error guardando auditoría de captura de pantalla: ${err.message}`);
      });
    }

    // 6. Forward command to student agent
    const targetAgentSocket = this.server.sockets.sockets.get(agentSocketId);
    if (targetAgentSocket) {
      const agentEnvelope = createEnvelope(
        PacketType.SCREEN_CAPTURE_START,
        'SERVER',
        'server',
        {
          teacherId: teacherSession.userId,
          deviceId,
          sessionId,
          qualityTier,
          targetFps: payload.targetFps || (qualityTier === 'thumbnail' ? 10 : 30),
          targetBitrateKbps: payload.targetBitrateKbps || (qualityTier === 'thumbnail' ? 250 : 2000),
          targetWidth: payload.targetWidth || (qualityTier === 'thumbnail' ? 640 : 1920),
          targetHeight: payload.targetHeight || (qualityTier === 'thumbnail' ? 360 : 1080),
          monitorIndex: payload.monitorIndex ?? 0,
        },
      );
      targetAgentSocket.emit(PacketType.SCREEN_CAPTURE_START, agentEnvelope);
    }

    this.logger.log(`Streaming WebRTC iniciado: Docente ${teacherSession.email} -> Equipo ${deviceId} (Sesión: ${sessionId}, Tier: ${qualityTier})`);

    const sessionCreated = createEnvelope(
      PacketType.WEBRTC_SESSION_CREATED,
      'SERVER',
      'server',
      {
        sessionId,
        teacherId: teacherSession.userId,
        deviceId,
        qualityTier,
        startedAt: activeStream.startedAt,
      },
    );
    if (typeof client?.emit === 'function') {
      client.emit(PacketType.WEBRTC_SESSION_CREATED, sessionCreated);
    }
    return sessionCreated;
  }

  @SubscribeMessage(PacketType.SCREEN_CAPTURE_STOP)
  async handleScreenCaptureStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<ScreenCaptureStopPayload>,
  ): Promise<ProtocolEnvelope<{ stopped: boolean }>> {
    const payload = envelope.payload;
    const sessionId = payload?.sessionId;

    if (sessionId) {
      await this.stopStreamInternal(sessionId, payload.reason || 'Detención manual solicitada por el usuario');
    }

    return createEnvelope(PacketType.SCREEN_CAPTURE_STOP, 'SERVER', 'server', { stopped: true });
  }

  // -------------------------------------------------------------
  // WEBRTC SIGNALING ROUTING (OFFER, ANSWER, ICE)
  // -------------------------------------------------------------
  @SubscribeMessage(PacketType.WEBRTC_OFFER)
  handleWebRtcOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<WebRtcOfferPayload>,
  ) {
    this.routeWebRtcOffer(client, envelope);
  }

  @SubscribeMessage(PacketType.SIGNAL_SDP_OFFER)
  handleSignalSdpOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<WebRtcOfferPayload>,
  ) {
    this.routeWebRtcOffer(client, envelope);
  }

  private routeWebRtcOffer(
    client: Socket,
    envelope: ProtocolEnvelope<WebRtcOfferPayload>,
  ) {
    const payload = envelope.payload;
    const sessionId = payload.sessionId;
    const stream = this.activeStreamSessions.get(sessionId);

    if (!stream) {
      this.logger.warn(`Offer SDP ignorado para sesión inexistente o finalizada: ${sessionId}`);
      return;
    }

    // If sent by Teacher -> forward to Agent
    if (client.id === stream.teacherSocketId) {
      const agentSocket = this.server?.sockets?.sockets?.get(stream.agentSocketId);
      if (agentSocket) {
        agentSocket.emit(PacketType.WEBRTC_OFFER, envelope);
        agentSocket.emit(PacketType.SIGNAL_SDP_OFFER, envelope);
      }
    } 
    // If sent by Agent -> forward to Teacher
    else if (client.id === stream.agentSocketId) {
      const teacherSocket = this.server?.sockets?.sockets?.get(stream.teacherSocketId);
      if (teacherSocket) {
        teacherSocket.emit(PacketType.WEBRTC_OFFER, envelope);
        teacherSocket.emit(PacketType.SIGNAL_SDP_OFFER, envelope);
      }
    }
  }

  @SubscribeMessage(PacketType.WEBRTC_ANSWER)
  handleWebRtcAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<WebRtcAnswerPayload>,
  ) {
    this.routeWebRtcAnswer(client, envelope);
  }

  @SubscribeMessage(PacketType.SIGNAL_SDP_ANSWER)
  handleSignalSdpAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<WebRtcAnswerPayload>,
  ) {
    this.routeWebRtcAnswer(client, envelope);
  }

  private routeWebRtcAnswer(
    client: Socket,
    envelope: ProtocolEnvelope<WebRtcAnswerPayload>,
  ) {
    const payload = envelope.payload;
    const sessionId = payload.sessionId;
    const stream = this.activeStreamSessions.get(sessionId);

    if (!stream) {
      this.logger.warn(`Answer SDP ignorado para sesión inexistente: ${sessionId}`);
      return;
    }

    // Forward to peer
    if (client.id === stream.agentSocketId) {
      const teacherSocket = this.server?.sockets?.sockets?.get(stream.teacherSocketId);
      if (teacherSocket) {
        teacherSocket.emit(PacketType.WEBRTC_ANSWER, envelope);
        teacherSocket.emit(PacketType.SIGNAL_SDP_ANSWER, envelope);
      }
    } else if (client.id === stream.teacherSocketId) {
      const agentSocket = this.server?.sockets?.sockets?.get(stream.agentSocketId);
      if (agentSocket) {
        agentSocket.emit(PacketType.WEBRTC_ANSWER, envelope);
        agentSocket.emit(PacketType.SIGNAL_SDP_ANSWER, envelope);
      }
    }
  }

  @SubscribeMessage(PacketType.WEBRTC_ICE_CANDIDATE)
  handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<WebRtcIceCandidatePayload>,
  ) {
    this.routeIceCandidate(client, envelope);
  }

  @SubscribeMessage(PacketType.SIGNAL_ICE_CANDIDATE)
  handleSignalIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<WebRtcIceCandidatePayload>,
  ) {
    this.routeIceCandidate(client, envelope);
  }

  private routeIceCandidate(
    client: Socket,
    envelope: ProtocolEnvelope<WebRtcIceCandidatePayload>,
  ) {
    const payload = envelope.payload;
    const sessionId = payload.sessionId;
    const stream = this.activeStreamSessions.get(sessionId);

    if (!stream) {
      return;
    }

    if (client.id === stream.teacherSocketId) {
      const agentSocket = this.server?.sockets?.sockets?.get(stream.agentSocketId);
      if (agentSocket) {
        agentSocket.emit(PacketType.WEBRTC_ICE_CANDIDATE, envelope);
        agentSocket.emit(PacketType.SIGNAL_ICE_CANDIDATE, envelope);
      }
    } else if (client.id === stream.agentSocketId) {
      const teacherSocket = this.server?.sockets?.sockets?.get(stream.teacherSocketId);
      if (teacherSocket) {
        teacherSocket.emit(PacketType.WEBRTC_ICE_CANDIDATE, envelope);
        teacherSocket.emit(PacketType.SIGNAL_ICE_CANDIDATE, envelope);
      }
    }
  }

  @SubscribeMessage(PacketType.WEBRTC_ERROR)
  handleWebRtcError(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<WebRtcErrorPayload>,
  ) {
    const payload = envelope.payload;
    this.logger.error(`Error WebRTC reportado por ${client.id}: [${payload.code}] ${payload.message}`);

    if (payload.sessionId) {
      const stream = this.activeStreamSessions.get(payload.sessionId);
      if (stream) {
        // Forward error to other side
        const targetSocketId = client.id === stream.teacherSocketId ? stream.agentSocketId : stream.teacherSocketId;
        const targetSocket = this.server?.sockets?.sockets?.get(targetSocketId);
        if (targetSocket) {
          targetSocket.emit(PacketType.WEBRTC_ERROR, envelope);
        }
        this.stopStreamInternal(payload.sessionId, `Error WebRTC: ${payload.message}`);
      }
    }
  }

  @SubscribeMessage(PacketType.SCREEN_CAPTURE_STATUS)
  handleScreenCaptureStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<ScreenCaptureStatusPayload>,
  ) {
    const payload = envelope.payload;
    const agentSession = this.connectedAgents.get(client.id);
    if (agentSession) {
      agentSession.isCapturing = payload.isCapturing;
    }

    if (payload.activeSessionId) {
      const stream = this.activeStreamSessions.get(payload.activeSessionId);
      if (stream) {
        const teacherSocket = this.server?.sockets?.sockets?.get(stream.teacherSocketId);
        if (teacherSocket) {
          teacherSocket.emit(PacketType.SCREEN_CAPTURE_STATUS, envelope);
        }
      }
    }
  }

  @SubscribeMessage(PacketType.SCREEN_STREAM_STATS)
  handleStreamStats(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<ScreenStreamStatsPayload>,
  ) {
    const payload = envelope.payload;
    if (payload.sessionId) {
      const stream = this.activeStreamSessions.get(payload.sessionId);
      if (stream) {
        const teacherSocket = this.server?.sockets?.sockets?.get(stream.teacherSocketId);
        if (teacherSocket) {
          teacherSocket.emit(PacketType.SCREEN_STREAM_STATS, envelope);
        }
      }
    }
  }

  // -------------------------------------------------------------
  // INTERNAL HELPERS & AUDIT TEARDOWN
  // -------------------------------------------------------------
  private async stopStreamInternal(sessionId: string, reason: string) {
    const stream = this.activeStreamSessions.get(sessionId);
    if (!stream) return;

    this.activeStreamSessions.delete(sessionId);

    const teacherSession = this.connectedTeachers.get(stream.teacherSocketId);
    if (teacherSession) {
      teacherSession.activeSessionIds.delete(sessionId);
    }

    // Notify agent to halt native capture immediately
    const agentSocket = this.server?.sockets?.sockets?.get(stream.agentSocketId);
    if (agentSocket) {
      agentSocket.emit(
        PacketType.SCREEN_CAPTURE_STOP,
        createEnvelope(PacketType.SCREEN_CAPTURE_STOP, 'SERVER', 'server', {
          teacherId: stream.teacherId,
          deviceId: stream.deviceId,
          sessionId,
          reason,
        }),
      );
      agentSocket.emit(
        PacketType.WEBRTC_SESSION_CLOSED,
        createEnvelope(PacketType.WEBRTC_SESSION_CLOSED, 'SERVER', 'server', {
          sessionId,
          teacherId: stream.teacherId,
          deviceId: stream.deviceId,
          reason,
          closedAt: Date.now(),
        }),
      );
    }

    // Notify teacher
    const teacherSocket = this.server?.sockets?.sockets?.get(stream.teacherSocketId);
    if (teacherSocket) {
      teacherSocket.emit(
        PacketType.WEBRTC_SESSION_CLOSED,
        createEnvelope(PacketType.WEBRTC_SESSION_CLOSED, 'SERVER', 'server', {
          sessionId,
          teacherId: stream.teacherId,
          deviceId: stream.deviceId,
          reason,
          closedAt: Date.now(),
        }),
      );
    }

    // Insert audit log
    if (this.databaseService.isDatabaseReady) {
      let actorUuid: string | null = null;
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stream.teacherId)) {
        try {
          const uRes = await this.databaseService.query('SELECT id FROM users WHERE id = $1', [stream.teacherId]);
          if (uRes.rows.length > 0) {
            actorUuid = stream.teacherId;
          }
        } catch {}
      }

      await this.databaseService.query(
        `INSERT INTO audit_logs (id, institution_id, actor_user_id, actor_role, action, entity_type, entity_id, details_json, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          randomUUID(),
          stream.institutionId,
          actorUuid,
          'TEACHER',
          'SCREEN_CAPTURE_STOP',
          'DEVICE',
          stream.deviceId,
          JSON.stringify({ sessionId, reason, durationMs: Date.now() - stream.startedAt }),
        ],
      ).catch(() => {});
    }

    this.logger.log(`Sesión de streaming ${sessionId} cerrada. Razón: ${reason}`);
  }

  public terminateDeviceStreams(deviceId: string, reason: string) {
    for (const [sessionId, stream] of this.activeStreamSessions.entries()) {
      if (stream.deviceId === deviceId) {
        this.stopStreamInternal(sessionId, reason);
      }
    }
  }

  // -------------------------------------------------------------
  // COMMAND DISPATCH & PEDAGOGICAL LOCK
  // -------------------------------------------------------------
  public sendCommandToDevice(
    deviceId: string,
    commandType: CommandType,
    params: Record<string, unknown> = {},
    issuerUserId?: string,
  ): boolean {
    const socketId = this.deviceToAgentSocket.get(deviceId);
    if (!socketId) {
      this.logger.warn(`No se pudo enviar ${commandType} a dispositivo ${deviceId}: agente no conectado`);
      return false;
    }

    const commandId = randomUUID();
    const envelope: ProtocolEnvelope<CommandDispatchPayload> = createEnvelope(
      PacketType.COMMAND_DISPATCH,
      'SERVER',
      'server',
      {
        commandId,
        commandType,
        issuedAt: Date.now(),
        params,
        requiresAck: true,
      },
    );

    if (this.databaseService.isDatabaseReady) {
      const issuer = issuerUserId || 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      this.databaseService.query(
        `INSERT INTO commands (id, device_id, issuer_user_id, command_type, status, issued_at, payload_json) 
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
        [commandId, deviceId, issuer, commandType, 'SENT', JSON.stringify(params)],
      ).catch((err) => this.logger.warn(`Error guardando comando en DB: ${err.message}`));
    }

    this.server.to(socketId).emit(PacketType.COMMAND_DISPATCH, envelope);
    this.server.to(socketId).emit('COMMAND_DISPATCH', envelope);
    this.logger.log(`Comando ${commandType} enviado a dispositivo ${deviceId} (Socket: ${socketId})`);
    return true;
  }

  @SubscribeMessage('TEACHER_LOCK_DEVICE')
  async handleTeacherLockDevice(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { deviceId: string; message?: string },
  ) {
    const teacherSession = this.connectedTeachers.get(client.id);
    if (!teacherSession) {
      return { success: false, error: 'Docente no autenticado' };
    }

    const { deviceId, message } = body;
    const sent = this.sendCommandToDevice(
      deviceId,
      CommandType.LOCK_SCREEN,
      {
        message: message || 'Atención al frente. La clase está en pausa pedagógica.',
        teacherName: teacherSession.email ? teacherSession.email.split('@')[0] : 'Docente',
        lockInput: true,
      },
      teacherSession.userId,
    );

    if (this.databaseService.isDatabaseReady) {
      await this.databaseService.query(
        'UPDATE devices SET status = $1 WHERE id = $2',
        [DeviceStatus.LOCKED, deviceId],
      ).catch(() => {});
    }

    this.server.emit('DEVICE_STATUS_CHANGED', { deviceId, status: DeviceStatus.LOCKED });
    return { success: sent };
  }

  @SubscribeMessage('TEACHER_UNLOCK_DEVICE')
  async handleTeacherUnlockDevice(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { deviceId: string },
  ) {
    const teacherSession = this.connectedTeachers.get(client.id);
    if (!teacherSession) {
      return { success: false, error: 'Docente no autenticado' };
    }

    const { deviceId } = body;
    const sent = this.sendCommandToDevice(
      deviceId,
      CommandType.UNLOCK_SCREEN,
      {
        teacherName: teacherSession.email ? teacherSession.email.split('@')[0] : 'Docente',
      },
      teacherSession.userId,
    );

    if (this.databaseService.isDatabaseReady) {
      await this.databaseService.query(
        'UPDATE devices SET status = $1 WHERE id = $2',
        [DeviceStatus.ONLINE, deviceId],
      ).catch(() => {});
    }

    this.server.emit('DEVICE_STATUS_CHANGED', { deviceId, status: DeviceStatus.ONLINE });
    return { success: sent };
  }

  @SubscribeMessage('TEACHER_LOCK_CLASSROOM')
  async handleTeacherLockClassroom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { classroomId?: string; message?: string },
  ) {
    const teacherSession = this.connectedTeachers.get(client.id);
    if (!teacherSession) {
      return { success: false, error: 'Docente no autenticado' };
    }

    const message = body?.message || 'Atención al frente. La clase está en pausa pedagógica.';
    let count = 0;

    for (const [deviceId, socketId] of this.deviceToAgentSocket.entries()) {
      this.sendCommandToDevice(
        deviceId,
        CommandType.LOCK_SCREEN,
        {
          message,
          teacherName: teacherSession.email ? teacherSession.email.split('@')[0] : 'Docente',
          lockInput: true,
        },
        teacherSession.userId,
      );
      if (this.databaseService.isDatabaseReady) {
        await this.databaseService.query(
          'UPDATE devices SET status = $1 WHERE id = $2',
          [DeviceStatus.LOCKED, deviceId],
        ).catch(() => {});
      }
      this.server.emit('DEVICE_STATUS_CHANGED', { deviceId, status: DeviceStatus.LOCKED });
      count++;
    }

    return { success: true, count };
  }

  @SubscribeMessage('TEACHER_UNLOCK_CLASSROOM')
  async handleTeacherUnlockClassroom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { classroomId?: string },
  ) {
    const teacherSession = this.connectedTeachers.get(client.id);
    if (!teacherSession) {
      return { success: false, error: 'Docente no autenticado' };
    }

    let count = 0;
    for (const [deviceId, socketId] of this.deviceToAgentSocket.entries()) {
      this.sendCommandToDevice(
        deviceId,
        CommandType.UNLOCK_SCREEN,
        {
          teacherName: teacherSession.email ? teacherSession.email.split('@')[0] : 'Docente',
        },
        teacherSession.userId,
      );
      if (this.databaseService.isDatabaseReady) {
        await this.databaseService.query(
          'UPDATE devices SET status = $1 WHERE id = $2',
          [DeviceStatus.ONLINE, deviceId],
        ).catch(() => {});
      }
      this.server.emit('DEVICE_STATUS_CHANGED', { deviceId, status: DeviceStatus.ONLINE });
      count++;
    }

    return { success: true, count };
  }

  @SubscribeMessage(PacketType.COMMAND_RESULT)
  @SubscribeMessage('COMMAND_RESULT')
  async handleCommandResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<CommandResultPayload>,
  ) {
    const payload = envelope?.payload;
    if (!payload?.commandId) return;

    if (this.databaseService.isDatabaseReady) {
      await this.databaseService.query(
        `UPDATE commands SET status = $1, executed_at = NOW(), result_json = $2, error_details = $3 WHERE id = $4`,
        [
          payload.success ? CommandStatus.EXECUTED : CommandStatus.FAILED,
          JSON.stringify(payload),
          payload.error || null,
          payload.commandId,
        ],
      ).catch(() => {});
    }

    this.logger.log(`Resultado de comando recibido: ${payload.commandId} (Éxito: ${payload.success})`);
  }

  // -------------------------------------------------------------
  // DUAL-PANE FILE TRANSFER & WORK COLLECTION (NetSupport parity)
  // -------------------------------------------------------------
  @SubscribeMessage('TEACHER_LIST_DIR')
  async handleTeacherListDir(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { deviceId: string; dirPath?: string },
  ) {
    const teacherSession = this.connectedTeachers.get(client.id);
    if (!teacherSession) return { success: false, error: 'Docente no autenticado' };

    const socketId = this.deviceToAgentSocket.get(body.deviceId);
    if (!socketId) return { success: false, error: 'Dispositivo no conectado' };

    const envelope = createEnvelope(
      PacketType.FILE_LIST_DIR,
      'SERVER',
      'server',
      {
        requestId: randomUUID(),
        deviceId: body.deviceId,
        dirPath: body.dirPath,
      },
    );
    this.server.to(socketId).emit(PacketType.FILE_LIST_DIR, envelope);
    this.server.to(socketId).emit('FILE_LIST_DIR', envelope);
    return { success: true };
  }

  @SubscribeMessage('FILE_LIST_DIR_RESULT')
  handleFileListDirResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<any>,
  ) {
    this.server.emit('FILE_LIST_DIR_RESULT', envelope?.payload || envelope);
  }

  @SubscribeMessage('TEACHER_SEND_FILE')
  async handleTeacherSendFile(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: {
      deviceId?: string;
      broadcastToAll?: boolean;
      fileName: string;
      fileSizeBytes: number;
      fileContentBase64: string;
      targetDir?: string;
    },
  ) {
    const teacherSession = this.connectedTeachers.get(client.id);
    if (!teacherSession) return { success: false, error: 'Docente no autenticado' };

    const transferId = randomUUID();
    const payload = {
      transferId,
      fileName: body.fileName,
      fileSizeBytes: body.fileSizeBytes,
      fileContentBase64: body.fileContentBase64,
      targetDir: body.targetDir,
    };

    const envelope = createEnvelope(PacketType.FILE_SEND, 'SERVER', 'server', payload);

    if (body.broadcastToAll) {
      let count = 0;
      for (const [devId, socketId] of this.deviceToAgentSocket.entries()) {
        this.server.to(socketId).emit(PacketType.FILE_SEND, envelope);
        this.server.to(socketId).emit('FILE_SEND', envelope);
        count++;
      }
      return { success: true, count, broadcast: true };
    } else if (body.deviceId) {
      const socketId = this.deviceToAgentSocket.get(body.deviceId);
      if (!socketId) return { success: false, error: 'Dispositivo no conectado' };
      this.server.to(socketId).emit(PacketType.FILE_SEND, envelope);
      this.server.to(socketId).emit('FILE_SEND', envelope);
      return { success: true, broadcast: false };
    }
    return { success: false, error: 'Destinatario no especificado' };
  }

  @SubscribeMessage('FILE_SEND_RESULT')
  handleFileSendResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<any>,
  ) {
    this.server.emit('FILE_SEND_RESULT', envelope?.payload || envelope);
  }

  @SubscribeMessage('TEACHER_COLLECT_FILE')
  async handleTeacherCollectFile(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { deviceId: string; filePath: string },
  ) {
    const teacherSession = this.connectedTeachers.get(client.id);
    if (!teacherSession) return { success: false, error: 'Docente no autenticado' };

    const socketId = this.deviceToAgentSocket.get(body.deviceId);
    if (!socketId) return { success: false, error: 'Dispositivo no conectado' };

    const envelope = createEnvelope(
      PacketType.FILE_COLLECT,
      'SERVER',
      'server',
      {
        collectId: randomUUID(),
        deviceId: body.deviceId,
        filePath: body.filePath,
      },
    );
    this.server.to(socketId).emit(PacketType.FILE_COLLECT, envelope);
    this.server.to(socketId).emit('FILE_COLLECT', envelope);
    return { success: true };
  }

  @SubscribeMessage('FILE_COLLECT_RESULT')
  handleFileCollectResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<any>,
  ) {
    this.server.emit('FILE_COLLECT_RESULT', envelope?.payload || envelope);
  }

  // -------------------------------------------------------------
  // PROCESS & APPLICATION MONITORING AND RESTRICTION
  // -------------------------------------------------------------
  @SubscribeMessage('TEACHER_REQUEST_PROCESSES')
  async handleTeacherRequestProcesses(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { deviceId: string },
  ) {
    const teacherSession = this.connectedTeachers.get(client.id);
    if (!teacherSession) return { success: false, error: 'Docente no autenticado' };

    const socketId = this.deviceToAgentSocket.get(body.deviceId);
    if (!socketId) return { success: false, error: 'Dispositivo no conectado' };

    const envelope = createEnvelope(PacketType.PROCESS_LIST_REQUEST, 'SERVER', 'server', {
      deviceId: body.deviceId,
    });
    this.server.to(socketId).emit(PacketType.PROCESS_LIST_REQUEST, envelope);
    this.server.to(socketId).emit('PROCESS_LIST_REQUEST', envelope);
    return { success: true };
  }

  @SubscribeMessage('PROCESS_LIST_RESULT')
  handleProcessListResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<any>,
  ) {
    this.server.emit('PROCESS_LIST_RESULT', envelope?.payload || envelope);
  }

  @SubscribeMessage('TEACHER_KILL_PROCESS')
  async handleTeacherKillProcess(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { deviceId: string; pid?: number; processName?: string; bundleId?: string },
  ) {
    const teacherSession = this.connectedTeachers.get(client.id);
    if (!teacherSession) return { success: false, error: 'Docente no autenticado' };

    const socketId = this.deviceToAgentSocket.get(body.deviceId);
    if (!socketId) return { success: false, error: 'Dispositivo no conectado' };

    const envelope = createEnvelope(PacketType.KILL_PROCESS, 'SERVER', 'server', {
      deviceId: body.deviceId,
      pid: body.pid,
      processName: body.processName,
      bundleId: body.bundleId,
    });
    this.server.to(socketId).emit(PacketType.KILL_PROCESS, envelope);
    this.server.to(socketId).emit('KILL_PROCESS', envelope);
    return { success: true };
  }

  @SubscribeMessage('KILL_PROCESS_RESULT')
  handleKillProcessResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: ProtocolEnvelope<any>,
  ) {
    this.server.emit('KILL_PROCESS_RESULT', envelope?.payload || envelope);
  }

  // -------------------------------------------------------------
  // INTERACTIVE REMOTE CONTROL (MOUSE & KEYBOARD INJECTION)
  // -------------------------------------------------------------
  @SubscribeMessage('TEACHER_REMOTE_INPUT')
  handleTeacherRemoteInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: {
      deviceId: string;
      type: string;
      x?: number;
      y?: number;
      button?: string;
      keyCode?: number;
      keyText?: string;
    },
  ) {
    const teacherSession = this.connectedTeachers.get(client.id);
    if (!teacherSession) return;

    const socketId = this.deviceToAgentSocket.get(body.deviceId);
    if (!socketId) return;

    const envelope = createEnvelope(PacketType.REMOTE_INPUT_EVENT, 'SERVER', 'server', body);
    this.server.to(socketId).emit(PacketType.REMOTE_INPUT_EVENT, envelope);
    this.server.to(socketId).emit('REMOTE_INPUT_EVENT', envelope);
  }

  // -------------------------------------------------------------
  // R0 AUTHORIZATION & ISOLATION HELPERS
  // -------------------------------------------------------------
  private isSuperAdmin(role?: string): boolean {
    return typeof role === 'string' && role.toUpperCase() === SystemRole.SUPERADMIN;
  }

  /** Validates that a classroom exists and belongs to the institution (fails closed). */
  private async validateClassroomForInstitution(
    classroomId: string,
    institutionId: string,
    role?: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (typeof classroomId !== 'string' || !UUID_PATTERN.test(classroomId)) {
      return { ok: false, error: 'Identificador de aula inválido' };
    }
    if (!this.databaseService.isDatabaseReady) {
      return { ok: false, error: 'Base de datos no disponible: no se puede validar el aula' };
    }
    const res = await this.databaseService.query(
      'SELECT id, institution_id FROM classrooms WHERE id = $1',
      [classroomId],
    );
    if (res.rows.length === 0) {
      return { ok: false, error: 'Aula no encontrada' };
    }
    if (res.rows[0].institution_id !== institutionId && !this.isSuperAdmin(role)) {
      return { ok: false, error: 'Violación de aislamiento institucional: el aula pertenece a otra institución' };
    }
    return { ok: true };
  }

  private checkStaleConnections() {
    const now = Date.now();
    const TIMEOUT_MS = 35000;

    for (const [socketId, session] of this.connectedAgents.entries()) {
      if (now - session.lastHeartbeatAt > TIMEOUT_MS) {
        this.logger.warn(`Conexión perdida por timeout de latido (>35s): ${session.hostname}`);
        if (session.deviceId) {
          this.deviceToAgentSocket.delete(session.deviceId);
          this.terminateDeviceStreams(session.deviceId, 'Timeout de latido LAN');
          if (this.databaseService.isDatabaseReady) {
            this.databaseService.query(
              'UPDATE devices SET status = $1, updated_at = NOW() WHERE id = $2',
              [DeviceStatus.OFFLINE, session.deviceId],
            ).catch(() => {});
          }
        }
        this.connectedAgents.delete(socketId);
        const socket = this.server?.sockets?.sockets?.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      }
    }
  }

  getConnectedCount(): number {
    return this.connectedAgents.size;
  }

  getActiveStreamsCount(): number {
    return this.activeStreamSessions.size;
  }
}
