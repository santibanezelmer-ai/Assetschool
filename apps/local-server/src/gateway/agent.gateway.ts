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
import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  PacketType,
  ProtocolEnvelope,
  createEnvelope,
  AgentHelloPayload,
  ServerHelloAckPayload,
  CapabilitiesReportPayload,
} from '@assetschool/protocol';
import { DatabaseService } from '../database/database.service';
import { DeviceStatus } from '@assetschool/shared-types';
import { randomBytes } from 'crypto';

interface AuthenticatedAgentSession {
  socketId: string;
  hostname: string;
  deviceId?: string;
  macAddress: string;
  sessionToken: string;
  authenticatedAt: number;
  lastHeartbeatAt: number;
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
  private heartbeatIntervalTimer: NodeJS.Timeout | null = null;

  constructor(private readonly databaseService: DatabaseService) {
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
    const session = this.connectedAgents.get(client.id);
    if (session) {
      this.logger.warn(`Agente desconectado: ${session.hostname} (Device: ${session.deviceId || 'N/A'})`);
      if (session.deviceId && this.databaseService.isDatabaseReady) {
        this.databaseService.query(
          'UPDATE devices SET status = $1, updated_at = NOW() WHERE id = $2',
          [DeviceStatus.OFFLINE, session.deviceId],
        ).catch(() => {});
      }
      this.connectedAgents.delete(client.id);
    }
  }

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

    // Check device status and revocation in database
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

        // Set device online
        await this.databaseService.query(
          'UPDATE devices SET status = $1, last_heartbeat_at = NOW(), local_ip = $2 WHERE id = $3',
          [DeviceStatus.ONLINE, payload.localIp || '127.0.0.1', deviceId],
        );
      }
    }

    // Generate cryptographic session token for this socket connection
    const sessionToken = `ses_${randomBytes(24).toString('hex')}`;

    this.connectedAgents.set(client.id, {
      socketId: client.id,
      hostname: payload.hostname,
      deviceId,
      macAddress: payload.macAddress,
      sessionToken,
      authenticatedAt: Date.now(),
      lastHeartbeatAt: Date.now(),
    });

    this.logger.log(`Handshake exitoso: ${payload.hostname} (${payload.osType}) - Token emitido.`);

    return createEnvelope(
      PacketType.SERVER_HELLO_ACK,
      'SERVER',
      'server',
      {
        serverTime: Date.now(),
        serverVersion: '1.0.0-phase1.1',
        institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        isEnrolled,
        assignedDeviceId: deviceId,
        sessionToken,
        heartbeatIntervalMs: 15000,
      },
    );
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

  private checkStaleConnections() {
    const now = Date.now();
    const TIMEOUT_MS = 35000; // 35 seconds timeout (expected heartbeat every 15s)

    for (const [socketId, session] of this.connectedAgents.entries()) {
      if (now - session.lastHeartbeatAt > TIMEOUT_MS) {
        this.logger.warn(`Conexión perdida por timeout de latido (>35s): ${session.hostname}`);
        if (session.deviceId && this.databaseService.isDatabaseReady) {
          this.databaseService.query(
            'UPDATE devices SET status = $1, updated_at = NOW() WHERE id = $2',
            [DeviceStatus.OFFLINE, session.deviceId],
          ).catch(() => {});
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
}
